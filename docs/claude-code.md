# Using webclaw3 in Claude Code

**English** | [中文](./claude-code.zh-CN.md)

Everything happens in the Claude Code chat — you say things, it runs the commands.

**0. Two one-time prerequisites** (only you can do these):

- Install the Chrome extension: download [wc3-chrome](https://github.com/fatmind/wc3-chrome), open `chrome://extensions`, enable **Developer mode** → **Load unpacked** → pick the `extension/` directory
- Log into [webclaw3.com](https://webclaw3.com) and grab your Access Key — it meters generation and unlocks the site-knowledge base

**1. Install + check** — say:

```
帮我安装 webclaw3（https://github.com/fatmind/wc3-ranger），装好检查一下环境
```

Claude Code clones the repo into `~/.claude/skills/webclaw3`, starts the local services, and walks you through the basic configuration (paste the Access Key, confirm the default directory for generated skills, etc.).

**2. Use it** — from here everything is conversation:

- Explore: `帮我看看 https://example.com 的热榜都有什么` → adjust until it's exactly what you want
- Distill: `把刚才这个提炼成 skill，我以后要每天跑` (first time, it helps you grab an Access Key from [webclaw3.com](https://webclaw3.com))
- Run daily: `/skill名 跑一下` or schedule it
- Repair: paste the error, it fixes the skill locally

The full flow with examples is in the [README](../README.md#quickstart).
