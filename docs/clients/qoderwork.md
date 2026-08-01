# Using webclaw3 in qoderwork

**English** | [中文](./qoderwork.zh-CN.md)

**1. Install** — clone into qoderwork's skills directory:

```bash
git clone git@github.com:fatmind/wc3-ranger.git ~/.qoderwork/skills/webclaw3
```

**2. Check the environment** — in qoderwork, say:

```
帮我检查 webclaw3 环境
```

The agent starts the local services itself and guides you through the one-time [wc3-chrome](https://github.com/fatmind/wc3-chrome) extension setup if needed.

**3. Use it** — from here everything is conversation:

- Explore: `帮我看看 https://example.com 的热榜都有什么` → adjust until it's exactly what you want
- Distill: `把刚才这个提炼成 skill，我以后要每天跑` (first time, the agent helps you grab an Access Key from [webclaw3.com](https://webclaw3.com))
- Run daily: `/skill名 跑一下` or schedule it
- Repair: paste the error, the agent fixes the skill locally

The full flow with examples is in the [README](../../README.md#quickstart).
