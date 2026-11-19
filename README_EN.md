# dsh-public-proxy

[![npm version](https://img.shields.io/npm/v/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![npm downloads](https://img.shields.io/npm/dm/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![License](https://img.shields.io/npm/l/dsh-public-proxy.svg)](https://github.com/SpringNyan/dsh-public-proxy/blob/main/LICENSE)

[简体中文](README.md) | **English**

A proxy plugin for accessing the DeepSeek Harness Web UI over a LAN, with support for custom access key authentication.

## Installation

Requires DeepSeek Harness `>=0.2.1-rc.1`.

Install the plugin in the `web` profile:

```sh
dsh plugin --profile web add dsh-public-proxy
```

After installation, start or restart DSH Web:

```sh
dsh web
```

## Accessing the Web UI

DSH authentication is used by default. On the first visit, use the login token printed by DSH:

```text
http://<HOST>:<PORT>/?token=<DSH_LAUNCH_TOKEN>
```

Here, `<HOST>` is the DSH machine's LAN address, `<PORT>` is the proxy port, and `<DSH_LAUNCH_TOKEN>` is the token from the DSH login URL. After signing in, access the UI at `http://<HOST>:<PORT>/`.

For custom key authentication, see “Using an Access Key” below.

## Configuration

Configure the `public-proxy` node in `$DSH_HOME/profiles/web/cordis.patch.yml`. If the node already exists, edit its `config`.

All configuration options and their defaults are shown below:

```yaml
- id: public-proxy
  config:
    host: "0.0.0.0"
    port: 3081
    bypassDshWebAuth: false
    accessKey: ""
    cookieAuth: false
    headerAuth: false
```

| Option             | Default     | Purpose                                                                      |
| ------------------ | ----------- | ---------------------------------------------------------------------------- |
| `host`             | `"0.0.0.0"` | Proxy listening address.                                                     |
| `port`             | `3081`      | Proxy listening port.                                                        |
| `bypassDshWebAuth` | `false`     | Signs in to DSH automatically without requiring a login token from the user. |
| `accessKey`        | `""`        | Custom access key, used with `cookieAuth` / `headerAuth`.                    |
| `cookieAuth`       | `false`     | Enables access key authentication (cookie); `accessKey` must not be empty.   |
| `headerAuth`       | `false`     | Enables access key authentication (header); `accessKey` must not be empty.   |

Restart DSH Web after making changes.

### Using an Access Key (Cookie)

Enable access key authentication and automatic DSH login:

```yaml
- id: public-proxy
  config:
    accessKey: "<ACCESS_KEY>"
    cookieAuth: true
    bypassDshWebAuth: true
```

`<ACCESS_KEY>` is the custom access key. Open `http://<HOST>:<PORT>/` and enter the key when prompted to sign in.

After a successful login, the browser stores the key in a cookie for 30 days. If the key is incorrect, refresh the homepage to try again. Clearing cookies or switching browsers requires signing in again.

### Using an Access Key (Header)

For non-browser clients such as reverse proxies or API tools. When enabled, requests carrying the `x-dsh-public-proxy-access-key: <ACCESS_KEY>` header are authenticated:

```yaml
- id: public-proxy
  config:
    accessKey: "<ACCESS_KEY>"
    headerAuth: true
    bypassDshWebAuth: true
```

If `cookieAuth` and `headerAuth` are enabled together, a request carrying both credentials is validated against `headerAuth` only (the cookie is ignored); a request carrying just one credential is validated against that credential and granted access if it passes.

## Usage Notes

- When using a cookie/header access key or automatic DSH login, open the root URL `/` first to sign in.
- The proxy uses plain HTTP and is intended for trusted LANs. DSH's own Web service must also use HTTP.

## License

MIT. See [LICENSE](LICENSE).
