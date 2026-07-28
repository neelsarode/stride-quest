#!/usr/bin/env node
/**
 * capture-ui-export.mjs — the headless half of the UI bake pipeline.
 *
 * ui-export-rig.html renders assets/ui-kit.js into every class kit's PNG chrome
 * and stages it on window.__EXPORTS_ALL. RN has no canvas, so this script drives
 * a headless Chrome to load the rig and dump that global to ui-export-all.json,
 * which scripts/pack-ui.mjs then decodes. (Same "rig renders, script packs"
 * house rule as fx-anchors / pack-sprites; before Approach 2 this step was a
 * manual browser DOWNLOAD click.)
 *
 * Zero npm deps: a ~20-line static server + CDP over Node's global WebSocket
 * (Node >= 21). Chrome is discovered from the puppeteer/playwright caches or a
 * system install; override with CHROME_BIN=/path/to/chrome.
 *
 *   node scripts/capture-ui-export.mjs   →   ui-export-all.json   →   npm run pack-ui
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "ui-export-all.json");
const PORT = 8894;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -- 1. find a Chrome/Chromium binary ------------------------------------- */
function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const globs = [
    `${os.homedir()}/.cache/puppeteer/chrome`,
    `${os.homedir()}/Library/Caches/ms-playwright`,
  ];
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === "Google Chrome for Testing" || e.name === "chrome" || e.name === "Chromium") found.push(p);
    }
  };
  for (const g of globs) walk(g, 0);
  const systemPaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  for (const p of systemPaths) if (fs.existsSync(p)) found.push(p);
  if (!found.length) throw new Error("No Chrome found. Set CHROME_BIN=/path/to/chrome.");
  return found[0];
}

/* -- 2. tiny static server for the repo root (rig needs http, not file://) - */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css" };
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    const fp = path.join(ROOT, rel);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end("nf"); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/* -- 3. CDP over Node's global WebSocket ----------------------------------- */
function cdpClient(ws) {
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msg = { id: ++id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(msg));
    });
  return { send, errors };
}

async function main() {
  const chromeBin = findChrome();
  console.log("capture-ui-export: chrome =", chromeBin);
  const server = await serve();
  const profile = mkdtempSync(path.join(os.tmpdir(), "ui-capture-chrome-"));
  const dbgPort = 9355;
  const chrome = spawn(chromeBin, [
    "--headless=new", `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "--mute-audio",
  ], { stdio: "ignore" });

  const cleanup = () => { try { chrome.kill(); } catch {} try { server.close(); } catch {} };
  try {
    let wsUrl;
    for (let i = 0; i < 50 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://localhost:${dbgPort}/json/version`)).json()).webSocketDebuggerUrl; }
      catch { await sleep(200); }
    }
    if (!wsUrl) throw new Error("Chrome DevTools endpoint never came up");

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
    const { send, errors } = cdpClient(ws);
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Runtime.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Page.navigate", { url: `http://localhost:${PORT}/ui-export-rig.html` }, sessionId);

    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      await sleep(200);
      const r = await send("Runtime.evaluate", { expression: "typeof window.__EXPORTS_ALL === 'object'", returnByValue: true }, sessionId);
      ready = r.result.value === true;
    }
    if (!ready) throw new Error("rig never staged window.__EXPORTS_ALL");
    if (errors.length) throw new Error("rig console errors:\n" + errors.join("\n"));

    const r = await send("Runtime.evaluate", { expression: "window.__EXPORTS_ALL_JSON", returnByValue: true }, sessionId);
    const json = r.result.value;
    fs.writeFileSync(OUT, json);
    const kits = Object.keys(JSON.parse(json));
    console.log(`capture-ui-export: wrote ${path.relative(ROOT, OUT)} — ${kits.length} kits [${kits.join(", ")}], ${(json.length / 1024 / 1024).toFixed(1)} MB`);
    ws.close();
  } finally {
    cleanup();
  }
  process.exit(0);
}
main().catch((e) => { console.error("capture-ui-export FAILED:", e.message); process.exit(1); });
