---
name: cloudflare-tunnel
description: 使用 Cloudflare Tunnel 将本地端口映射到外网固定域名。解决 localtunnel/ngrok/serveo 等方案的验证页面、URL 不稳定等问题。适用于开发阶段将本地后端 API 暴露给移动 APP 测试。
metadata:
  category: devops
  tags: [tunnel, proxy, cloudflare, localhost, mobile-testing]
  requires:
    commands: [cloudflared]
    accounts: [Cloudflare]
---

# Cloudflare Tunnel — 本地端口外网映射

将本地开发服务通过 Cloudflare Tunnel 暴露到外网固定域名，供移动 APP 等外部客户端访问测试。

## 为什么选 Cloudflare Tunnel

| 方案 | 验证页面 | URL 稳定性 | 免费 | 推荐 |
|------|---------|-----------|------|------|
| **localtunnel** | ❌ 需要浏览器点击验证 | 每次重启变 | ✅ | 不推荐 |
| **ngrok** | ✅ 无 | 付费版固定 | 有限制 | 备选 |
| **serveo** | ❌ 有验证页 | 不稳定 | ✅ | 不推荐 |
| **Cloudflare Tunnel** | ✅ 无 | ✅ 固定域名 | ✅ 完全免费 | **首选** |

## 前置条件

1. **Cloudflare 账号**（免费注册: https://dash.cloudflare.com/sign-up）
2. **域名 DNS 托管在 Cloudflare**（将域名的 NS 记录指向 Cloudflare）
3. **cloudflared CLI**（安装: `brew install cloudflared` 或从 GitHub Releases 下载）

## 初始设置

### 1. 登录 cloudflared

```bash
cloudflared tunnel login
```

打开输出的 URL，在浏览器中选择要使用的域名授权。证书会自动下载到 `~/.cloudflared/cert.pem`。

### 2. 创建命名隧道

```bash
cloudflared tunnel create <tunnel-name>
```

示例：
```bash
cloudflared tunnel create lingxi
# → Created tunnel lingxi with id 72e64688-c8a6-4c05-9a3f-af1a959a26bc
```

隧道凭证保存到 `~/.cloudflared/<tunnel-id>.json`，**请勿泄露此文件**。

### 3. 配置 ingress 规则

创建 `~/.cloudflared/config.yml`：

```yaml
tunnel: <tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: <subdomain>.<your-domain>
    service: http://localhost:<port>
  - service: http_status:404   # 兜底规则
```

示例：
```yaml
tunnel: 72e64688-c8a6-4c05-9a3f-af1a959a26bc
credentials-file: /home/zxq/.cloudflared/72e64688-c8a6-4c05-9a3f-af1a959a26bc.json

ingress:
  - hostname: lingxi.chataifree.eu.org
    service: http://localhost:3001
  - service: http_status:404
```

**ingress 规则说明**：
- 按顺序匹配 `hostname`，命中后不再继续
- 最后一条 `http_status:404` 是兜底规则，拦截未匹配的请求
- 可配置多个 `hostname` 映射不同端口的服务

### 4. 配置 DNS 记录

```bash
cloudflared tunnel route dns <tunnel-name> <subdomain>.<your-domain>
```

示例：
```bash
cloudflared tunnel route dns lingxi lingxi.chataifree.eu.org
# → Added CNAME lingxi.chataifree.eu.org which will route to this tunnel
```

这会在你的 Cloudflare DNS 中自动添加一条 CNAME 记录，指向隧道。

### 5. 启动隧道

```bash
# 基本方式（前台运行）
cloudflared tunnel run lingxi

# 后台运行
nohup cloudflared tunnel run lingxi > /tmp/lingxi-tunnel.log 2>&1 &
```

### 6. 验证

```bash
curl https://<subdomain>.<your-domain>/api/health
```

## 开机自启（Systemd）

### WSL2 环境

确保 `/etc/wsl.conf` 中启用了 systemd：
```ini
[boot]
systemd=true
```

启用用户 linger（WSL 启动时自动拉起用户服务）：
```bash
loginctl enable-linger
```

### 创建服务文件

`~/.config/systemd/user/lingxi-tunnel.service`：

```ini
[Unit]
Description=灵犀伴学 - Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<user>
ExecStart=/home/<user>/.local/bin/cloudflared --no-autoupdate tunnel run lingxi
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

启用并启动：
```bash
systemctl --user daemon-reload
systemctl --user enable lingxi-tunnel.service
systemctl --user start lingxi-tunnel.service
systemctl --user status lingxi-tunnel.service
```

查看日志：
```bash
journalctl --user -u lingxi-tunnel.service -f
```

## 管理脚本

项目中的 `scripts/start-lingxi.sh` 提供了一键管理后端服务 + 隧道的功能：

```bash
./scripts/start-lingxi.sh start     # 启动后端 + 隧道
./scripts/start-lingxi.sh stop      # 停止所有
./scripts/start-lingxi.sh status    # 查看状态
./scripts/start-lingxi.sh restart   # 重启
```

脚本特性：
- 自动检测端口占用，不会重复启动
- 等待服务就绪后再报告状态
- 支持识别非脚本管理的现有进程

## 生产环境 vs 开发环境

### 开发环境（本文档方案）
- Quick tunnel 或 named tunnel
- 直接暴露 `localhost`
- 适合本地测试、移动 APP 联调

### 生产环境
- Named tunnel + Cloudflare Zero Trust
- 可添加 Access 认证（OAuth、SAML）
- 配置负载均衡、健康检查
- 文档: https://developers.cloudflare.com/cloudflare-one/

## 常见问题

### QUIC 连接失败
```
ERR Failed to dial a quic connection error="CRYPTO_ERROR 0x178 ... tls: no application protocol"
```

部分网络环境（如 WSL2）QUIC 协议可能不稳定。解决方案：
- 在 `config.yml` 中指定 `protocol: http2`
- 或在命令行添加 `--protocol http2`

### 隧道断连
Cloudflare Tunnel 内置自动重连机制。如果是 systemd 管理的服务，还会在进程退出后自动重启（`Restart=always`）。

### 验证页面（localtunnel 常见问题）
Cloudflare Tunnel **不存在**这个问题。API 请求直接返回 JSON，无需浏览器验证。

### 多服务代理
在 ingress 中配置多条规则即可：

```yaml
ingress:
  - hostname: api.example.com
    service: http://localhost:3001
  - hostname: admin.example.com
    service: http://localhost:3002
  - service: http_status:404
```

### 删除隧道
```bash
cloudflared tunnel delete <tunnel-name>
# 同时删除 DNS 记录
cloudflared tunnel route dns <tunnel-name> <hostname> --overwrite-dns
```

## 参考文件

- `references/start-lingxi.sh` — 管理脚本（项目内版本在 `scripts/`）
- `references/lingxi-tunnel.service` — Systemd 服务示例
- `references/lingxi-backend.service` — 后端 Systemd 服务示例
- `references/cloudflared-config.yml` — cloudflared 配置示例
