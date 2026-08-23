# dsh-public-proxy

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

可以在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中配置选项：

```yaml
- id: public-proxy
  config:
    host: "0.0.0.0"
    port: 3081
    applyRandomUuidPatch: true
    applyLoopbackCheckPatch: true
```

## 安全警告

DSH 本身拒绝绑定 `0.0.0.0`，会返回以下官方错误：

> `error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead`

本插件有意绕过此限制以实现局域网访问。监听 `0.0.0.0` 会将 Web UI 暴露给整个网络 —— 网络中的任何人都可以访问该机器。请仅在可信任的局域网中启用此功能，切勿将代理直接暴露到公网。

## 许可证

MIT — 详见 [LICENSE](LICENSE)。
