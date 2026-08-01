# webclaw3

> 给 Claude Code 的浏览器操作 Skill —— 定义浏览哲学 + 双通道触达浏览器（Extension Relay 优先，CDP 兜底）。

## 这是什么

webclaw3 是一个独立的 Claude Code skill，教 AI **怎么浏览网页**：目标导向、过程校验、条件不可达时灵活调整。

它由两部分组成：`SKILL.md`（浏览哲学与操作指引）+ `scripts/`（触达浏览器的**连接层**）。要真正操作浏览器，就必然依赖 `scripts/`：

- `scripts/relay.mjs` —— 桥接到 [wc3-chrome](https://github.com/fatmind/wc3-chrome) 扩展（HTTP :3459 ↔ WebSocket ↔ 插件）。**默认主通道**
- `scripts/cdp-proxy.mjs` —— 直连 Chrome CDP（HTTP :3456 ↔ :9222）。**兜底通道**：Extension 通道整体不可用时回退到它，能力等价
- `scripts/wc3-ranger.mjs` —— 启停 / 健康检查上述两者

真正在浏览器里执行操作的**插件本身是 wc3-chrome（L0）**；webclaw3 依赖它，但自带连接脚本，作为 skill 独立可运行。

## 能力

| 能力 | 说明 |
|------|------|
| **双通道触达** | Extension Relay 优先，CDP 兜底；同一真实 Chrome，能力等价 |
| 联网工具自主选型 | WebSearch / WebFetch / curl / 浏览器中继，按场景判断 |
| **Aria 树语义理解** | 压缩语义树（~500 行 vs DOM ~10000 行），低 token 看全貌 |
| **Aria 语义交互** | `page.click` / `page.fillForm` 按 ref_N 定位，抗改版 |
| **page.eval 任意 JS** | 穿透 Shadow DOM / iframe / SPA 数据层 |
| 并行分治 | 多目标分发子 Agent 并行执行 |
| 媒体提取 | 从 DOM 取图片/视频 URL，或对视频截帧分析 |

## 前置依赖

1. **Node.js 22+**
2. **wc3-chrome 扩展**：从 [wc3-chrome](https://github.com/fatmind/wc3-chrome) 获取，Chrome 开发者模式加载其 `extension/` 目录（一次性，引导见 [references/setup.md](./references/setup.md)）
3. **Relay 运行中**：跑一次 doctor 即可，未启动会自动拉起

```bash
node <本 skill 目录>/scripts/wc3-ranger.mjs doctor
# → {"ok":true,...} 即就绪；ok:false 时按输出里的 advice 处理
```

> 兜底通道（可选）：`wc3-ranger cdp-start` 启动 CDP 代理（`:3456`），仅在 Extension 通道整体不可用时才需要。

## 安装

```bash
git clone git@github.com:fatmind/wc3-ranger.git ~/.claude/skills/webclaw3
```

## 设计哲学

> Skill = 哲学 + 技术事实，不是操作手册。讲清 tradeoff 让 AI 自己选，不替它推理。

详见 [SKILL.md](./SKILL.md)。

## License

MIT
