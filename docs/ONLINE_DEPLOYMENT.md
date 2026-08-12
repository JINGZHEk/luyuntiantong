# 在线演示部署

> 目标地址：`https://jingzhek.ccwu.cc`
> GitHub 仓库：`https://github.com/JINGZHEk/luyuntiantong`

本文档使用 Railway 部署比赛在线演示。项目根目录的 `Dockerfile` 会构建 React 前端，并由同一个 FastAPI 服务提供静态页面、REST API 和 WebSocket。Railway 只需暴露一个动态 `$PORT`，浏览器访问全程使用同一 HTTPS 域名。

## 1. 部署后的地址

| 用途 | 地址 |
|---|---|
| 作品首页 | `https://jingzhek.ccwu.cc/` |
| 核心演示 | `https://jingzhek.ccwu.cc/zhiluwujie` |
| 实时监控 | `https://jingzhek.ccwu.cc/monitor` |
| 算法评估 | `https://jingzhek.ccwu.cc/evaluation` |
| API 文档 | `https://jingzhek.ccwu.cc/docs` |
| 健康检查 | `https://jingzhek.ccwu.cc/health` |
| WebSocket | `wss://jingzhek.ccwu.cc/api/v1/realtime/ws` |

## 2. 首次创建 Railway 服务

1. 确认当前代码已经提交并推送到 GitHub `main` 分支。
2. 登录 [Railway](https://railway.com/)，选择 `New Project`。
3. 选择 `Deploy from GitHub repo`，授权 Railway 读取 `JINGZHEk/luyuntiantong`。
4. 选择仓库后直接部署，不设置 Root Directory。
5. Railway 会读取根目录 `railway.json` 和 `Dockerfile`，完成 Node 前端构建与 Python 后端构建。
6. 在服务 `Settings -> Networking` 中点击 `Generate Domain`，先得到一个 `*.up.railway.app` 临时域名。
7. 分别访问临时域名的 `/health` 和 `/zhiluwujie`，确认服务及 WebSocket 正常后再绑定自定义域名。

不要选择纯静态站点部署，也不要把前端和后端拆成两个 Railway 服务。本项目的同源部署用于避免 CORS、HTTPS/WSS 混合内容和前端误连访问者本机 `localhost`。

## 3. 环境变量

在 Railway 服务的 `Variables` 中确认或增加：

```text
V2X_DATABASE_PATH=/app/runtime/v2x_cloud.db
V2X_FRONTEND_DIST=/app/frontend/dist
V2X_AUTO_DEMO=true
V2X_DEMO_FPS=10
V2X_DEMO_SCENARIO=moderate
```

`PORT` 由 Railway 自动注入，不要手工写死。容器使用 `${PORT:-8000}` 启动 Uvicorn。

需要默认展示具体场景库场景时，可增加：

```text
V2X_DEMO_SCENARIO_ID=GP-01
```

设置 `V2X_AUTO_DEMO=true` 后，服务启动即循环生成 10Hz 消息，评委打开页面时无需先操作启动按钮。公开演示建议保持 10Hz，避免无意义增加容器负载。

## 4. SQLite 持久卷

在线演示即使没有持久卷也能启动，首次启动会自动创建 SQLite 并填充 16 个场景。但容器重新部署后运行记录会丢失，因此建议配置 Railway Volume：

1. 在 Railway 项目画布中选择服务。
2. 打开 `Volumes`，创建一个 Volume。
3. Mount Path 填写 `/app/runtime`。
4. 确认 `V2X_DATABASE_PATH=/app/runtime/v2x_cloud.db`。
5. 重新部署后访问 `/health`，确认 `sqlite.connected` 为 `true`。

不要把 Volume 挂载到 `/app`，否则会覆盖容器中的代码和前端构建产物。

## 5. 绑定 `jingzhek.ccwu.cc`

在 Railway 服务中：

1. 打开 `Settings -> Networking -> Custom Domain`。
2. 输入 `jingzhek.ccwu.cc`。
3. Railway 会显示需要配置的 DNS 目标，通常是一个 `*.up.railway.app` 主机名。

在 `ccwu.cc` 所使用的 DNS 控制台增加记录：

| 类型 | 主机记录 | 记录值 |
|---|---|---|
| CNAME | `jingzhek` | Railway 控制台显示的目标域名 |

填写记录值时以 Railway 当时显示的内容为准，不要填写 `https://`，也不要填写路径。若 DNS 服务商支持代理/CDN，首次验证建议先关闭代理，仅使用 DNS 解析；Railway 签发证书并显示域名可用后，再根据需要启用代理。

DNS 生效时间取决于服务商，通常数分钟到数小时。可以在本机检查：

```powershell
Resolve-DnsName jingzhek.ccwu.cc -Type CNAME
```

然后检查 HTTPS：

```powershell
Invoke-RestMethod https://jingzhek.ccwu.cc/health
```

健康响应至少应满足：

```json
{
  "status": "ok",
  "sqlite": {"connected": true}
}
```

## 6. 上线验收

按以下顺序检查，避免只验证首页静态文件：

1. `/health` 返回 HTTP 200，`status=ok`、`sqlite.connected=true`。
2. `/api/v1/scenarios` 返回 16 个场景。
3. `/api/v1/demo/status` 显示 `running=true`。
4. `/zhiluwujie` 可以加载三维场景，页面不存在请求 `localhost` 的报错。
5. 浏览器开发者工具 Network 中，WebSocket 为 `wss://jingzhek.ccwu.cc/api/v1/realtime/ws`，状态为 101。
6. 页面持续收到 perception、decision、event 等消息。
7. `/replay` 和 `/evaluation` 能访问真实 API，不显示跨域错误。
8. 手机蜂窝网络再访问一次，排除只在本机网络可用的情况。

## 7. 自动更新

Railway 连接 GitHub 后，`main` 分支的新 commit 默认会触发重新构建和发布。建议比赛前：

- 固定一个已验证 commit，并记录 commit hash。
- 最终提交前一天停止无关更新。
- 保留 Railway 临时域名，作为自定义 DNS 故障时的备用链接。
- 准备一份录屏视频，防止评审现场网络受限或平台服务休眠。
- 不在仓库和 Railway 变量中保存摄像头密码、MQTT 密码或私钥。

## 8. 资源与模型边界

在线容器使用轻量依赖和内置场景 Demo，不要求 CUDA、YOLO 权重或开发板。它完整展示 Web、API、WebSocket、SQLite、场景流程和风险决策，但网页中的在线服务器资源不能代表 Jetson/Atlas 实物性能。

如果后续要在线运行真实 TorchScript，应改用包含 PyTorch 的镜像并提供模型产物下载或对象存储挂载。比赛主在线演示不建议强制加载 GPU 模型，以免容器体积、冷启动和费用影响链接可靠性；算法训练结果、模型文件和 GPU 实测通过评估报告及演示视频展示。

## 9. 常见故障

### 页面打开但没有实时数据

检查 `/api/v1/demo/status`。若 `running=false`，确认 `V2X_AUTO_DEMO=true` 后重新部署，或调用：

```powershell
Invoke-RestMethod -Method Post "https://jingzhek.ccwu.cc/api/v1/demo/start?scenario=moderate&fps=10&loop=true"
```

### WebSocket 连接失败

确认浏览器连接的是 `wss://jingzhek.ccwu.cc/api/v1/realtime/ws`，而不是 `ws://` 或 `localhost`。本项目默认 `/api/v1` 同源配置，旧浏览器 localStorage 中若保存过本地 API 地址，可在设置页恢复默认或清除站点数据。

### 数据库重启后清空

确认 Volume 的 Mount Path 是 `/app/runtime`，数据库变量是 `/app/runtime/v2x_cloud.db`。

### 域名证书一直未签发

检查 CNAME 是否与 Railway 给出的值完全一致，删除冲突的 A/AAAA/CNAME 记录，并暂时关闭 DNS 代理。不要同时在其他托管平台绑定同一子域名。
