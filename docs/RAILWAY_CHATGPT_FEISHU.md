# Railway 部署与 ChatGPT 接入（中国版飞书）

本项目默认连接中国版飞书（`open.feishu.cn` / `Domain.Feishu`），同时保留国际版 Lark：设置 `LARK_DOMAIN=lark` 即可切换到 `open.larksuite.com` / `Domain.Lark`。

云端入口采用无会话的 Streamable HTTP MCP：

- MCP：`POST /mcp`
- 健康检查：`GET /health`
- 监听地址：`HOST`，默认 `0.0.0.0`
- 监听端口：Railway 自动注入的 `PORT`

## 一、飞书开放平台配置

1. 在飞书开放平台创建“企业自建应用”。
2. 在“添加应用能力”中启用“机器人”。
3. 在“权限管理”中按实际功能开通权限。只做群聊总结的最小权限建议：
   - `im:chat:readonly`：读取机器人所在群列表。
   - `im:message.group_msg`：读取群内全部消息；读取群历史消息必须有此权限。
   - `im:message`：以应用/机器人身份收发消息；仅做只读总结时，可按飞书控制台实际授权提示收紧。
4. 如需读取图片、文件等消息资源，再开通 `im:resource`。
5. 创建并发布应用版本，等待管理员审批；权限修改后必须重新发布版本才会生效。
6. 把机器人加入需要总结的目标群。读取历史消息时，机器人必须在该群中。

### 实时事件（可选）

`ImMessageList` 直接调用飞书历史消息 API，不依赖事件订阅。只有需要实时接收新消息、使用 `Event*` 工具或 watcher 时，才需要：

1. 打开“事件与回调/事件配置”，选择“使用长连接接收事件”。
2. 添加事件 `im.message.receive_v1`（接收消息）。
3. 按接收范围开通：
   - `im:message.p2p_msg`：机器人单聊消息。
   - `im:message.group_at_msg`：群内 @ 机器人消息。
   - `im:message.group_msg`：群内全部消息。
4. 重新发布应用版本。

注意：Railway 的默认 `pnpm start` 只运行 HTTP MCP 工具服务，不自动启动 `lark-serve` watcher。群历史总结不受影响。若要持续监听实时事件，应把 watcher 作为受监管的常驻进程部署，并为其配置持久化存储；不要把 watcher 当作一次性的 MCP 调用启动。

## 二、部署到 Railway

1. 在 Railway 选择“New Project / Deploy from GitHub repo”，选择 Fork：`Zhangshixian-LI/lark-mcp`。
2. 在服务的 Variables 中添加：

   ```text
   FEISHU_APP_ID=你的 App ID
   FEISHU_APP_SECRET=你的 App Secret
   LARK_DOMAIN=feishu
   NODE_ENV=production
   ```

   `PORT` 和 `RAILWAY_PUBLIC_DOMAIN` 由 Railway 自动注入，不要手填。真实凭证只放在 Railway Variables，不要写入 `.env.example`、源码或 Git 提交。

3. Railpack 会依据 `pnpm-lock.yaml` 安装依赖，运行 `pnpm build`，并通过 `pnpm start` 启动 `build/http.mjs`。如自动识别失败，在服务设置中手动填写：
   - Build Command：`pnpm build`
   - Start Command：`pnpm start`
4. 在 Settings → Deploy 中把 Healthcheck Path 设为 `/health`。
5. 在 Settings → Networking 中点击 Generate Domain。
6. 打开 `https://你的域名/health`，应返回 `status: ok`。MCP 地址为：

   ```text
   https://你的域名/mcp
   ```

如果使用 Railway 自定义域名，把它加入：

```text
MCP_ALLOWED_HOSTS=mcp.example.com
```

`RAILWAY_PUBLIC_DOMAIN` 与 Railway 健康检查域名已经自动加入允许列表。

## 三、接入 ChatGPT 自定义 MCP

1. 在 ChatGPT 设置中启用 Developer mode（开发者模式）；可见性取决于账号套餐和工作区策略。
2. 进入 ChatGPT Plugins，点击加号创建连接。
3. 填写名称和说明，例如“飞书群聊助手”。
4. Connection URL 填完整地址：`https://你的域名/mcp`。
5. 扫描工具并创建连接。确认工具列表中包含 `ImChatList`、`ImMessageList`、`ImMessageSend` 等。
6. 在新对话中启用该插件，先让 ChatGPT 调用 `ImChatList` 找到 `chatId`，再调用 `ImMessageList`。例如：

   ```text
   找到“项目群”，读取过去 24 小时的全部消息并总结；如果 has_more 为 true，继续使用 page_token 翻页，直到覆盖完整时间范围。
   ```

`ImMessageList` 接受 ISO 8601 或 Unix 秒时间，单页最多 50 条，并会额外返回适合总结的 `text` 字段。

## 四、远程 MCP 安全

此 MCP 拥有飞书机器人的权限，公开且无认证的 `/mcp` 不适合生产环境。

- 项目支持可选 `MCP_BEARER_TOKEN`；设置后，除 `/health` 外的请求必须携带 `Authorization: Bearer <token>`。只有在 ChatGPT 连接界面支持相应认证方式时才启用。
- 若当前 ChatGPT 连接只支持“无认证”或标准 OAuth，应仅把无认证模式用于短期、受控测试。正式使用应在 MCP 前增加符合 MCP/ChatGPT 发现流程的 OAuth 2.1 网关。
- HTTP 模式不会暴露 `McpRestart`，避免远程调用反复重启 Railway 服务。
- 建议按用途只授予必要的飞书权限，并定期轮换 App Secret。

## 五、常见排查

- `/health` 为 404：确认已经构建并运行 `pnpm start`，而不是本地 stdio 的 `lark-mcp`。
- Railway 健康检查 400：确认服务使用当前代码；`healthcheck.railway.app` 已在允许 Host 中。
- 飞书返回无权限：在权限管理中补权限后，必须创建并发布新版本；同时确认机器人已加入目标群。
- `ImMessageList` 返回 `has_more: true`：把返回的 `page_token` 作为下一次 `pageToken` 继续调用。
- 国际版 Lark：把 `LARK_DOMAIN` 改成 `lark`，凭证可继续使用 `FEISHU_*` 或兼容的 `LARK_APP_ID` / `LARK_APP_SECRET` 环境变量名。

