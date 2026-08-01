# 在 Claude Code 中使用 webclaw3

[English](./claude-code.md) | **中文**

**1. 安装**——clone 到 Claude Code 的 skills 目录：

```bash
git clone git@github.com:fatmind/wc3-ranger.git ~/.claude/skills/webclaw3
```

**2. 检查环境**——打开 Claude Code，说一句：

```
帮我检查 webclaw3 环境
```

Agent 会自动拉起本地服务；[wc3-chrome](https://github.com/fatmind/wc3-chrome) 扩展没装的话会给你一次性引导。

**3. 开始使用**——之后全是对话：

- 探索：`帮我看看 https://example.com 的热榜都有什么` → 边跑边调，直到就是你要的
- 提炼：`把刚才这个提炼成 skill，我以后要每天跑`（第一次 Agent 会引导你去 [webclaw3.com](https://webclaw3.com) 拿 Access Key）
- 日常跑：`/skill名 跑一下`，或配成定时任务
- 修复：把报错甩给 Agent，本地直接修

完整流程和示例见 [README](../../README.zh-CN.md#快速上手)。
