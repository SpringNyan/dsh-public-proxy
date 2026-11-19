# dsh-public-proxy

[![npm version](https://img.shields.io/npm/v/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![npm downloads](https://img.shields.io/npm/dm/dsh-public-proxy.svg)](https://www.npmjs.com/package/dsh-public-proxy)
[![License](https://img.shields.io/npm/l/dsh-public-proxy.svg)](https://github.com/SpringNyan/dsh-public-proxy/blob/main/LICENSE)

**简体中文** | [English](README_EN.md)

用于在局域网中访问 DeepSeek Harness Web UI 的代理插件，支持自定义访问密钥认证。

## 安装

需要 DeepSeek Harness `>=0.2.1-rc.1`。

将插件安装到 `web` profile：

```sh
dsh plugin --profile web add dsh-public-proxy
```

安装后启动或重新启动 DSH Web：

```sh
dsh web
```

## 访问 Web UI

默认使用 DSH 登录认证。首次访问时，使用 DSH 输出的登录令牌：

```text
http://<HOST>:<PORT>/?token=<DSH_LAUNCH_TOKEN>
```

其中，`<HOST>` 为 DSH 主机的局域网地址，`<PORT>` 为代理端口，`<DSH_LAUNCH_TOKEN>` 为 DSH 登录链接中的令牌。登录成功后，可通过 `http://<HOST>:<PORT>/` 访问。

使用自定义密钥登录的配置见下文“使用访问密钥”。

## 配置

在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中配置 `public-proxy` 节点。已有该节点时，修改其 `config` 即可。

以下是全部配置项及其默认值：

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

| 配置项             | 默认值      | 用途                                                    |
| ------------------ | ----------- | ------------------------------------------------------- |
| `host`             | `"0.0.0.0"` | 代理监听地址。                                          |
| `port`             | `3081`      | 代理监听端口。                                          |
| `bypassDshWebAuth` | `false`     | 自动完成 DSH 登录，无需手动提供登录令牌。               |
| `accessKey`        | `""`        | 自定义访问密钥，配合 `cookieAuth` / `headerAuth` 使用。 |
| `cookieAuth`       | `false`     | 启用访问密钥认证（Cookie 方式），`accessKey` 不能为空。 |
| `headerAuth`       | `false`     | 启用访问密钥认证（Header 方式），`accessKey` 不能为空。 |

修改后重新启动 DSH Web。

### 使用访问密钥（Cookie）

启用访问密钥认证和自动 DSH 登录：

```yaml
- id: public-proxy
  config:
    accessKey: "<ACCESS_KEY>"
    cookieAuth: true
    bypassDshWebAuth: true
```

`<ACCESS_KEY>` 为自定义访问密钥。打开 `http://<HOST>:<PORT>/`，按提示输入密钥即可登录。

登录成功后，浏览器通过 Cookie 保存密钥，有效期为 30 天。输入错误时，刷新首页可重新输入；清除 Cookie 或更换浏览器后需要重新登录。

### 使用访问密钥（Header）

适用于反向代理或 API 客户端等非浏览器场景。启用后，请求携带 `x-dsh-public-proxy-access-key: <ACCESS_KEY>` 请求头即可通过认证：

```yaml
- id: public-proxy
  config:
    accessKey: "<ACCESS_KEY>"
    headerAuth: true
    bypassDshWebAuth: true
```

如果 `cookieAuth` 与 `headerAuth` 同时启用，请求同时携带两者时以 `headerAuth` 为准（仅校验请求头）；只携带其一时校验该凭据，通过即可访问。

## 使用说明

- 使用 Cookie/Header 访问密钥或自动 DSH 登录时，请先打开根地址 `/` 完成登录。
- 代理使用明文 HTTP，适用于可信任的局域网。DSH 自身的 Web 服务也必须使用 HTTP。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
