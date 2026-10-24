#!/usr/bin/env bash
#
# create-amd-micro.sh — one-shot creation of an Oracle Always Free AMD micro
# (VM.Standard.E2.1.Micro: 1/8 OCPU, 1 GB RAM, x86_64).
#
# Unlike ARM A1.Flex, this shape almost always has capacity, so there is no
# retry loop: try each Availability Domain once, in order, stop at first success.
#
# Typical uses:
#   - A permanent home for oci-arm-catcher (it keeps hunting ARM capacity 24/7
#     without your PC running WSL)
#   - A bastion / backup box when your ARM instance gets reclaimed
#
# Prerequisites:
#   - OCI CLI installed:  pip install oci-cli
#   - Config created:     oci setup config   (creates ~/.oci/config)
#
# Usage:
#   ./create-amd-micro.sh                  # name defaults to amd-micro-1
#   ./create-amd-micro.sh my-jumpbox       # custom display name
#   ./create-amd-micro.sh --yes            # non-interactive (skip confirmations)
#   ./create-amd-micro.sh --no-web-ports   # don't open 80/443 in the security list
#   ./create-amd-micro.sh --boot-size 100  # boot volume in GB (default 50)
#
# Values come from ./.env when present (same file as oci-arm-catcher):
#   COMPARTMENT_ID, AVAILABILITY_DOMAIN(S), SUBNET_ID, IMAGE_ID, SSH_KEY_FILE
# Anything missing is discovered automatically via the OCI API (read-only).

set -euo pipefail

# ─── ARGS ─────────────────────────────────────────────────────────────────────

INSTANCE_NAME="amd-micro-1"
ASSUME_YES=0
OPEN_WEB=1
BOOT_SIZE=50

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)        ASSUME_YES=1; shift ;;
        --no-web-ports)  OPEN_WEB=0; shift ;;
        --boot-size)     BOOT_SIZE="${2:?--boot-size needs a number}"; shift 2 ;;
        -h|--help)       grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*)              echo "Unknown option: $1" >&2; exit 1 ;;
        *)               INSTANCE_NAME="$1"; shift ;;
    esac
done

# ─── HELPERS ──────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${CREATE_AMD_MICRO_ENV:-$SCRIPT_DIR/.env}"

say()  { printf '%s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*" >&2; }
die()  { printf 'Error: %s\n' "$*" >&2; exit 1; }

confirm() {
    local prompt="$1"
    if [[ $ASSUME_YES -eq 1 ]]; then return 0; fi
    if [[ -t 0 ]]; then
        read -r -p "$prompt [y/N] " reply
        [[ "$reply" =~ ^[Yy]$ ]]
    else
        return 0   # non-interactive (piped, CI): proceed
    fi
}

ociq() {  # ociq <query> <raw-output?>
    local q="$1" raw="${2:-1}"
    if [[ "$raw" == "1" ]]; then
        oci "$@" --query "$q" --raw-output
    else
        oci "$@" --query "$q"
    fi
}

# ─── PREREQUISITES ────────────────────────────────────────────────────────────

command -v oci >/dev/null 2>&1 || die "'oci' CLI not found.
Install it (Ubuntu/WSL):  pip install oci-cli
Then run:                 oci setup config"
command -v python3 >/dev/null 2>&1 || die "python3 is required (it ships with the OCI CLI)."

# Optional config overrides (never fatal).
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    say "Loaded config: $ENV_FILE"
else
    say "No .env found — discovering everything from the OCI API."
fi

# ─── DISCOVER CONFIG (only what is missing) ───────────────────────────────────

COMPARTMENT_ID="${COMPARTMENT_ID:-}"
if [[ -z "$COMPARTMENT_ID" ]]; then
    say "→ Finding your tenancy OCID..."
    COMPARTMENT_ID=$(oci iam compartment list --all 2>/dev/null \
        | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["data"][0]["compartment-id"])' 2>/dev/null || true)
    [[ -n "$COMPARTMENT_ID" ]] || die "Could not resolve the tenancy OCID. Run: oci setup config"
fi

SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/id_ed25519.pub}"
if [[ ! -f "$SSH_KEY_FILE" ]]; then
    say "→ Generating an ed25519 SSH key at ${SSH_KEY_FILE%.pub} ..."
    mkdir -p "$(dirname "$SSH_KEY_FILE")"
    ssh-keygen -t ed25519 -N "" -f "${SSH_KEY_FILE%.pub}" -C "oci-amd-micro"
fi
[[ -f "$SSH_KEY_FILE" ]] || die "SSH public key not found: $SSH_KEY_FILE"

# Availability domains: rotate through all of them, in order.
declare -a ADS=()
if [[ -n "${AVAILABILITY_DOMAINS:-}" ]]; then
    IFS=',' read -ra _raw <<< "$AVAILABILITY_DOMAINS"
    for ad in "${_raw[@]}"; do ad="$(echo "$ad" | xargs)"; [[ -n "$ad" ]] && ADS+=("$ad"); done
elif [[ -n "${AVAILABILITY_DOMAIN:-}" ]]; then
    ADS+=("$AVAILABILITY_DOMAIN")
fi
if [[ ${#ADS[@]} -eq 0 ]]; then
    say "→ Listing Availability Domains..."
    mapfile -t ADS < <(oci iam availability-domain list --query "data[*].name" --raw-output 2>/dev/null || true)
    [[ ${#ADS[@]} -gt 0 ]] || die "No Availability Domains found. Is 'oci setup config' done?"
fi

SUBNET_ID="${SUBNET_ID:-}"
if [[ -z "$SUBNET_ID" ]]; then
    say "→ Looking for a public subnet..."
    SUBNET_ID=$(oci network subnet list --compartment-id "$COMPARTMENT_ID" --all 2>/dev/null \
        | python3 -c '
import sys, json
subs = json.load(sys.stdin).get("data", [])
public = [s for s in subs if s.get("prohibit-public-ip-on-vnic") is False]
pick = (public or subs)[0] if (public or subs) else None
print(pick["id"] if pick else "")' 2>/dev/null || true)
    [[ -n "$SUBNET_ID" ]] || die "No subnet found in compartment $COMPARTMENT_ID."
    say "  subnet: $SUBNET_ID"
fi

IMAGE_ID="${IMAGE_ID:-}"
if [[ -z "$IMAGE_ID" ]]; then
    say "→ Finding the latest Ubuntu 24.04 x86_64 image..."
    IMAGE_ID=$(oci compute image list \
        --compartment-id "$COMPARTMENT_ID" \
        --operating-system "Canonical Ubuntu" \
        --shape "VM.Standard.E2.1.Micro" \
        --sort-by TIMECREATED --sort-order DESC --all 2>/dev/null \
        | python3 -c '
import sys, json
imgs = json.load(sys.stdin).get("data", [])
for i in imgs:
    n = i.get("display-name", "")
    if "24.04" in n and "aarch64" not in n.lower():
        print(i["id"]); break' 2>/dev/null || true)
    [[ -n "$IMAGE_ID" ]] || die "No Ubuntu 24.04 x86_64 image found for this shape."
    say "  image:  $IMAGE_ID"
fi

# ─── PRE-FLIGHT SUMMARY ───────────────────────────────────────────────────────

say ""
say "════════════════════════════════════════════════"
say " About to create (Always Free, $0):"
say "   name:       $INSTANCE_NAME"
say "   shape:      VM.Standard.E2.1.Micro (1/8 OCPU, 1 GB, x86_64)"
say "   boot vol:   ${BOOT_SIZE} GB"
say "   region:     $(oci iam region-subscription list --query "data[0].\"region-name\"" --raw-output 2>/dev/null || echo '?')"
say "   ADs:        ${ADS[*]}"
say "   subnet:     $SUBNET_ID"
say "   ssh key:    $SSH_KEY_FILE"
say "════════════════════════════════════════════════"
say ""

# Warn about existing micro instances (Always Free allows 2, ~1 OCPU total).
EXISTING=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --all 2>/dev/null \
    | python3 -c '
import sys, json
d = json.load(sys.stdin).get("data", [])
micros = [i for i in d if i.get("shape") == "VM.Standard.E2.1.Micro" and i.get("lifecycle-state") in ("RUNNING","PROVISIONING","STARTING")]
for m in micros: print("  " + m["display-name"] + "  (" + m["lifecycle-state"] + ")")
print(len(micros))' 2>/dev/null || echo 0)
MICRO_COUNT=$(printf '%s\n' "$EXISTING" | tail -1)
if [[ "${MICRO_COUNT:-0}" -gt 0 ]]; then
    warn "You already have $MICRO_COUNT AMD micro instance(s):"
    printf '%s\n' "$EXISTING" | head -n -1
    say   "Always Free allows up to 2 micro instances (~1 OCPU total)."
    confirm "Create another one anyway?" || { say "Aborted."; exit 0; }
fi

# ─── LAUNCH ───────────────────────────────────────────────────────────────────

launch_in_ad() {
    local ad="$1"
    oci compute instance launch \
        --compartment-id        "$COMPARTMENT_ID" \
        --availability-domain   "$ad" \
        --display-name          "$INSTANCE_NAME" \
        --shape                 "VM.Standard.E2.1.Micro" \
        --image-id              "$IMAGE_ID" \
        --subnet-id             "$SUBNET_ID" \
        --ssh-authorized-keys-file "$SSH_KEY_FILE" \
        --assign-public-ip      true \
        --boot-volume-size-in-gbs "$BOOT_SIZE" \
        --connection-timeout    60 \
        --read-timeout          120 \
        --no-retry \
        --wait-for-state        RUNNING \
        --max-wait-seconds      300
}

INSTANCE_ID=""
CREATED_AD=""
for ad in "${ADS[@]}"; do
    say "→ Creating instance in $ad ..."
    TMPOUT=$(mktemp)
    if launch_in_ad "$ad" >"$TMPOUT" 2>&1; then
        INSTANCE_ID=$(python3 -c 'import sys,json; print(json.load(open(sys.argv[1]))["data"]["id"])' "$TMPOUT" 2>/dev/null || true)
        CREATED_AD="$ad"
        rm -f "$TMPOUT"
        break
    fi
    rm -f "$TMPOUT"
    warn "$ad failed — showing error and trying the next AD."
    launch_in_ad "$ad" 2>&1 | tail -3 || true
    INSTANCE_ID=""
done

[[ -n "$INSTANCE_ID" ]] || die "Could not create the instance in any AD. The error above explains why (e.g. LimitExceeded = you hit the free allowance; Out of capacity = try another region later)."

say ""
say "✅ Instance is RUNNING: $INSTANCE_ID"
say "   AD: $CREATED_AD"

# ─── PUBLIC IP & SSH INFO ─────────────────────────────────────────────────────

PUBLIC_IP=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" 2>/dev/null \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"][0].get("public-ip") or "")' 2>/dev/null || true)

say ""
if [[ -n "$PUBLIC_IP" ]]; then
    say "Public IP: $PUBLIC_IP"
    say "SSH in:    ssh -i ${SSH_KEY_FILE%.pub} ubuntu@$PUBLIC_IP"
else
    say "Public IP not available yet — check the console in a minute, or run:"
    say "  oci compute instance list-vnics --instance-id $INSTANCE_ID"
fi

# ─── OPEN 80/443 (best-effort, never fatal) ───────────────────────────────────

if [[ $OPEN_WEB -eq 1 ]]; then
    say ""
    say "→ Opening 80/443 in the security list (best-effort)..."
    VCN_ID=$(oci network subnet get --subnet-id "$SUBNET_ID" 2>/dev/null \
        | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["vcn-id"])' 2>/dev/null || true)
    SL_ID=$(oci network security-list list --compartment-id "$COMPARTMENT_ID" ${VCN_ID:+--vcn-id "$VCN_ID"} --all 2>/dev/null \
        | python3 -c 'import sys,json; d=json.load(sys.stdin).get("data",[]); print(d[0]["id"] if d else "")' 2>/dev/null || true)
    if [[ -n "$SL_ID" ]]; then
        if python3 - "$SL_ID" <<'PYEOF' >/dev/null 2>&1
import json, subprocess, sys

sl_id = sys.argv[1]

def run(args):
    return json.loads(subprocess.run(args, capture_output=True, text=True).stdout or "{}")

data = run(["oci", "network", "security-list", "get", "--security-list-id", sl_id]).get("data", {})
rules = data.get("ingressSecurityRules") or []

def open(port):
    for r in rules:
        tcp = r.get("tcpOptions")
        if tcp:
            rng = tcp.get("destinationPortRange") or {}
            if rng.get("min") == port and rng.get("max") == port and r.get("source") == "0.0.0.0/0":
                return True
    return False

added = False
for port, desc in ((80, "Allow HTTP"), (443, "Allow HTTPS")):
    if not open(port):
        rules.append({
            "description": desc,
            "icmpOptions": None,
            "isStateless": False,
            "protocol": "6",
            "source": "0.0.0.0/0",
            "sourceType": "CIDR_BLOCK",
            "tcpOptions": {"destinationPortRange": {"max": port, "min": port}},
        })
        added = True

if added:
    with open("/tmp/.amd-micro-sl.json", "w") as f:
        json.dump(rules, f)
    r = subprocess.run(["oci", "network", "security-list", "update",
                        "--security-list-id", sl_id,
                        "--security-rules", "file:///tmp/.amd-micro-sl.json", "--force"],
                       capture_output=True, text=True)
    sys.exit(0 if r.returncode == 0 else 1)
sys.exit(0)
PYEOF
        then
            say "   80/443 opened. (SSH 22 is open by default in the default security list.)"
        else
            warn "Could not update the security list automatically."
            say   "   Do it in the console: Networking → VCNs → Security Lists → Add Ingress Rules for TCP 80 and 443 (source 0.0.0.0/0)."
        fi
    else
        warn "Security list not found — add 80/443 manually in the console if you need web access."
    fi
fi

# ─── NEXT STEPS ───────────────────────────────────────────────────────────────

cat <<EOF

════════════════════════════════════════════════
 Next steps
════════════════════════════════════════════════

1) Inside the box (1 GB RAM — keep it light):
   sudo apt update && sudo apt install -y curl git
   sudo ufw allow 22,80,443/tcp && sudo ufw enable

2) Install the OCI CLI + catcher so this box hunts ARM capacity 24/7:
   pip install oci-cli && oci setup config   # copy your ~/.oci/config over
   git clone <this repo> && cd tools/oracle-arm-catcher
   cp .env.example .env                        # reuse the values you just used
   tmux new -s catcher
   ./oci-arm-catcher.sh                        # Ctrl-b d to detach

3) The box stays above the 20% idle-reclaim threshold while catcher runs,
   so it doubles as your anti-reclaim keepalive.

4) When ARM A1 (2 OCPU / 12 GB) arrives, deploy the real stack there:
   curl -fsSL https://get.docker.com | sudo sh
   docker compose -f docker-compose.prod.yml up -d
   ...and remember: poetry.db must be generated first
   (node scripts/import-poetry-data.js) — see docs.

5) Budget check (Always Free block storage is 200 GB total):
   this micro: ${BOOT_SIZE} GB   +   planned ARM boot vol: ~100 GB   →  still within quota.

════════════════════════════════════════════════
EOF
