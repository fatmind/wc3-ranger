# webclaw3

[English](./README.md) | **中文**

> 让 AI Agent 的浏览器任务学会一次——以后永远免费跑。

每次让 AI Agent 操作浏览器，你都在付 token 费，而且结果时灵时不灵：今天能跑通，啥也没改、明天就失败。webclaw3 把一次成功的探索固化成可复用的 **skill**——每天都要跑的任务，不再每天都花钱。

![intro](assets/intro.gif)

## 先算一笔账

一次"去这个网站看看"的任务就要消耗百万级 tokens。下图是一次浏览器任务的真实 API 账单：

![cost](assets/cost.png)

- Prompt 2.3M × $3/MTok = $6.90 | Completion 20.5K × $15/MTok = $0.31 | Cache 2.1M × $0.30/MTok = $0.63
- 考虑缓存命中浮动：Sonnet **单次 ≈ $2 ~ $3+**
- Opus（$5/$25）同样任务 **$5 ~ $8+**；复杂任务多轮探索，轻松突破 $10

每天跑一次，一个月就是 **$90+**——同样的步骤，每次从头重新思考。钱之外还有三个问题：

- **每天都在烧钱。** 同一个网站、同样的操作，AI 每次都重新消耗百万级 tokens，像雇了一个每天失忆的员工。
- **执行不稳定。** AI 浏览网页天然不稳定——同一个任务，这次成功，下次可能因为页面加载顺序不同就失败。
- **需要人盯着。** 你花了钱，还得盯着它跑，随时准备重跑。本该自动化的事情，反而更累了。

## 工作原理

思路就一条：**探索一次，提炼成 skill，以后免费反复跑。** 整条链路都在你自己的机器上、在你已经在用的 Agent（Claude Code、workbuddy、qoderwork）里完成。

**① 探索——把"自己要什么"搞清楚。** 说个大概方向就行，Agent 用本 skill 驱动你的真实浏览器去跑。需求是试出来的：看着真实结果调范围、调筛选、调字段，直到你拍板——**就是这个**。

**② 提炼——一句话变成 skill。** 说"帮我提炼"。Agent 和你确认最终需求后，由你机器上的**本地生成器**重新探索网站（用你本地 Chrome 的登录态）、生成 skill、换参数验证，后台跑几十分钟。webclaw3.com 平台只做两件事：校验生成次数、提供站点经验库——不碰你的账号。

**③ 日常跑——确定性、免费。** 生成的 skill 是纯脚本：不需要 AI 推理、**零 token**、毫秒级返回、每次结果一致。随时跑，也可以配成定时任务。

**④ 修复——也免费。** 网站改版导致 skill 失效时，把报错甩给本地 Agent，它直接在本地修好，不收费。

| | 用 AI 直接跑 | 用 skill |
|---|---|---|
| 单次简单任务 | $2 ~ $3 | $0 |
| 单次复杂任务 | $5 ~ $10+ | $0 |
| 每天跑一次，一个月 | $60 ~ $300 | $0 |
| 稳定性 | 时灵时不灵 | 确定性执行，每次一致 |

## 快速上手

一切都在你的 Agent 里驱动——Claude Code、workbuddy、qoderwork 都可以。下面以 Claude Code 为例（其他 Agent 见 [docs/clients](docs/clients)）：

**1. 一次性准备。** 把本仓库 clone 到 Agent 的 skills 目录：

```bash
git clone git@github.com:fatmind/wc3-ranger.git ~/.claude/skills/webclaw3
```

然后打开 Claude Code，说一句：

```
帮我检查 webclaw3 环境
```

Agent 会自动拉起本地服务；如果配套 Chrome 扩展（[wc3-chrome](https://github.com/fatmind/wc3-chrome)）还没装，会给你一次性的安装引导。之后用 Chrome 正常登录你常用的网站即可——webclaw3 用的是**你自己的浏览器和登录态**，账号密码不经过任何人。

**2. 探索。** 说个大概方向，让 Agent 真实去跑：

```
帮我看看 SkillHub（https://skillhub.cn/）的下载热榜都有什么
```

边看边调（`每条加上下载量和评分` / `只要前 10 条`），直到就是你要的。这一步消耗的是你自己 Agent 的 token——正因为如此才值得提炼：满意的这一次，以后不用再花钱重来。

**3. 提炼。** 说：

```
把刚才这个提炼成 skill，我以后要每天跑
```

Agent 会和你对齐最终需求、整理需求文档给你过目，你确认后提交给本地生成器。第一次会引导你去 [webclaw3.com](https://webclaw3.com) 登录拿 Access Key（在项目里写一行 `.webclaw3.env`——Agent 会帮你代办）。生成在后台跑几十分钟，Agent 自动轮询进展，完成后自动安装。生成进展也可以在 webclaw3.com 上查看。

**4. 日常跑：**

```
/skillhub-trending 跑一下今天的榜单
```

或配成定时任务（`每天早上 8 点自动跑 skillhub-trending`）。本地执行，快、稳、几乎零 token。

**5. 出问题了？** 把报错直接甩给 Agent——本地修复，免费。

## 定价

- **生成 skill**：每个账号免费 2 次，失败不扣
- **日常运行**：免费——skill 在你本地跑
- **失效修复**：免费——本地 Agent 直接修

细则见 [webclaw3.com](https://webclaw3.com)。

## 了解更多

- 这个 skill 本身怎么工作（双通道触达浏览器、Aria 树语义、`page.eval`）：[docs/wc3-ranger-intro.zh-CN.md](docs/wc3-ranger-intro.zh-CN.md)
- 在 [workbuddy](docs/clients/workbuddy.zh-CN.md) 或 [qoderwork](docs/clients/qoderwork.zh-CN.md) 里使用 webclaw3

## License

MIT
