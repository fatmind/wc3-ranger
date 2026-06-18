# web-ranger

> 基于 [eze-is/web-access](https://github.com/eze-is/web-access) v2.4 二次开发

给 Claude Code 装上完整联网能力 + Aria 语义树增强的 Skill。

在 web-access 基础上新增：**Aria 树接口**（低 token 语义化页面理解）、**请求日志**（操作记录）、**脚本生成指导**（探索后自动生成可复用脚本）。

---

## 能力

| 能力 | 说明 |
|------|------|
| 联网工具自动选择 | WebSearch / WebFetch / curl / Jina / CDP，按场景自主判断 |
| CDP Proxy 浏览器操作 | 直连用户日常 Chrome，天然携带登录态 |
| **Aria 树语义理解** | `/aria-tree` 返回压缩语义树（~500 行 vs DOM ~10000 行），大幅降 token |
| **Aria 语义交互** | `/click-aria`、`/type-aria` 按语义定位操作，比 CSS selector 更抗改版 |
| **请求日志** | 所有操作自动记录，支持查询和清空 |
| 并行分治 | 多目标时分发子 Agent 并行执行 |
| 媒体提取 | 从 DOM 直取图片/视频 URL，或对视频任意时间点截帧 |

## 安装

```bash
git clone <your-repo-url> ~/.claude/skills/web-ranger
```

## 前置配置（CDP 模式）

需要 **Node.js 22+** 和 Chrome 开启远程调试：

1. Chrome 地址栏打开 `chrome://inspect/#remote-debugging`
2. 勾选 **Allow remote debugging for this browser instance**

环境检查：

```bash
bash ~/.claude/skills/web-ranger/scripts/check-deps.sh
```

## CDP Proxy API

```bash
# 启动
node ~/.claude/skills/web-ranger/scripts/cdp-proxy.mjs &

# 页面操作
curl -s "http://localhost:3456/new?url=https://example.com"
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.title'
curl -s -X POST "http://localhost:3456/click?target=ID" -d 'button.submit'
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"

# Aria 树（新增）
curl -s "http://localhost:3456/aria-tree?target=ID"
curl -s -X POST "http://localhost:3456/click-aria?target=ID" -d '{"role":"button","name":"下一页"}'
curl -s -X POST "http://localhost:3456/type-aria?target=ID" -d '{"role":"textbox","name":"搜索","text":"hello"}'

# 操作日志（新增）
curl -s "http://localhost:3456/logs"
curl -s -X DELETE "http://localhost:3456/logs"
```

## 设计哲学

> Skill = 哲学 + 技术事实，不是操作手册。讲清 tradeoff 让 AI 自己选，不替它推理。

详见 [SKILL.md](./SKILL.md)。

## License

MIT · 基于 [web-access](https://github.com/eze-is/web-access) by [一泽 Eze](https://github.com/eze-is)
