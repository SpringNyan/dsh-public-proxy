# dsh-public-proxy

[![npm version](https://img.shields.io/npm/v/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![npm downloads](https://img.shields.io/npm/dm/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![License](https://img.shields.io/npm/l/dsh-public-proxy.svg)](https://github.com/SpringNyan/dsh-public-proxy/blob/main/LICENSE)

一个 DeepSeek Harness 插件，用于将 DSH Web UI 暴露给局域网访问。

## 安装

```sh
dsh plugin --profile web add dsh-public-proxy@latest
```

## 使用方法

插件运行后，默认会在 **3081** 端口监听。局域网内的其他设备可以通过以下地址访问 Web UI：

```
http://<本机局域网IP>:3081
```

例如 `http://192.168.1.100:3081`

## 配置

可以在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中配置参数（以下为默认值）：

```yaml
- id: public-proxy
  config:
    host: "0.0.0.0"
    port: 3081
    applyRandomUuidPatch: true
    applyLoopbackCheckPatch: true
    accessKey: ""
    enableCookieAuth: false
```

### 访问控制

默认情况下，代理不启用访问控制，局域网内任何人都可以访问。如果你需要保护代理，可以启用 Cookie 认证：

```yaml
- id: public-proxy
  config:
    # ... 其他配置
    accessKey: "your-secret-key"
    enableCookieAuth: true
```

启用后，访问代理时会要求输入访问密钥。密钥通过 Cookie 存储，当前会话内无需重复输入。

**注意：** 由于代理使用 HTTP 明文传输，访问密钥可能被网络监听者截获。仅在可信任的局域网环境中使用。

## 安全警告

DSH 本身拒绝绑定 `0.0.0.0`，会返回以下官方错误：

> `error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead`

本插件有意绕过此限制以实现局域网访问。监听 `0.0.0.0` 会将 Web UI 暴露给整个网络 —— 网络中的任何人都可以访问该机器。请仅在可信任的局域网中启用此功能，切勿将代理直接暴露到公网。

## 许可证

MIT — 详见 [LICENSE](LICENSE)。
