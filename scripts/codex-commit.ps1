param(
  [Parameter(Mandatory = $false)]
  [string]$Message = "chore: commit Codex task changes"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$changes = git status --porcelain
if (-not $changes) {
  Write-Host "No changes to commit."
  exit 0
}

git add -A
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$shortHash = git rev-parse --short HEAD
Write-Host "Committed as $shortHash"
