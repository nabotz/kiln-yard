// Takes the screenshots in screenshots/ from shots.json (Node 22, standard library only): serves
// game/, opens each shot's URL in headless Chrome over the DevTools protocol at 1280x720, waits
// for the game to set window.__shotReady and saves the frame as a JPEG under 256 KiB.
//   node tools/shoot.ts            (CHROME=<path to chrome> if it is not in the usual place)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots: { name: string; query: string }[] = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = process.env.CHROME ?? CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error('Chrome not found: set CHROME to its executable');

const SERVE_PORT = 8097, DEBUG_PORT = 9337, MAX_BYTES = 262144;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(SERVE_PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'kiln-shots-'));
const browser = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

async function pageSocket(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = list.find((t: { type: string }) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not open its debugging port');
}

const ws = new WebSocket(await pageSocket());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const waiting = new Map<number, (v: any) => void>();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(String(m.data));
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)!(msg.result ?? msg); waiting.delete(msg.id); }
});
const send = (method: string, params: object = {}): Promise<any> => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  for (const shot of shots) {
    await send('Page.navigate', { url: `http://localhost:${SERVE_PORT}/${shot.query}` });
    let ready = false;
    for (let i = 0; i < 600 && !ready; i++) {
      await sleep(100);
      const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      ready = r.result?.value === true;
    }
    if (!ready) throw new Error(`${shot.name}: the game never signalled __shotReady`);
    let quality = 88, bytes = Buffer.alloc(0);
    do {
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality });
      bytes = Buffer.from(data, 'base64');
      quality -= 6;
    } while (bytes.length > MAX_BYTES && quality > 30);
    writeFileSync(join(root, 'screenshots', shot.name), bytes);
    console.log(`${shot.name}: ${bytes.length} bytes at quality ${quality + 6}`);
  }
} finally {
  ws.close();
  browser.kill();
  server.kill();
  await sleep(500);
  // Chrome can hold its profile a moment after it exits (Windows): retry, never fail the shots.
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* left in tmp */ }
}
