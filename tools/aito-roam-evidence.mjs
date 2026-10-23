/* アイトが画面の中を動き回る遊びを、実ブラウザ(headless Chrome・CDP)で確かめる。
     node _build/build.mjs && node tools/aito-roam-evidence.mjs <出力dir>
   dist/ を手元の http で配る。測るもの: 格子・移動の時間と距離・休み・触れると止まる・開くと定位置・
   画面の中に収まる・部位は動かない(図形の transform が正本の三つだけ)・コマの間隔・JS の自分の時間・reduced-motion・スマートフォンの幅 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = process.argv[2]; if (!outDir) { console.error("使い方: aito-roam-evidence.mjs <出力dir>"); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = normalize(decodeURIComponent(u.pathname)); if (p.endsWith("\\") || p.endsWith("/")) p += "index.html";
  const f = join(dist, p); if (!f.startsWith(dist) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f));
});
const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
const base = `http://127.0.0.1:${port}`;
const CDP = 9348;
const chromePath = [process.env["CHROME_PATH"], join(process.env["LOCALAPPDATA"] ?? "", "Google/Chrome/Application/chrome.exe"), "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => p && existsSync(p));
const chrome = spawn(chromePath, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "roam-chrome-"))}`, "--headless=new", "--no-first-run", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
let ver = null; for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(250); } }
const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
async function openTab(url, metrics, media = []) {
  const t = await send("Target.createTarget", { url: "about:blank", newWindow: true }); const s = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
  await send("Runtime.enable", {}, s); await send("Page.enable", {}, s);
  await send("Emulation.setDeviceMetricsOverride", metrics, s);
  if (media.length) await send("Emulation.setEmulatedMedia", { features: media }, s);
  await send("Page.navigate", { url }, s); await send("Page.bringToFront", {}, s); return s;
}
const ev = async (s, expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value; };
const waitFor = async (s, expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(s, expr)) return Date.now() - t0; } catch { /* まだ */ } await sleep(40); } return null; };
const rect = (s) => ev(s, "JSON.stringify(document.getElementById('chatbot-button').getBoundingClientRect())").then(JSON.parse);
const mode = (s) => ev(s, "document.querySelector('[data-aito-roam]').getAttribute('data-aito-roam') + ':' + (document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest') ? 'rest' : 'move')");
const full = async (s, name) => { const png = await send("Page.captureScreenshot", { format: "png" }, s); writeFileSync(join(outDir, name), Buffer.from(png.result.data, "base64")); return name; };
const mouse = (s, x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, pointerType: "mouse" }, s);
const PC = { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false };

const out = { at: new Date().toISOString(), base, steps: {} };
try {
  const s = await openTab(`${base}/`, PC);
  await waitFor(s, "!!window.AitoRoam && !!window.AitoRoam.live");
  // 乱数を固定し、休みを短く(2 秒)して観察しやすくする
  await ev(s, "window.AitoRoam.live.setRandom(() => 0); true");
  out.steps.initial = { mode: await mode(s), rect: await rect(s), grid: await ev(s, "JSON.stringify(window.AitoRoam.live.grid())") };
  out.steps.shots = { home: await full(s, "1_定位置.png") };
  // 最初の休み(2 秒)の後に歩き出す → 目的地へ着く → また休む
  out.steps.walk1 = { startMs: await waitFor(s, "document.querySelector('[data-aito-roam]').getAttribute('data-aito-roam') === 'roam' && !document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 9000) };
  await sleep(200); out.steps.walk1.midRect = await rect(s); out.steps.walk1.ms = await ev(s, "getComputedStyle(document.querySelector('[data-aito-roam]')).transitionDuration");
  out.steps.walk1.arriveMs = await waitFor(s, "document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 8000);
  out.steps.walk1.endRect = await rect(s); out.steps.walk1.cell = await ev(s, "JSON.stringify(window.AitoRoam.live.cell())");
  out.steps.shots.arrived = await full(s, "2_着いた所.png");
  // 二歩目: 画面の中に収まる。図形の transform は正本の三つの動き以外に無い
  out.steps.walk2 = { startMs: await waitFor(s, "!document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 4000) };
  out.steps.walk2.arriveMs = await waitFor(s, "document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 8000);
  out.steps.walk2.endRect = await rect(s);
  out.steps.parts = await ev(s, "document.querySelector('.aito--launcher').getAnimations({ subtree: true }).map(a => a.animationName || ('transition:' + (a.transitionProperty || ''))).sort()");
  // 触れると止まる(held)。離れると休んでからまた歩く
  const r2 = out.steps.walk2.endRect; await mouse(s, r2.x + r2.width / 2, r2.y + r2.height / 2);
  out.steps.hold = { heldMs: await waitFor(s, "document.querySelector('[data-aito-roam]').getAttribute('data-aito-roam') === 'held'", 1000) };
  await sleep(2500); const r3 = await rect(s); out.steps.hold.stayed = Math.hypot(r3.x - r2.x, r3.y - r2.y) < 4;
  await mouse(s, 10, 10); out.steps.hold.releasedMs = await waitFor(s, "document.querySelector('[data-aito-roam]').getAttribute('data-aito-roam') === 'roam'", 1000);
  // 開くと定位置へ。閉じるとまた歩く
  await ev(s, "document.getElementById('chatbot-button').click()");
  out.steps.open = { homeMs: await waitFor(s, "document.querySelector('[data-aito-roam]').getAttribute('data-aito-roam') === 'home'", 1000) };
  await sleep(800); out.steps.open.rect = await rect(s); out.steps.open.windowRect = await ev(s, "JSON.stringify(document.getElementById('chatbot-window').getBoundingClientRect())").then(JSON.parse);
  out.steps.shots.open = await full(s, "3_会話を開く.png");
  await ev(s, "document.getElementById('chatbot-close').click()");
  out.steps.open.roamAgainMs = await waitFor(s, "document.querySelector('[data-aito-roam]').getAttribute('data-aito-roam') === 'roam'", 1000);
  // 速さ: 歩いている 3 秒のコマの間隔と、アイト自身の JS の時間
  await waitFor(s, "!document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 4000);
  await send("Profiler.enable", {}, s); await send("Profiler.start", {}, s);
  const gaps = (await ev(s, "new Promise(r => { const g = []; let last = performance.now(); const start = last; const tick = (t) => { g.push(t - last); last = t; if (t - start < 3000) requestAnimationFrame(tick); else r(g); }; requestAnimationFrame(tick); })")).slice(1).sort((a, b) => a - b);
  const prof = (await send("Profiler.stop", {}, s)).result.profile; await send("Profiler.disable", {}, s);
  const byId = new Map(prof.nodes.map((n) => [n.id, n])); let us = 0; for (let i = 0; i < prof.samples.length; i++) { const n = byId.get(prof.samples[i]); if (n && /aito-roam/.test(n.callFrame.url)) us += prof.timeDeltas[i] || 0; }
  const q = (p) => Math.round(gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] * 10) / 10;
  out.steps.perf = { frames: gaps.length, p50Ms: q(0.5), p95Ms: q(0.95), aitoSelfMsDuring3s: Math.round(us / 1000) };
  // 画面の中に収まり続けるか: 8 歩ぶんの着地点を集める(休みは 2 秒)
  const landings = [];
  for (let i = 0; i < 6; i++) { await waitFor(s, "!document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 4000); await waitFor(s, "document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 8000); const lr = await rect(s); landings.push(Object.assign(lr, { mode: await mode(s), cell: await ev(s, "JSON.stringify(window.AitoRoam.live.cell())") })); }
  out.steps.landings = landings.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), mode: r.mode, cell: r.cell, inside: r.x >= 0 && r.y >= 60 && r.x + r.width <= 1200 && r.y + r.height <= 900 }));
  // reduced-motion: 定位置のまま
  const r = await openTab(`${base}/`, PC, [{ name: "prefers-reduced-motion", value: "reduce" }]);
  await waitFor(r, "!!window.AitoRoam && !!window.AitoRoam.live"); await sleep(3500);
  out.steps.reduced = { mode: await mode(r) };
  // スマートフォンの幅: 格子 2×4 で動き回り、画面に収まる
  const m = await openTab(`${base}/`, { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(m, "!!window.AitoRoam && !!window.AitoRoam.live"); await ev(m, "window.AitoRoam.live.setRandom(() => 0.5); true");
  out.steps.mobile = { grid: await ev(m, "JSON.stringify(window.AitoRoam.live.grid())") };
  await waitFor(m, "!document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 4000); await waitFor(m, "document.querySelector('[data-aito-roam]').hasAttribute('data-aito-rest')", 8000);
  const mr = await rect(m); out.steps.mobile.rect = mr; out.steps.mobile.inside = mr.x >= 0 && mr.y >= 60 && mr.x + mr.width <= 390 && mr.y + mr.height <= 844;
  out.steps.shots.mobile = await full(m, "4_スマホ.png");
} catch (e) { out.error = String(e && e.stack || e); } finally {
  out.pageErrors = errors;
  const st = out.steps; const moved = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y);
  out.checks = {
    "最初は定位置で休み、少ししてから歩き出す": st.initial?.mode === "roam:rest" && st.walk1?.startMs !== null,
    "目的地へ着いたら休む。着地点は定位置と違う所": st.walk1?.arriveMs !== null && (moved(st.initial?.rect, st.walk1?.endRect) ?? 0) > 100,
    "歩く時間は距離に応じる(0.8〜6 秒)": (() => { const ms = parseFloat(st.walk1?.ms ?? "0") * 1000; return ms >= 800 && ms <= 6000; })(),
    "図形の中で動くのは正本の三つ(浮遊・まばたき・荷物)だけ": JSON.stringify([...new Set(st.parts ?? [])]) === JSON.stringify(["aito-blink", "aito-carry", "aito-float"]),
    "触れると止まり、離れるとまた歩く": st.hold?.heldMs !== null && st.hold?.stayed === true && st.hold?.releasedMs !== null,
    "開くと定位置へ戻り、会話面は画面に収まる。閉じるとまた歩く": st.open?.homeMs !== null && (moved(st.open?.rect, st.initial?.rect) ?? 99) < 4 && (st.open?.windowRect?.x ?? -1) >= 0 && (st.open?.windowRect?.y ?? -1) >= 0 && st.open?.roamAgainMs !== null,
    "着地点はすべて画面の中(ヘッダーの帯と端を避ける)": (st.landings ?? []).length === 6 && (st.landings ?? []).every((l) => l.inside),
    "歩いている間も 60fps(p95 ≤ 20ms)で、アイト自身の JS は 3 秒で 30ms 以下": (st.perf?.p95Ms ?? 99) <= 20 && (st.perf?.aitoSelfMsDuring3s ?? 999) <= 30,
    "reduced-motion では定位置のまま": st.reduced?.mode === "home:move",
    "スマートフォンの幅でも動き回り、画面に収まる": st.mobile?.inside === true,
    "画面の例外なし": errors.length === 0,
  };
  out.pass = !out.error && Object.values(out.checks).every(Boolean);
  writeFileSync(join(outDir, "aito_roam_evidence.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ checks: out.checks, pass: out.pass, perf: st.perf, landings: st.landings, error: out.error }, null, 2));
  ws.close(); chrome.kill(); server.close();
}
