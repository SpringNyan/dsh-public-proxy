# dsh-public-proxy

A DeepSeek Harness plugin that exposes the DSH Web UI for LAN access.

## Install

```sh
dsh plugin --profile web add dsh-public-proxy@latest
```

## Usage

Once the plugin is running, it listens on port **3081**. Other devices on the same LAN can access the Web UI at:

```
http://<this-machine-LAN-IP>:3081
```

e.g. `http://192.168.1.100:3081`

## Config

All options are set in `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: public-proxy
  config:
    host: "0.0.0.0"
    port: 3081
    randomUuidPolyfill: true # browsers have no crypto.randomUUID when bypassing the secure context; inject a polyfill
```

## Security

DSH itself refuses to bind `0.0.0.0` with the official error:

> `error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead`

This plugin intentionally bypasses that restriction for LAN access. Listening on `0.0.0.0` exposes the Web UI to the whole network — anyone on it can reach the machine. Only enable this on trusted LANs, and never expose the proxy to the public internet.

## License

MIT — see [LICENSE](LICENSE).
