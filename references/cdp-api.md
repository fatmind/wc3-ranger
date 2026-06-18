# CDP Proxy API 参考

## 基础信息

- 地址：`http://localhost:3456`
- 启动：`node ~/.claude/skills/web-ranger/scripts/cdp-proxy.mjs &`
- 启动后持续运行，不建议主动停止（重启需 Chrome 重新授权）
- 强制停止：`pkill -f cdp-proxy.mjs`

## API 端点

### GET /health
健康检查，返回连接状态。
```bash
curl -s http://localhost:3456/health
```

### GET /targets
列出所有已打开的页面 tab。返回数组，每项含 `targetId`、`title`、`url`。
```bash
curl -s http://localhost:3456/targets
```

### GET /new?url=URL
创建新后台 tab，自动等待页面加载完成。返回 `{ targetId }`.
```bash
curl -s "http://localhost:3456/new?url=https://example.com"
```

### GET /close?target=ID
关闭指定 tab。
```bash
curl -s "http://localhost:3456/close?target=TARGET_ID"
```

### GET /navigate?target=ID&url=URL
在已有 tab 中导航到新 URL，自动等待加载。
```bash
curl -s "http://localhost:3456/navigate?target=ID&url=https://example.com"
```

### GET /back?target=ID
后退一页。
```bash
curl -s "http://localhost:3456/back?target=ID"
```

### GET /info?target=ID
获取页面基础信息（title、url、readyState）。
```bash
curl -s "http://localhost:3456/info?target=ID"
```

### POST /eval?target=ID
执行 JavaScript 表达式，POST body 为 JS 代码。
```bash
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.title'
```

### POST /click?target=ID
JS 层面点击（`el.click()`），POST body 为 CSS 选择器。自动 scrollIntoView 后点击。简单快速，覆盖大多数场景。
```bash
curl -s -X POST "http://localhost:3456/click?target=ID" -d 'button.submit'
```

### POST /clickAt?target=ID
CDP 浏览器级真实鼠标点击（`Input.dispatchMouseEvent`），POST body 为 CSS 选择器。先获取元素坐标，再模拟鼠标按下/释放。算真实用户手势，能触发文件对话框、绕过部分反自动化检测。
```bash
curl -s -X POST "http://localhost:3456/clickAt?target=ID" -d 'button.upload'
```

### POST /setFiles?target=ID
给 file input 设置本地文件路径（`DOM.setFileInputFiles`），完全绕过文件对话框。POST body 为 JSON。
```bash
curl -s -X POST "http://localhost:3456/setFiles?target=ID" -d '{"selector":"input[type=file]","files":["/path/to/file1.png","/path/to/file2.png"]}'
```

### GET /scroll?target=ID&y=3000&direction=down
滚动页面。`direction` 可选 `down`（默认）、`up`、`top`、`bottom`。滚动后自动等待 800ms 供懒加载触发。
```bash
curl -s "http://localhost:3456/scroll?target=ID&y=3000"
curl -s "http://localhost:3456/scroll?target=ID&direction=bottom"
```

### GET /screenshot?target=ID&file=/tmp/shot.png
截图。指定 `file` 参数保存到本地文件；不指定则返回图片二进制。可选 `format=jpeg`。
```bash
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"
```

## Aria 树接口（web-ranger 新增）

### GET /aria-tree?target=ID
获取压缩的 Accessibility Tree。返回纯文本，每行一个语义节点，带 `[ref=eN]` 编号和缩进层级。
过滤无语义节点（generic/none 等），保留 heading/button/link/textbox/list 等有意义角色。
token 消耗约为原始 DOM 的 1/20。

```bash
curl -s "http://localhost:3456/aria-tree?target=ID"
```

返回示例：
```
[ref=e1] heading: Example Domain
[ref=e2] paragraph: This domain is for use in illustrative examples.
[ref=e3] link: More information...
```

调用后会缓存 ref → DOM 节点的映射，供 `/click-aria` 和 `/type-aria` 使用。

### POST /click-aria?target=ID
按 Accessibility 语义（role + name）定位并点击元素。POST body 为 JSON。
自动 scrollIntoView 后执行 JS click。如果没有缓存的 Aria 树，会先自动获取一次。

```bash
curl -s -X POST "http://localhost:3456/click-aria?target=ID" \
  -d '{"role":"button","name":"下一页"}'
```

参数：
- `role`（必填）：Aria 角色，如 `button`、`link`、`tab`、`menuitem`
- `name`（可选）：节点名称，支持部分匹配。省略时匹配该 role 的第一个节点

返回：`{ clicked, ref, role, name, tag, text }` 或 `{ error }`

### POST /type-aria?target=ID
按 Accessibility 语义定位输入框，清空已有内容后输入新文本。POST body 为 JSON。

```bash
curl -s -X POST "http://localhost:3456/type-aria?target=ID" \
  -d '{"role":"textbox","name":"搜索","text":"iPhone 16"}'
```

参数：
- `role`（必填）：Aria 角色，如 `textbox`、`searchbox`、`combobox`
- `name`（可选）：节点名称
- `text`（必填）：要输入的文本

返回：`{ typed, ref, role, name, text }` 或 `{ error }`

## 操作日志接口（web-ranger 新增）

所有非查询类请求（排除 `/health`、`/targets`、`/logs`）自动记录到 `operation_log.json`。

### GET /logs
读取当前操作日志，返回 JSON 数组。

```bash
curl -s "http://localhost:3456/logs"
```

每条记录格式：
```json
{
  "timestamp": "2026-03-28T10:30:00.000Z",
  "method": "POST",
  "path": "/click-aria",
  "params": {"role": "button", "name": "下一页"},
  "response": {"clicked": true, "ref": "e13"}
}
```

### DELETE /logs
清空操作日志。

```bash
curl -s -X DELETE "http://localhost:3456/logs"
```

日志文件路径可通过 `CDP_LOG_FILE` 环境变量自定义，默认为当前工作目录下的 `operation_log.json`。

## /eval 使用提示

- POST body 为任意 JS 表达式，返回 `{ value }` 或 `{ error }`
- 支持 `awaitPromise`：可以写 async 表达式
- 返回值必须是可序列化的（字符串、数字、对象），DOM 节点不能直接返回，需要提取属性
- 提取大量数据时用 `JSON.stringify()` 包裹，确保返回字符串
- 根据页面实际 DOM 结构编写选择器，不要套用固定模板

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| `Chrome 未开启远程调试端口` | Chrome 未开启远程调试 | 提示用户打开 `chrome://inspect/#remote-debugging` 并勾选 Allow |
| `attach 失败` | targetId 无效或 tab 已关闭 | 用 `/targets` 获取最新列表 |
| `CDP 命令超时` | 页面长时间未响应 | 重试或检查 tab 状态 |
| `端口已被占用` | 另一个 proxy 已在运行 | 已有实例可直接复用 |
