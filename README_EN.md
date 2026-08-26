# dsh-public-proxy

[![npm version](https://img.shields.io/npm/v/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![npm downloads](https://img.shields.io/npm/dm/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![License](https://img.shields.io/npm/l/dsh-public-proxy.svg)](https://github.com/SpringNyan/dsh-public-proxy/blob/main/LICENSE)

A DeepSeek Harness plugin that exposes the DSH Web UI for LAN access.

## Install

```sh
dsh plugin --profile web add dsh-public-proxy@latest
```

## Usage

Once the plugin is running, it listens on port **3081** by default. Other devices on the same LAN can access the Web UI at:

```
http://<this-machine-LAN-IP>:3081
```

e.g. `http://192.168.1.100:3081`

## Config

Options can be configured in `$DSH_HOME/profiles/web/cordis.patch.yml` (defaults shown below):

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

### Access Control

By default, the proxy does not enforce access control—anyone on the LAN can access it. If you need to protect the proxy, you can enable Cookie-based authentication:

```yaml
- id: public-proxy
  config:
    # ... other options
    accessKey: "your-secret-key"
    enableCookieAuth: true
```

When enabled, accessing the proxy will prompt for an access key. The key is stored via Cookie, so you won't need to re-enter it within the current session.

**Note:** Since the proxy uses plain HTTP, the access key may be intercepted by network eavesdroppers. Only use this in a trusted LAN environment.

## Security Warning

DSH itself refuses to bind `0.0.0.0` and returns the following official error:

> `error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead`

This plugin intentionally bypasses this restriction to enable LAN access. Listening on `0.0.0.0` exposes the Web UI to the whole network — anyone on the network can reach the machine. Only enable this on a trusted LAN, and never expose the proxy directly to the public internet.

## License

MIT — see [LICENSE](LICENSE).