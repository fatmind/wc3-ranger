#!/usr/bin/env node

// webclaw3 — L0 层（Relay + CDP Proxy）启停与健康检查
//
// 子命令：start | stop | status | restart | doctor
//         cdp-start | cdp-stop | cdp-status | cdp-restart
// 内部封装同目录下 start-relay.mjs / start-cdp-proxy.mjs 的 spawn/端口探测
// 输出 stdout JSON：{port, listening, extensionConnected, pid}
// 退出码：0=端口监听中（status）、spawn 成功（start）、通道就绪（doctor）；1=异常

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, openSync, readdirSync, symlinkSync, readlinkSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RELAY_SCRIPT = join(__dirname, 'start-relay.mjs');
const CDP_SCRIPT = join(__dirname, 'start-cdp-proxy.mjs');

const DEFAULT_PORT = 3459;
const CDP_DEFAULT_PORT = 3456;
const PID_DIR = join(homedir(), '.webclaw3');
const PID_FILE = join(PID_DIR, 'relay.pid');
const CDP_PID_FILE = join(PID_DIR, 'cdp-proxy.pid');
const CONFIG_FILE = join(PID_DIR, 'config.json');
const LOG_FILE = '/tmp/relay.log';
const CDP_LOG_FILE = '/tmp/cdp-proxy.log';

function log(msg) {
  process.stderr.write(`[webclaw3] ${msg}\n`);
}

function printUsage() {
  process.stdout.write(`webclaw3 — L0 层（Relay + CDP Proxy）启停与健康检查

Usage:
  webclaw3 doctor [--port 3459]
  webclaw3 start [--port 3459] [--wait 10]
  webclaw3 stop [--port 3459]
  webclaw3 status [--port 3459] [--timeout 5]
  webclaw3 restart [--port 3459] [--wait 10]
  webclaw3 cdp-start [--port 3456] [--wait 10]
  webclaw3 cdp-stop [--port 3456]
  webclaw3 cdp-status [--port 3456] [--timeout 5]
  webclaw3 cdp-restart [--port 3456] [--wait 10]
  webclaw3 pipeline-start [--wait 10]
  webclaw3 pipeline-stop
  webclaw3 pipeline-status [--timeout 5]
  webclaw3 pipeline-restart
  webclaw3 config ak <access-key> [--app-base <url>]
  webclaw3 -h | --help

Relay Commands:
  doctor   一条命令分层诊断：Node 版本 → relay（未启动则自动 start）→ 扩展连接
           未连接时区分：Chrome 没开 / 扩展未安装 / 已装未连，输出 advice；不碰 CDP
           另查生成四件套：Code CLI（未装给引导）+ 生成器自身（装了未跑则自动 start）+ AK/剩余次数
           同时把本 skill 安装路径注册到 ~/.webclaw3/config.json（skillDir，幂等）
  start    后台启动 relay（spawn start-relay.mjs），等端口 ready
  status   查询 3459 端口监听 + /api/status.extensionConnected
  stop     用 PID 文件杀进程
  restart  stop + start

CDP Proxy Commands:
  cdp-start    后台启动 CDP proxy（spawn start-cdp-proxy.mjs），等端口 ready
  cdp-status   查询 3456 端口监听 + /health
  cdp-stop     用 PID 文件杀进程
  cdp-restart  stop + start

Pipeline（生成器 :3460）Commands:
  pipeline-start    后台启动生成器（读 config.json pipeline.entry，spawn --serve）
  pipeline-status   查询 :3460 监听 + 运行中任务
  pipeline-stop     用 PID 文件杀进程
  pipeline-restart  stop + start

Config:
  config ak <access-key> [--app-base <url>]  写 config.json ak/appBase（生成/拉经验/回传需 AK）

Output:
  stdout 输出 JSON: {"port":N,"listening":bool,"connected":bool,"pid":N|null}
  退出码：start/status 0=正常，1=异常

Config:
  Relay PID 文件: ~/.webclaw3/relay.pid
  CDP PID 文件: ~/.webclaw3/cdp-proxy.pid
  Relay 日志: /tmp/relay.log
  CDP 日志: /tmp/cdp-proxy.log
`);
}

function parseOpts(args) {
  const opts = { port: DEFAULT_PORT, wait: 10, timeout: 5 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) opts.port = parseInt(args[++i], 10);
    else if (args[i] === '--wait' && args[i + 1]) opts.wait = parseInt(args[++i], 10);
    else if (args[i] === '--timeout' && args[i + 1]) opts.timeout = parseInt(args[++i], 10);
    else if (args[i] === '-h' || args[i] === '--help') { printUsage(); process.exit(0); }
  }
  return opts;
}

function readPidFile() {
  try {
    const v = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

function checkPort(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/status', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ listening: true, extensionConnected: !!data.extensionConnected, raw: data });
        } catch {
          resolve({ listening: true, extensionConnected: false, raw: body });
        }
      });
    });
    req.on('error', () => resolve({ listening: false, extensionConnected: false }));
    req.on('timeout', () => { req.destroy(); resolve({ listening: false, extensionConnected: false }); });
  });
}

async function startRelayCore(opts) {
  const existing = await checkPort(opts.port);
  if (existing.listening) {
    log(`port ${opts.port} already listening`);
    return { port: opts.port, ...existing, pid: readPidFile() };
  }

  if (!existsSync(RELAY_SCRIPT)) {
    log(`relay script not found: ${RELAY_SCRIPT}`);
    return { port: opts.port, listening: false, extensionConnected: false, error: 'relay-script-not-found' };
  }

  mkdirSync(PID_DIR, { recursive: true });

  const out = openSync(LOG_FILE, 'a');
  const child = spawn('node', [RELAY_SCRIPT, String(opts.port)], {
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  log(`spawned relay pid=${child.pid} port=${opts.port}, waiting up to ${opts.wait}s`);

  const deadline = Date.now() + opts.wait * 1000;
  let last = { listening: false, extensionConnected: false };
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    last = await checkPort(opts.port);
    if (last.listening) break;
  }

  if (!last.listening) {
    log(`port ${opts.port} not listening after ${opts.wait}s; check ${LOG_FILE}`);
  }
  return { port: opts.port, ...last, pid: child.pid };
}

async function cmdStart(opts) {
  const result = await startRelayCore(opts);
  process.stdout.write(JSON.stringify(result) + '\n');
  return result.listening ? 0 : 1;
}

async function cmdStop(opts) {
  const pid = readPidFile();
  if (!pid) {
    log('no pid file, nothing to stop');
    process.stdout.write(JSON.stringify({ port: opts.port, listening: false, extensionConnected: false, stopped: false }) + '\n');
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    log(`sent SIGTERM to pid=${pid}`);
  } catch (e) {
    log(`kill pid=${pid} failed: ${e.message}`);
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await checkPort(opts.port)).listening) break;
    await new Promise(r => setTimeout(r, 200));
  }
  try { unlinkSync(PID_FILE); } catch {}
  process.stdout.write(JSON.stringify({ port: opts.port, listening: false, extensionConnected: false, stopped: true }) + '\n');
  return 0;
}

async function cmdStatus(opts) {
  const r = await checkPort(opts.port, opts.timeout * 1000);
  const out = { port: opts.port, ...r, pid: readPidFile() };
  process.stdout.write(JSON.stringify(out) + '\n');
  return r.listening ? 0 : 1;
}

async function cmdRestart(opts) {
  await cmdStop(opts);
  return cmdStart(opts);
}

// --- 生成器（wc3-pipeline :3460）生命周期 ---
// 定位唯一定位 = config.json 的 pipeline.entry（install.sh / npm 安装时写入）
// 状态探测直接打 /api/status，与 server.mjs 一致

const PIPELINE_PORT = 3460;
const PIPELINE_PID_FILE = join(PID_DIR, 'pipeline.pid');
const PIPELINE_LOG_FILE = '/tmp/wc3-pipeline.log';

function findPipelineBinary() {
  try {
    return execFileSync('which', ['wc3-pipeline'], { encoding: 'utf-8' }).trim();
  } catch { return null; }
}

// 从 skill 目录的 dist/ 里就地安装生成器 tarball（随包分发、无依赖、离线可装）。
// 成功返回 wc3-pipeline 二进制路径，失败返回 null。doctor 用它做"未装则自动装"，
// 免去让用户手敲 npm i -g。
function installPipelineFromDist(skillDir) {
  try {
    const distDir = join(skillDir, 'dist');
    if (!existsSync(distDir)) return null;
    const tgz = readdirSync(distDir)
      .filter(f => /^wc3-pipeline-.*\.tgz$/.test(f))
      .sort()
      .pop();
    if (!tgz) return null;
    const tgzPath = join(distDir, tgz);
    log('检测到生成器尚未安装，正在自动安装，请稍候…');
    // 底层执行 npm i -g <skillDir>/dist/wc3-pipeline-*.tgz（离线安装，无外部依赖）
    execFileSync('npm', ['i', '-g', tgzPath], { stdio: ['ignore', 'ignore', 'inherit'] });
    log('生成器安装完成。');
    return findPipelineBinary();
  } catch (e) {
    log(`生成器自动安装失败：${e.message}`);
    return null;
  }
}

function readPipelinePidFile() {
  try {
    const v = parseInt(readFileSync(PIPELINE_PID_FILE, 'utf-8').trim(), 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

function checkPipelinePort(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PIPELINE_PORT, path: '/api/status', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ listening: true, data: JSON.parse(body) }); }
        catch { resolve({ listening: true, data: null }); }
      });
    });
    req.on('error', () => resolve({ listening: false }));
    req.on('timeout', () => { req.destroy(); resolve({ listening: false }); });
  });
}

async function cmdPipelineStart(opts) {
  let binary = findPipelineBinary();
  if (!binary) {
    const skillDir = readConfigValue('skillDir');
    if (skillDir) binary = installPipelineFromDist(skillDir);
  }
  if (!binary) {
    log('生成器组件安装失败，暂时无法启动。请重新运行一次诊断（doctor）重试；若仍失败，可联系支持。');
    // 手动兜底（供排障，不打给普通用户）：npm i -g <skillDir>/dist/wc3-pipeline-*.tgz
    process.stdout.write(JSON.stringify({ installed: false, listening: false, error: 'pipeline-not-installed' }) + '\n');
    return 1;
  }
  const existing = await checkPipelinePort();
  if (existing.listening) {
    log(`pipeline 已在 :${PIPELINE_PORT} 监听`);
    process.stdout.write(JSON.stringify({ installed: true, listening: true, port: PIPELINE_PORT, pid: readPipelinePidFile() }) + '\n');
    return 0;
  }

  mkdirSync(PID_DIR, { recursive: true });
  const out = openSync(PIPELINE_LOG_FILE, 'a');
  const child = spawn(binary, ['--serve'], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  writeFileSync(PIPELINE_PID_FILE, String(child.pid));
  log(`spawned pipeline pid=${child.pid} :${PIPELINE_PORT}, waiting up to ${opts.wait}s`);

  const deadline = Date.now() + opts.wait * 1000;
  let last = { listening: false };
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    last = await checkPipelinePort();
    if (last.listening) break;
  }
  if (!last.listening) log(`pipeline :${PIPELINE_PORT} 未就绪，看日志 ${PIPELINE_LOG_FILE}`);
  process.stdout.write(JSON.stringify({ installed: true, listening: last.listening, port: PIPELINE_PORT, pid: child.pid }) + '\n');
  return last.listening ? 0 : 1;
}

async function cmdPipelineStop() {
  const pid = readPipelinePidFile();
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); log(`sent SIGTERM to pipeline pid=${pid}`); }
    catch (e) { log(`kill pipeline pid=${pid} failed: ${e.message}`); }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!(await checkPipelinePort()).listening) break;
      await new Promise(r => setTimeout(r, 200));
    }
    try { unlinkSync(PIPELINE_PID_FILE); } catch {}
  } else {
    log('no pipeline pid file, nothing to stop');
  }
  process.stdout.write(JSON.stringify({ listening: await checkPipelinePort().then(r => r.listening), stopped: true }) + '\n');
  return 0;
}

async function cmdPipelineStatus(opts) {
  const r = await checkPipelinePort(opts.timeout * 1000);
  const binary = findPipelineBinary();
  const out = { installed: !!binary, listening: r.listening, port: PIPELINE_PORT, pid: readPipelinePidFile(), running: r.data?.running ?? [] };
  process.stdout.write(JSON.stringify(out) + '\n');
  return r.listening ? 0 : 1;
}

async function cmdPipelineRestart(opts) {
  await cmdPipelineStop();
  return cmdPipelineStart(opts);
}

// --- 配置写入（ak / appBase）---

function writeConfig(patch) {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')); } catch {}
  Object.assign(cfg, patch);
  mkdirSync(PID_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

async function cmdConfig(args) {
  const key = args[0];
  const value = args[1];
  if (!key || !value) {
    log('用法: webclaw3 config ak <access-key> [--app-base <url>]');
    log('AK 在 wc3-app 网页登录后获取（生成/拉经验/回传需要）');
    return 1;
  }
  if (key !== 'ak') {
    log(`暂只支持 config ak；收到: ${key}`);
    return 1;
  }
  let appBase = null;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--app-base' && args[i + 1]) appBase = args[++i];
  }
  const patch = { ak: value };
  if (appBase) patch.appBase = appBase;
  writeConfig(patch);
  log(`config.json 已写: ak=${value.slice(0, 6)}…${appBase ? ` appBase=${appBase}` : ''}`);
  process.stdout.write(JSON.stringify({ ok: true, ak: true, appBase: appBase ?? null }) + '\n');
  return 0;
}

// --- Doctor ---

function isChromeRunning() {
  try {
    execFileSync('pgrep', ['-f', 'Google Chrome|google-chrome|chromium'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// 读 Chrome Preferences 判断 wc3 扩展是否安装过（未打包扩展记录在 extensions.settings，
// macOS 上多在 Secure Preferences）。返回 true/false/null（null=无法判断）
// 注：新版 macOS 对 Chrome 配置目录有 TCC 保护，读取会 EPERM，此时返回 null，
// doctor 给合并建议（实测 2026-07：darwin 上即使完整权限也读不到）
function detectExtensionInstalled() {
  const roots = process.platform === 'darwin'
    ? [join(homedir(), 'Library/Application Support/Google/Chrome')]
    : [join(homedir(), '.config/google-chrome'), join(homedir(), '.config/chromium')];
  let sawSettings = false;
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let profiles = [];
    try { profiles = readdirSync(root).filter(d => d === 'Default' || d.startsWith('Profile ')); } catch { continue; }
    for (const profile of profiles) {
      for (const file of ['Secure Preferences', 'Preferences']) {
        const fp = join(root, profile, file);
        if (!existsSync(fp)) continue;
        try {
          const settings = JSON.parse(readFileSync(fp, 'utf-8'))?.extensions?.settings;
          if (!settings) continue;
          sawSettings = true;
          for (const ext of Object.values(settings)) {
            const name = ext?.manifest?.name || '';
            const path = ext?.path || '';
            if (name === 'wc3' || /wc3-chrome[\/\\]extension/.test(path)) return true;
          }
        } catch { /* 单个文件解析失败不影响其它 profile */ }
      }
    }
  }
  return sawSettings ? false : null;
}

function readConfigValue(key) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return cfg?.[key] ?? null;
  } catch { return null; }
}

// 探测 Code CLI：生成器 spawn 的 LLM。优先级：
//   1. config.codeCli.command（已注册）且可用 → 直接用
//   2. PATH 上的 claude / codebuddy / qodercli
//   3. WorkBuddy 内置 CLI（同目录 codebuddy shim，复用 WorkBuddy 登录态，用户零安装零费用）
// 探测到可用项时幂等回写 config.codeCli（含覆盖已失效的旧配置）
function detectCodeCli() {
  const candidates = [
    { type: 'claude-code', command: 'claude' },
    { type: 'codebuddy-code', command: 'codebuddy' },
    { type: 'qoder-code', command: 'qodercli' },
    { type: 'codebuddy-code', command: join(__dirname, 'codebuddy') },  // WorkBuddy 内置 shim
  ];
  const registered = readConfigValue('codeCli');

  const probe = (command) => {
    try { return execFileSync(command, ['--version'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
  };

  if (registered?.command) {
    const version = probe(registered.command);
    if (version) return { type: registered.type || null, command: registered.command, found: true, version };
    log(`registered codeCli 不可用（${registered.command}），重新探测...`);
  }

  for (const c of candidates) {
    const version = probe(c.command);
    if (!version) continue;
    if (!registered || registered.command !== c.command || registered.type !== c.type) {
      writeConfig({ codeCli: { type: c.type, command: c.command } });
      log(`codeCli registered: ${c.type} → ${c.command}`);
    }
    return { type: c.type, command: c.command, found: true, version };
  }
  const fallback = registered?.command || 'claude';
  return { type: registered?.type || null, command: fallback, found: false, version: null };
}

async function cmdDoctor(opts) {
  const advice = [];

  // 0. 注册 skill 安装路径到 ~/.webclaw3/config.json（幂等）：
  //    用户电脑常有多个 AI 产品、多份 skill 安装，webclaw3 各组件以 config.skillDir 为唯一定位，最近一次 doctor 生效
  const skillDir = registerSkillDir();

  // 1. Node 版本（relay 依赖原生 WebSocket）
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const nodeOk = nodeMajor >= 22;
  if (!nodeOk) advice.push(`Node ${process.version} 过低，需要 >= 22`);

  // 2. relay：未监听则自动启动
  let relay = await checkPort(opts.port);
  let justStarted = false;
  if (!relay.listening) {
    log('relay not listening, auto-starting...');
    const started = await startRelayCore(opts);
    relay = { listening: started.listening, extensionConnected: started.extensionConnected };
    justStarted = true;
  }
  if (!relay.listening) advice.push(`relay 启动失败，查看日志 ${LOG_FILE}`);

  // 3. 扩展连接：扩展 keepalive 每 20s 重连，刚启动 relay 时多等一会
  let extConnected = relay.extensionConnected;
  if (relay.listening && !extConnected) {
    const deadline = Date.now() + (justStarted ? 25000 : 5000);
    log(`extension not connected, waiting up to ${justStarted ? 25 : 5}s...`);
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      if ((await checkPort(opts.port)).extensionConnected) { extConnected = true; break; }
    }
  }

  // 4. 未连接 → 区分三种情况。全程不碰 cdp-start（CDP 懒启动，探索中 CSP 兜底时才用）
  let chromeRunning = null;
  let extInstalled = null;
  if (relay.listening && !extConnected) {
    chromeRunning = isChromeRunning();
    if (!chromeRunning) {
      advice.push('Chrome 未运行：请打开 Chrome，扩展会在 20 秒内自动连上，然后重跑 doctor');
    } else {
      extInstalled = detectExtensionInstalled();
      if (extInstalled === false) {
        advice.push('未检测到 wc3 扩展：下载 https://github.com/fatmind/webclaw3/blob/main/dist/wc3-chrome-extension-0.6.0.zip → 解压 zip → 打开 chrome://extensions/ → 右上角开「开发者模式」→「加载已解压的扩展程序」→ 选刚解压后的文件夹');
      } else if (extInstalled === true) {
        advice.push('扩展已安装但未连接：到 chrome://extensions 确认 wc3 未被禁用，点「重新加载」后等 20 秒重跑 doctor');
      } else {
        advice.push('无法确认扩展是否安装：请打开 chrome://extensions 检查——没装则下载 https://github.com/fatmind/webclaw3/blob/main/dist/wc3-chrome-extension-0.6.0.zip，解压后开启「开发者模式」→「加载已解压的扩展程序」→ 选刚解压后的文件夹；已装则确认 wc3 未被禁用并点「重新加载」，等 20 秒重跑 doctor');
      }
    }
  }

  // ── 生成四件套（本地生成需要；环境就绪≠可生成，ok 不含这层的 OK）──
  // "Chrome 登录态可用"：登录态是用户自己的、按站点，无法通用检查——
  // 以扩展连通为浏览器通道就绪的近似（生成时 explore 走真实站点登录态，按站点引导）

  // 5. Code CLI：生成器 spawn 的 LLM（烧用户 token）
  const codeCli = detectCodeCli();
  if (!codeCli.found) {
    advice.push(`未检测到可用的 AI 编码工具（${codeCli.command}）：生成功能依赖它来跑，请先安装 claude-code（命令：npm i -g @anthropic-ai/claude-code），或安装你所用的同类 AI 产品`);
  }

  // 5a. codebuddy-code 双落 skills：WorkBuddy 把 skill 装在 ~/.workbuddy/skills/，
  //     但 spawn 出的 codebuddy CLI 读 ~/.codebuddy/skills/，需 symlink
  if (codeCli.type === 'codebuddy-code') {
    const codebuddySkills = join(homedir(), '.codebuddy', 'skills');
    const codebuddySkillLink = join(codebuddySkills, 'webclaw3');
    try {
      let cur = null;
      try { cur = existsSync(codebuddySkillLink) && lstatSync(codebuddySkillLink).isSymbolicLink() ? readlinkSync(codebuddySkillLink) : null; }
      catch { /* 路径不存在或无权限 */ }
      if (cur !== skillDir) {
        mkdirSync(codebuddySkills, { recursive: true });
        try { unlinkSync(codebuddySkillLink); } catch {}
        symlinkSync(skillDir, codebuddySkillLink);
        log(`codebuddy skills symlink: ${codebuddySkillLink} → ${skillDir}`);
      }
    } catch (e) {
      advice.push(`无法创建 ~/.codebuddy/skills/webclaw3 软链（${e.message}），explore 子会话可能加载不到 webclaw3 skill`);
    }
  }

  // 6. 生成器自身（wc3-pipeline :3460）：未装则从 dist/ 就地自动安装；装了没跑则自动启动
  let pipelineBinary = findPipelineBinary();
  if (!pipelineBinary) {
    pipelineBinary = installPipelineFromDist(skillDir);
  }
  const pipelineInstalled = !!pipelineBinary;
  let pipeline = await checkPipelinePort();
  if (pipelineInstalled && !pipeline.listening) {
    log('pipeline 已装未运行，自动启动...');
    pipeline = await startPipelineCore(opts);
  }
  if (!pipelineInstalled) {
    advice.push('生成器组件自动安装失败：请重新运行一次诊断（doctor）重试；若仍失败，可联系支持。');
  } else if (!pipeline.listening) {
    advice.push(`生成器启动失败，看日志 ${PIPELINE_LOG_FILE}`);
  }

  // 7. AK 与剩余次数：生成/拉经验/回传要 AK（过期/耗尽是软性信号，不拦 doctor 的 ok）
  const ak = readConfigValue('ak');
  let quota = null;
  if (!ak) {
    advice.push('未配置 AK：wc3-app 网页登录后获取，然后跑 webclaw3 config ak <key>（生成会扣次数）');
  } else {
    quota = await checkQuota(readConfigValue('appBase'), ak);
    if (quota?.error) advice.push(`AK 校验失败（${quota.error}）：重新获取或确认 wc3-app 地址`);
    else if (quota && quota.remaining_quota === 0) advice.push('剩余次数为 0：到 wc3-app 购买额度');
  }

  const l0Ok = nodeOk && relay.listening && extConnected;
  const genOk = codeCli.found && pipelineInstalled && pipeline.listening;
  const ok = l0Ok && genOk;
  const result = {
    ok,
    ready: { explore: l0Ok, generate: genOk },
    node: { version: process.version, ok: nodeOk },
    relay: { port: opts.port, listening: relay.listening, pid: readPidFile() },
    extension: { connected: extConnected, chromeRunning, installed: extInstalled },
    skill: { dir: skillDir },
    codeCli,
    pipeline: { installed: pipelineInstalled, listening: pipeline.listening, port: PIPELINE_PORT, binary: pipelineBinary },
    ak: { configured: !!ak, remainingQuota: quota?.remaining_quota ?? null },
    advice,
  };
  for (const a of advice) log(`advice: ${a}`);
  if (ok) log('all checks passed, ready to go');
  process.stdout.write(JSON.stringify(result) + '\n');
  return ok ? 0 : 1;
}

// 供 doctor 复用的 pipeline 启动（与 cmdPipelineStart 同逻辑，但返回结果而非写 stdout）
async function startPipelineCore(opts) {
  const binary = findPipelineBinary();
  if (!binary) return { listening: false };
  mkdirSync(PID_DIR, { recursive: true });
  const out = openSync(PIPELINE_LOG_FILE, 'a');
  const child = spawn(binary, ['--serve'], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  writeFileSync(PIPELINE_PID_FILE, String(child.pid));
  const deadline = Date.now() + opts.wait * 1000;
  let last = { listening: false };
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    last = await checkPipelinePort();
    if (last.listening) break;
  }
  return last;
}

function checkQuota(appBase, ak) {
  return new Promise((resolve) => {
    const url = new URL('/api/user', appBase || 'https://webclaw3.com');
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get({ host: url.hostname, port: url.port, path: url.pathname, timeout: 3000, headers: { Authorization: `Bearer ${ak}` } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ error: `HTTP ${res.statusCode}` });
        try {
          const d = JSON.parse(body);
          resolve({ remaining_quota: d.remaining_quota ?? null });
        } catch { resolve({ error: '响应非 JSON' }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: '超时' }); });
  });
}

/** 把本 skill 安装目录（scripts/ 的上级）登记到 config.json 的 skillDir，幂等回写 */
function registerSkillDir() {
  const skillDir = dirname(__dirname);
  try {
    let cfg = {};
    try { cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')); } catch { /* 首次无配置 */ }
    if (cfg.skillDir !== skillDir) {
      cfg.skillDir = skillDir;
      mkdirSync(PID_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, JSON.stringify(cfg));
      log(`skillDir registered: ${skillDir}`);
    }
  } catch (e) {
    log(`skillDir register failed: ${e.message}`);
  }
  return skillDir;
}

// --- CDP Proxy commands ---

function readCdpPidFile() {
  try {
    const v = parseInt(readFileSync(CDP_PID_FILE, 'utf-8').trim(), 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

function checkCdpPort(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ listening: true, connected: !!data.connected, raw: data });
        } catch {
          resolve({ listening: true, connected: false, raw: body });
        }
      });
    });
    req.on('error', () => resolve({ listening: false, connected: false }));
    req.on('timeout', () => { req.destroy(); resolve({ listening: false, connected: false }); });
  });
}

async function cmdCdpStart(opts) {
  const port = opts.port || CDP_DEFAULT_PORT;
  const existing = await checkCdpPort(port);
  if (existing.listening) {
    log(`CDP proxy port ${port} already listening`);
    const out = { port, ...existing, pid: readCdpPidFile() };
    process.stdout.write(JSON.stringify(out) + '\n');
    return 0;
  }

  if (!existsSync(CDP_SCRIPT)) {
    log(`CDP proxy script not found: ${CDP_SCRIPT}`);
    process.stdout.write(JSON.stringify({ port, listening: false, connected: false, error: 'cdp-script-not-found' }) + '\n');
    return 1;
  }

  mkdirSync(PID_DIR, { recursive: true });

  const out = openSync(CDP_LOG_FILE, 'a');
  const child = spawn('node', [CDP_SCRIPT, String(port)], {
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  writeFileSync(CDP_PID_FILE, String(child.pid));
  log(`spawned CDP proxy pid=${child.pid} port=${port}, waiting up to ${opts.wait}s`);

  const deadline = Date.now() + opts.wait * 1000;
  let last = { listening: false, connected: false };
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    last = await checkCdpPort(port);
    if (last.listening) break;
  }

  const result = { port, ...last, pid: child.pid };
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!last.listening) {
    log(`CDP proxy port ${port} not listening after ${opts.wait}s; check ${CDP_LOG_FILE}`);
    return 1;
  }
  return 0;
}

async function cmdCdpStop(opts) {
  const port = opts.port || CDP_DEFAULT_PORT;
  const pid = readCdpPidFile();
  if (!pid) {
    log('CDP proxy: no pid file, nothing to stop');
    process.stdout.write(JSON.stringify({ port, listening: false, connected: false, stopped: false }) + '\n');
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    log(`sent SIGTERM to CDP proxy pid=${pid}`);
  } catch (e) {
    log(`kill CDP proxy pid=${pid} failed: ${e.message}`);
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await checkCdpPort(port)).listening) break;
    await new Promise(r => setTimeout(r, 200));
  }
  try { unlinkSync(CDP_PID_FILE); } catch {}
  process.stdout.write(JSON.stringify({ port, listening: false, connected: false, stopped: true }) + '\n');
  return 0;
}

async function cmdCdpStatus(opts) {
  const port = opts.port || CDP_DEFAULT_PORT;
  const r = await checkCdpPort(port, opts.timeout * 1000);
  const out = { port, ...r, pid: readCdpPidFile() };
  process.stdout.write(JSON.stringify(out) + '\n');
  return r.listening ? 0 : 1;
}

async function cmdCdpRestart(opts) {
  await cmdCdpStop(opts);
  return cmdCdpStart(opts);
}

async function main() {
  const sub = process.argv[2];
  if (!sub || sub === '-h' || sub === '--help') {
    printUsage();
    process.exit(0);
  }
  const opts = parseOpts(process.argv.slice(3));
  const isCdp = sub.startsWith('cdp-');
  if (!process.argv.slice(3).includes('--port')) {
    opts.port = isCdp ? CDP_DEFAULT_PORT : DEFAULT_PORT;
  }

  let code = 1;
  try {
    switch (sub) {
      case 'doctor':      code = await cmdDoctor(opts);      break;
      case 'start':       code = await cmdStart(opts);       break;
      case 'stop':        code = await cmdStop(opts);        break;
      case 'status':      code = await cmdStatus(opts);      break;
      case 'restart':     code = await cmdRestart(opts);     break;
      case 'cdp-start':   code = await cmdCdpStart(opts);    break;
      case 'cdp-stop':    code = await cmdCdpStop(opts);     break;
      case 'cdp-status':  code = await cmdCdpStatus(opts);   break;
      case 'cdp-restart': code = await cmdCdpRestart(opts);  break;
      case 'pipeline-start':   code = await cmdPipelineStart(opts);   break;
      case 'pipeline-stop':    code = await cmdPipelineStop();        break;
      case 'pipeline-status':  code = await cmdPipelineStatus(opts);  break;
      case 'pipeline-restart': code = await cmdPipelineRestart(opts); break;
      case 'config':      code = await cmdConfig(process.argv.slice(3)); break;
      default:
        log(`unknown subcommand: ${sub}`);
        printUsage();
        code = 1;
    }
  } catch (e) {
    log(`error: ${e.message}`);
    process.stdout.write(JSON.stringify({ port: opts.port, error: e.message }) + '\n');
    code = 1;
  }
  process.exit(code);
}

main();
