# webclaw3

**English** | [中文](./README.zh-CN.md)

> Teach your AI agent browser tasks once — run free forever.

Every time you ask an AI agent to do something in a browser, you pay in tokens — and the result is flaky: it works today, fails tomorrow with nothing changed. webclaw3 turns one successful exploration into a reusable **skill**, so a task you run every day stops costing you every day.

![intro](assets/intro.gif)

## The cost problem

A single "go look at this site" task costs millions of tokens. Here's a real API bill for one browser task:

![cost](assets/cost.png)

- Prompt 2.3M × $3/MTok = $6.90 | Completion 20.5K × $15/MTok = $0.31 | Cache 2.1M × $0.30/MTok = $0.63
- With cache-hit variance: **~$2–$3+ per task** on Sonnet
- On Opus ($5/$25) the same task runs **$5–$8+**; complex multi-step exploration easily exceeds $10

Run it daily and that's **$90+ a month** — for the exact same steps, re-thought from scratch every time. And beyond the money:

- **It burns cash daily.** Same site, same steps, millions of tokens every single time — like hiring someone who forgets everything overnight.
- **It's unreliable.** AI browsing is inherently flaky; a task succeeds now and fails next time just because elements loaded in a different order.
- **It needs babysitting.** You pay AND watch it run, ready to re-run at any moment.

## How it works

The fix: **explore once, distill it into a skill, rerun it for free.** Everything happens on your own machine, inside the agent you already use (Claude Code, workbuddy, qoderwork).

**① Explore — figure out what you actually want.** Just point in a rough direction; the agent drives your real browser with this skill. Requirements are discovered by trying: watch the real output and adjust scope, filters, fields — until you can say *"this is exactly it."*

**② Distill — one sentence turns it into a skill.** Say *"帮我提炼 / distill this into a skill."* The agent confirms the final requirements with you, then a **local generator** on your machine re-explores the site (using your own Chrome login state), generates the skill, and validates it with varied parameters. It runs in the background for tens of minutes. The webclaw3.com platform only steps in to check your generation quota and serve its site-knowledge base — it never sees your accounts.

**③ Run daily — deterministic and free.** The generated skill is a plain script: no AI reasoning, **zero tokens**, millisecond response, identical results every run. Schedule it, rerun it any time.

**④ Repair — also free.** When the site redesigns and a skill breaks, hand the error to your local agent; it fixes the skill locally, no charge.

| | Raw AI | With a skill |
|---|---|---|
| Simple task (one-off) | $2 ~ $3 | $0 |
| Complex task (one-off) | $5 ~ $10+ | $0 |
| Daily task, per month | $60 ~ $300 | $0 |
| Reliability | Hit or miss | Deterministic, consistent every time |

## Quickstart

You never leave your agent's chat — Claude Code, workbuddy, or qoderwork all work. Everything below is things you *say*; the agent runs the commands.

**1. One-time setup.** Say to your agent:

```
帮我安装 webclaw3（https://github.com/fatmind/wc3-ranger），装好检查一下环境
```

The agent clones this repo into your skills directory, starts the local services, and — if the companion Chrome extension ([wc3-chrome](https://github.com/fatmind/wc3-chrome)) isn't installed yet — walks you through a one-time setup. Log into your usual sites in Chrome as you normally would: webclaw3 drives *your* browser with *your* login state, and passwords never go through anyone. Per-agent notes: [Claude Code](docs/claude-code.md) · [workbuddy](docs/workbuddy.md) · [qoderwork](docs/qoderwork.md)

**2. Explore.** Describe a task roughly and let the agent run it for real:

```
帮我看看 SkillHub（https://skillhub.cn/）的下载热榜都有什么
```

Adjust as you watch (`每条加上下载量和评分` / `只要前 10 条`) until it's exactly what you want. This step spends your own agent's tokens — which is exactly why it's worth distilling: the run you're happy with should never cost you again.

**3. Distill.** Say:

```
把刚才这个提炼成 skill，我以后要每天跑
```

The agent aligns the final requirements with you, shows you the requirement doc, and on your OK submits it to the local generator. The first time, it will ask you to log into [webclaw3.com](https://webclaw3.com) and grab an Access Key (one line in your project's `.webclaw3.env` — the agent does it for you). Generation takes tens of minutes in the background; the agent polls progress and installs the skill when it's done. Generation progress is also visible on webclaw3.com.

**4. Run it daily:**

```
/skillhub-trending 跑一下今天的榜单
```

or schedule it (`每天早上 8 点自动跑 skillhub-trending`). Runs locally, fast, stable, ~zero tokens.

**5. Something broke?** Paste the error to your agent — it repairs the skill locally, free.

## Pricing

- **Generating a skill**: 2 free per account, failures don't count
- **Daily runs**: free — skills execute on your machine
- **Repairs**: free — your local agent fixes them

Details on [webclaw3.com](https://webclaw3.com).

## Learn more

- How the skill itself works (dual browser channels, Aria-tree semantics, `page.eval`): [docs/wc3-ranger-intro.md](docs/wc3-ranger-intro.md)
- Per-agent setup: [Claude Code](docs/claude-code.md) · [workbuddy](docs/workbuddy.md) · [qoderwork](docs/qoderwork.md)

## License

MIT
