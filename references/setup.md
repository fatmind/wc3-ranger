# 环节①：安装启动

> 什么时候读这个文件：首次使用，或 `webclaw3 doctor` 返回 `ok:false` 需要引导用户处理。

两条铁律，避免对用户制造噪音：

1. **skill 安装完成后直接跑 doctor**，不要问用户"要不要验证/检查"——跑完拿结果说话
2. **CLI 用 node 直接跑**：`node <本 skill 目录>/scripts/webclaw3.mjs doctor`。不存在"没在 PATH 上"的问题，**不要提议 npm link / 全局安装 / 改 PATH**

## 一条命令诊断

```bash
node <本 skill 目录>/scripts/webclaw3.mjs doctor
```

doctor 按顺序检查，能自动修的自动修，修不了的在 `advice` 里给出人话建议。另外 doctor 每次会把本 skill 的安装路径登记到 `~/.webclaw3/config.json`（`skillDir`）——电脑上装了多个 AI 产品、存在多份 skill 目录时，webclaw3 各组件以这里为唯一定位，以最近一次跑 doctor 的为准。

| 检查 | 自动处理 | 需要用户处理时的 advice |
|---|---|---|
| Node >= 22 | — | 提示升级 Node |
| relay（:3459）监听 | 未启动则自动 start | 启动失败 → 看 /tmp/relay.log |
| 扩展已连接 | 刚启动 relay 时等 25s（扩展每 20s 自动重连） | 见下方三种情况 |
| Code CLI（生成用） | — | 未装 → 引导装 claude-code |
| 生成器 wc3-pipeline（:3460） | 未装则从 dist/ 自动安装、已装未跑则自动 start | 自动安装失败 → 手动装（见下）；启动失败 → 看 /tmp/wc3-pipeline.log |
| AK 与剩余次数 | 读取并报告 | 未配 → 引导 `config ak`；为 0 → 去 wc3-app 购买 |

扩展未连接时 doctor 会区分几种情况，照 advice 转告用户即可：

1. **Chrome 没运行** → 请用户打开 Chrome，等 20 秒重跑 doctor
2. **扩展未安装**（`extension.installed: false`）→ 引导用户安装（见下）
3. **已安装但没连上** → 请用户到 `chrome://extensions` 确认 wc3 未被禁用，点「重新加载」，等 20 秒重跑 doctor
4. **无法判断装没装**（`installed: null`，macOS 系统权限限制读不到 Chrome 配置，属正常）→ 请用户自己打开 `chrome://extensions` 看：没装走 2，装了走 3

## 扩展安装（用户一次性操作）

wc3-chrome 还没通过 Chrome 商店审核，走本地开发者模式装打包好的 zip——它随本 skill 仓库分发，就在 `dist/` 下（也可直接下载：https://github.com/fatmind/webclaw3/blob/main/dist/wc3-chrome-extension-0.6.0.zip）。引导用户：

1. 下载并**解压 zip**
2. 打开 `chrome://extensions/`
3. 右上角开启「**开发者模式**」
4. 点「**加载已解压的扩展程序**」
5. 选刚解压后的文件夹

装完后重跑 doctor，`ok:true` 即就绪。

## 生成器（wc3-pipeline）——本地生成

阶段 2「提炼为 skill」需要生成器：在用户本地跑 explore/distill/validate/review。

**安装（doctor 全自动，用户零操作）**（需 Node 22+）：生成器的安装包（tarball）随本 skill 仓库一起分发——它就放在本 skill 目录的 `dist/` 下，`git clone` skill 时已经一并下来了。这个 tarball 无外部依赖、离线可装，所以 **doctor 检测到未安装时会直接 `npm i -g` 就地装好，不再提示用户手动敲命令**，装完顺带自动启动。

只有 doctor 自动安装失败（如 npm 全局目录无写权限）时，才需要手动兜底：

```bash
# <本 skill 目录> 即 doctor 登记的 skillDir，dist/ 下是随包分发的版本化 tarball
npm i -g <本 skill 目录>/dist/wc3-pipeline-*.tgz
```

doctor 会检测到、装了未跑时自动启动。手动管理：

```bash
webclaw3 pipeline-start / -stop / -status / -restart
```

**配置 AK**：生成/拉站点经验/回传经验都要 AK（扣次数）。在 wc3-app 网页登录后获取，然后：

```bash
webclaw3 config ak <access-key> [--app-base <wc3-app 地址>]
```

## 边界

- **不要启动 CDP**（`cdp-start`）。CDP 是探索中 Extension 通道整体不可用时的兜底（见 `references/cdp-fallback.md`），安装环节用不到，启动它会让用户看到 Chrome 授权弹窗。
- **AK 不在探索前拦用户**。doctor 会报告 AK 是否配置和剩余次数（软性信号），但探索（阶段 1/3/4）不需要 AK；只有阶段 2 本地生成才要。没配时引导配置，别在探索前硬拦。
