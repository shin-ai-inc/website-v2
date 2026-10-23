/* アイトの常時の生きた動きを、実ブラウザ(headless Chrome・CDP)で確かめる。
     node _build/build.mjs && node tools/aito-evidence.mjs <出力dir>
   dist/ を手元の http で配り(会話の API は同じ住所で模擬)、起動UIの状態・視線・休み・速さを測る。
   外への通信はしない。鍵も使わない。 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = process.argv[2]; if (!outDir) { console.error("使い方: aito-evidence.mjs <出力dir>"); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const REPLY = "ご質問ありがとうございます。暗黙知の解消は、現場の会話を記録し、根拠つきで整理することから始めます。";
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "POST" && u.pathname === "/api/chatbot") {
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ success: true, response: REPLY })); }, 1500);
    return;
  }
  let p = normalize(decodeURIComponent(u.pathname)); if (p.endsWith("\\") || p.endsWith("/")) p += "index.html";
  const f = join(dist, p); if (!f.startsWith(dist) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f));
});
const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
const base = `http://127.0.0.1:${port}`;

const CDP = 9346;
const chromePath = [process.env["CHROME_PATH"], join(process.env["LOCALAPPDATA"] ?? "", "Google/Chrome/Application/chrome.exe"), "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => p && existsSync(p));
const chrome = spawn(chromePath, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "aito-chrome-"))}`, "--headless=new", "--no-first-run", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
let ver = null; for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(250); } }
const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
async function openTab(url, media = []) {
  const t = await send("Target.createTarget", { url: "about:blank", newWindow: true }); const s = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
  await send("Runtime.enable", {}, s); await send("Page.enable", {}, s); await send("Performance.enable", {}, s);
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, s);
  if (media.length) await send("Emulation.setEmulatedMedia", { features: media }, s);
  await send("Page.navigate", { url }, s); return s;
}
const ev = async (s, expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value; };
const waitFor = async (s, expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(s, expr)) return Date.now() - t0; } catch { /* まだ */ } await sleep(40); } return null; };
const state = (s) => ev(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state')");
const metrics = async (s) => Object.fromEntries(((await send("Performance.getMetrics", {}, s)).result?.metrics ?? []).map((m) => [m.name, m.value]));
const shot = async (s, name) => { const r = await ev(s, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())"); const b = JSON.parse(r); const png = await send("Page.captureScreenshot", { format: "png", clip: { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24, scale: 3 } }, s); writeFileSync(join(outDir, name), Buffer.from(png.result.data, "base64")); return name; };
const mouse = (s, x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, pointerType: "mouse" }, s);

const out = { at: new Date().toISOString(), base, steps: {} };
try {
  const s = await openTab(`${base}/`);
  await waitFor(s, "!!document.querySelector('[data-aito-state]') && !!window.AitoLife && !!window.AitoLife.live");
  const b = JSON.parse(await ev(s, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())"));
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  out.steps.initial = { rect: b, state: await state(s), animations: await ev(s, "document.querySelector('.aito--launcher').getAnimations({ subtree: true }).map(a => a.animationName).sort()") };
  out.steps.shots = { idle: await shot(s, "1_idle.png") };
  // 視線: 左上の遠くを指す → 瞳が左上へ。中心へ戻す → 0
  await mouse(s, cx - 400, cy - 300); await sleep(220);
  await send("Page.bringToFront", {}, s);
  out.steps.gaze = { far: await ev(s, "JSON.stringify(window.AitoLife.live.gaze())"), eyesTransform: await ev(s, "getComputedStyle(document.querySelector('.aito-eyes')).transform"), bodyTransform: await ev(s, "getComputedStyle(document.querySelector('.aito--launcher .aito-body')).transform") };
  out.steps.shots.gazeLeftUp = await shot(s, "2_gaze_left_up.png");
  await mouse(s, cx, cy + 1); await sleep(220);
  out.steps.gaze.center = await ev(s, "JSON.stringify(window.AitoLife.live.gaze())");
  // まばたき: 10 秒で瞳の縦が 0.5 未満になる回数(4.6 秒周期 → 2 回前後)
  // まばたきの時計が進んでいること(Web Animations の currentTime)と、瞳が実際に閉じる瞬間があること(描画の値)の両方を 10 秒見る
  out.steps.blinks = await ev(s, "new Promise(r => { let n = 0, closed = false; const eye = document.querySelector('.aito-eye'); const a = eye.getAnimations().find(x => x.animationName === 'aito-blink'); const t0 = a ? a.currentTime : null; const t = setInterval(() => { const m = getComputedStyle(eye).transform; const sy = m.startsWith('matrix(') ? Number(m.split(',')[3]) : 1; if (sy < 0.5 && !closed) { n++; closed = true; } if (sy >= 0.5) closed = false; }, 30); setTimeout(() => { clearInterval(t); r({ seen: n, clockMs: a ? Math.round(a.currentTime - t0) : null, visibility: document.visibilityState }); }, 10000); })");
  // 居場所: 下へ読み進める → 端へ引く(peek)。上へ戻る → 出る(here)。終わりまで → 出る。触れる → 出る
  const presence = () => ev(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence')");
  out.steps.presence = { start: await presence() };
  await ev(s, "window.scrollTo(0, 300)"); out.steps.presence.afterDownMs = await waitFor(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'peek'", 1000);
  await sleep(700); out.steps.presence.peekTransform = await ev(s, "getComputedStyle(document.querySelector('.chatbot')).transform"); out.steps.presence.peekRect = JSON.parse(await ev(s, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())"));
  out.steps.shots.peek = await shot(s, "0_peek.png");
  await ev(s, "window.scrollTo(0, 200)"); out.steps.presence.afterUpMs = await waitFor(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'here'", 1000);
  await ev(s, "window.scrollTo(0, 900)"); await waitFor(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'peek'", 1000);
  await ev(s, "window.scrollTo(0, document.documentElement.scrollHeight)"); out.steps.presence.atEndMs = await waitFor(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'here'", 1000);
  await ev(s, "window.scrollTo(0, 0)"); await sleep(50); await ev(s, "window.scrollTo(0, 400)"); await waitFor(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'peek'", 1000);
  await sleep(650); const pb = JSON.parse(await ev(s, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())")); await mouse(s, pb.x + 6, pb.y + pb.height / 2);
  out.steps.presence.hoverAt = await ev(s, `(() => { const e = document.elementFromPoint(${pb.x + 6}, ${pb.y + pb.height / 2}); return e ? e.tagName + '.' + e.getAttribute('class') : null; })()`);
  out.steps.presence.hoverMs = await waitFor(s, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'here'", 1000);
  await mouse(s, cx, cy + 1); await ev(s, "window.scrollTo(0, 0)"); await sleep(700);
  // スクロールの向きへ目をやる → 1.2 秒以内に戻る
  await ev(s, "window.scrollTo(0, 600)"); const glanceOn = await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-glance') === 'down'", 1000);
  const glanceOff = await waitFor(s, "!document.querySelector('[data-aito-state]').hasAttribute('data-aito-glance')", 2500);
  await ev(s, "window.scrollTo(0, 0)"); await sleep(1200);
  out.steps.glance = { onMs: glanceOn, offMs: glanceOff };
  // 開く → 喜ぶ → 自然に idle
  await ev(s, "document.getElementById('chatbot-button').click()");
  out.steps.open = { joyMs: await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state') === 'joy'", 500) };
  out.steps.shots.joy = await shot(s, "3_joy.png");
  out.steps.open.backToIdleMs = await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state') === 'idle'", 3000);
  // 入力欄 → 聞く
  await ev(s, "document.getElementById('chat-input').focus()");
  out.steps.attentive = { ms: await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state') === 'attentive'", 500), eyes: await (async () => { await sleep(500); return ev(s, "getComputedStyle(document.querySelector('.aito-eyes')).transform"); })() };
  out.steps.shots.attentive = await shot(s, "4_attentive.png");
  // 送る → 考える(API を待つ) → 話す(字を打つ) → idle
  await ev(s, `window.SHINAI_CONFIG = Object.assign(window.SHINAI_CONFIG || {}, { chatbotApiBase: ${JSON.stringify(base)} }); document.getElementById('chat-input').value = '暗黙知とは何ですか'; document.getElementById('chat-send').click(); true`);
  out.steps.thinking = { ms: await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state') === 'thinking'", 500) };
  await sleep(400); out.steps.shots.thinking = await shot(s, "5_thinking.png");
  out.steps.thinking.antennaAnim = await ev(s, "document.querySelector('.ab-antdot').getAnimations().map(a => a.animationName).join(',')");
  out.steps.speaking = { ms: await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state') === 'speaking'", 4000) };
  await sleep(200); out.steps.shots.speaking = await shot(s, "6_speaking.png");
  out.steps.speaking.mouthAnim = await ev(s, "document.querySelector('.aito-mouth').getAnimations().map(a => a.animationName).join(',')");
  out.steps.speaking.idleMs = await waitFor(s, "document.querySelector('[data-aito-state]').getAttribute('data-aito-state') === 'idle'", 6000);
  await ev(s, "document.getElementById('chatbot-close').click()"); await sleep(300);
  // 休む: 画面が隠れた印 → rest・動きが止まる → 戻る
  await ev(s, "Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); true");
  await sleep(100);
  const gazeBeforeRest = await ev(s, "JSON.stringify(window.AitoLife.live.gaze())");
  out.steps.rest = { gazeBefore: gazeBeforeRest, state: await state(s), paused: await ev(s, "document.querySelector('.aito--launcher').getAnimations({ subtree: true }).map(a => a.playState)"), gazeIgnored: await (async () => { await mouse(s, cx - 300, cy - 300); await sleep(100); return ev(s, "JSON.stringify(window.AitoLife.live.gaze())"); })() };
  out.steps.shots.rest = await shot(s, "7_rest.png");
  await ev(s, "Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); true"); await sleep(100);
  out.steps.rest.resumed = await state(s);
  out.steps.rest.running = await ev(s, "document.querySelector('.aito--launcher').getAnimations({ subtree: true }).every(a => a.playState === 'running')");
  // 速さ: 3 秒間ポインターを動かし続けながらコマの間隔を測る。JS の仕事量(ScriptDuration)の増え
  const m0 = await metrics(s);
  await send("Profiler.enable", {}, s); await send("Profiler.start", {}, s);
  const frames = ev(s, "new Promise(r => { const g = []; let last = performance.now(); const tick = (t) => { g.push(t - last); last = t; if (t - start < 3000) requestAnimationFrame(tick); else r(g); }; const start = performance.now(); requestAnimationFrame(tick); })");
  for (let i = 0; i < 180; i++) { await mouse(s, cx + Math.sin(i / 9) * 350, cy + Math.cos(i / 7) * 250); await sleep(16); }
  const gaps = (await frames).slice(1).sort((a, b) => a - b); const m1 = await metrics(s);
  const prof = (await send("Profiler.stop", {}, s)).result.profile; await send("Profiler.disable", {}, s);
  const selfMs = (pred) => { const byId = new Map(prof.nodes.map((n) => [n.id, n])); let us = 0; for (let i = 0; i < prof.samples.length; i++) { const n = byId.get(prof.samples[i]); if (n && pred(n.callFrame.url)) us += prof.timeDeltas[i] || 0; } return Math.round(us / 1000); };
  const aitoMs = selfMs((u) => /aito-life/.test(u)), particlesMs = selfMs((u) => /particles|three/.test(u));
  const q = (p) => Math.round(gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] * 10) / 10;
  out.steps.perf = { frames: gaps.length, p50Ms: q(0.5), p95Ms: q(0.95), maxMs: Math.round(gaps[gaps.length - 1] * 10) / 10, scriptMsDuring3s: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), aitoSelfMsDuring3s: aitoMs, particlesSelfMsDuring3s: particlesMs, styleRecalcDuring3s: m1.RecalcStyleCount - m0.RecalcStyleCount };
  // 画面全体(PC): 居る・引く。スマートフォンの幅: 居る・引く・会話を開く
  const full = async (sess, name) => { const png = await send("Page.captureScreenshot", { format: "png" }, sess); writeFileSync(join(outDir, name), Buffer.from(png.result.data, "base64")); return name; };
  await ev(s, "window.scrollTo(0, 0)"); await sleep(700); out.steps.shots.pcHere = await full(s, "8_PC_居る.png");
  await ev(s, "window.scrollTo(0, 900)"); await sleep(800); out.steps.shots.pcPeek = await full(s, "9_PC_引く.png");
  const m = await openTab(`${base}/`); await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, m);
  await waitFor(m, "!!window.AitoLife && !!window.AitoLife.live"); await sleep(600);
  const mb = JSON.parse(await ev(m, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())"));
  out.steps.mobile = { rect: mb, inViewport: mb.x >= 0 && mb.y + mb.height <= 844 && mb.x + mb.width <= 390, tapSize: Math.min(mb.width, mb.height) };
  out.steps.shots.mobileHere = await full(m, "10_スマホ_居る.png");
  await ev(m, "window.scrollTo(0, 700)"); out.steps.mobile.peekMs = await waitFor(m, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence') === 'peek'", 1000); await sleep(800);
  out.steps.mobile.peekRect = JSON.parse(await ev(m, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())"));
  out.steps.shots.mobilePeek = await full(m, "11_スマホ_引く.png");
  await ev(m, "document.getElementById('chatbot-button').click()"); await sleep(600);
  out.steps.mobile.openPresence = await ev(m, "document.querySelector('[data-aito-presence]').getAttribute('data-aito-presence')");
  out.steps.shots.mobileOpen = await full(m, "12_スマホ_会話を開く.png");
  // reduced-motion: 視線を追わない・基本の動きも止まる
  const r = await openTab(`${base}/`, [{ name: "prefers-reduced-motion", value: "reduce" }]);
  await waitFor(r, "!!window.AitoLife && !!window.AitoLife.live");
  const rb = JSON.parse(await ev(r, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())"));
  await mouse(r, rb.x - 300, rb.y - 300); await sleep(200);
  out.steps.reducedMotion = { gaze: await ev(r, "JSON.stringify(window.AitoLife.live.gaze())"), floatDuration: await ev(r, "getComputedStyle(document.querySelector('.aito--launcher svg')).animationDuration") };
  // 読み上げ: 起動UIのラベルは変わらず、アイトは aria-hidden
  out.steps.a11y = await ev(s, "({ label: document.getElementById('chatbot-button').getAttribute('aria-label'), hidden: document.querySelector('[data-aito-state]').getAttribute('aria-hidden') })");
} catch (e) { out.error = String(e && e.stack || e); } finally {
  out.pageErrors = errors;
  const st = out.steps;
  const isMatrixOff = (m) => typeof m === "string" && m.startsWith("matrix(") && (Math.abs(parseFloat(m.split(",")[4])) > 0.3 || Math.abs(parseFloat(m.split(",")[5])) > 0.3);
  out.checks = {
    "最初は idle で、基本の三つの動き(浮遊・まばたき・荷物)が走っている": st.initial?.state === "idle" && ["aito-blink", "aito-carry", "aito-float"].every((n) => (st.initial?.animations ?? []).includes(n)),
    "指す先へ瞳と体が向き、中心へ戻すと戻る": JSON.parse(st.gaze?.far ?? "{}").x < 0 && JSON.parse(st.gaze?.far ?? "{}").y < 0 && isMatrixOff(st.gaze?.eyesTransform) && JSON.parse(st.gaze?.center ?? "{}").x === 0,
    "10 秒に 1〜3 回まばたきする(時計が 10 秒進み、瞳が閉じる瞬間が見える)": (st.blinks?.clockMs ?? 0) >= 9000 && (st.blinks?.seen ?? 0) >= 1 && (st.blinks?.seen ?? 9) <= 3,
    "スクロールの向きへ一瞬目をやり、1.2 秒以内に戻る": st.glance?.onMs !== null && st.glance?.offMs !== null && (st.glance?.offMs ?? 9e9) <= 1500,
    "開くと喜び、自然に idle へ戻る": st.open?.joyMs !== null && st.open?.backToIdleMs !== null,
    "入力欄に触れると聞く(瞳が上へ)": st.attentive?.ms !== null && typeof st.attentive?.eyes === "string" && parseFloat(st.attentive.eyes.split(",")[5]) < -0.5,
    "送ると考え(アンテナが脈打つ)→話し(口が動く)→idle": st.thinking?.ms !== null && /aito-pulse/.test(st.thinking?.antennaAnim ?? "") && st.speaking?.ms !== null && /aito-speak/.test(st.speaking?.mouthAnim ?? "") && st.speaking?.idleMs !== null,
    "画面が隠れると休み、全部の動きが止まり、視線を追わず、戻ると再開": st.rest?.state === "rest" && (st.rest?.paused ?? []).length > 0 && (st.rest?.paused ?? []).every((p) => p === "paused") && st.rest?.gazeIgnored === st.rest?.gazeBefore && st.rest?.resumed === "idle" && st.rest?.running === true,
    "ポインターを動かし続けても 60fps(p95 ≤ 20ms)で、3 秒のアイト自身の JS の仕事は 30ms 以下": (st.perf?.p95Ms ?? 99) <= 20 && (st.perf?.aitoSelfMsDuring3s ?? 999) <= 30,
    "reduced-motion では視線を追わず、浮遊も止まる": JSON.parse(st.reducedMotion?.gaze ?? "{}").x === 0 && parseFloat(st.reducedMotion?.floatDuration ?? "9") < 0.01,
    "読み上げの名札は変わらず、アイトの図形は読み上げに出ない": st.a11y?.label === "AIアシスタントに質問する" && st.a11y?.hidden === "true",
    "画面に居る(fixed): 起動UIが最初の画面の中にあり、読み進めると端へ引き、戻る・終わり・触れる、で出てくる": (st.initial?.rect?.y ?? 9999) < 900 && st.presence?.start === "here" && st.presence?.afterDownMs !== null && (st.presence?.peekRect?.y ?? 0) > (st.initial?.rect?.y ?? 0) + 15 && st.presence?.afterUpMs !== null && st.presence?.atEndMs !== null && st.presence?.hoverMs !== null,
    "スマートフォンの幅: 起動UIが画面の中にあり(44px 以上)、読み進めると端へ引き、開くと出てくる": st.mobile?.inViewport === true && (st.mobile?.tapSize ?? 0) >= 44 && st.mobile?.peekMs !== null && (st.mobile?.peekRect?.y ?? 0) > (st.mobile?.rect?.y ?? 0) + 12 && st.mobile?.openPresence === "here",
    "画面の例外なし": errors.length === 0,
  };
  out.pass = !out.error && Object.values(out.checks).every(Boolean);
  writeFileSync(join(outDir, "aito_evidence.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ checks: out.checks, pass: out.pass, perf: st.perf, blinks: st.blinks, error: out.error }, null, 2));
  ws.close(); chrome.kill(); server.close();
}
