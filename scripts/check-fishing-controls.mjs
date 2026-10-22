// Run after npm run build. Exercise the actual canvas controls at several sizes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const output = await mkdtemp(path.join(tmpdir(), 'retro-fishing-'));
const dist = path.resolve('dist');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    assert(file.startsWith(dist + path.sep));
    let body = await readFile(file);
    const ext = path.extname(file);
    if (ext === '.js') body = body.toString().replace(/new (\w+)\.Game\(\{type:/, 'window.__hudGame = new $1.Game({type:');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[ext] || 'application/octet-stream');
    res.end(body);
  } catch (error) { console.error(req.url, error.message); res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
  `--user-data-dir=${path.join(output, 'profile')}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let tabs;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const port = (await readFile(path.join(output, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (tabs.length) break;
    } catch { /* Chrome is starting. */ }
    await pause(200);
  }
  assert(tabs?.length, 'Headless Chrome must start');
  const page = tabs.find(tab => tab.type === 'page' && tab.url === 'about:blank');
  assert(page, 'Preview page must exist');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (result.method === 'Runtime.exceptionThrown') console.error('BROWSER EXCEPTION', result.params.exceptionDetails.text, result.params.exceptionDetails.exception?.description ?? '');
    const job = pending.get(result.id);
    if (job) { pending.delete(result.id); result.error ? job.reject(result.error) : job.resolve(result.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const scene = 'window.__hudGame.scene.scenes[0]';
  const click = async (x, y) => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
    await pause(80);
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await pause(1000);
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.search.includes('sidebar')) {
      const observer = new MutationObserver(() => {
        if (document.body) { document.body.classList.add('vscode-sidebar'); observer.disconnect(); }
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  ` });
  for (const [width, height] of [[1423, 720], [960, 720], [559, 640], [320, 568], [280, 440], [740, 360]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    let navigation;
    for (let attempt = 0; attempt < 3; attempt++) {
      navigation = await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${width === 280 ? '?sidebar' : ''}` });
      if (!navigation.errorText) break;
      await pause(1000);
    }
    assert(!navigation.errorText, JSON.stringify(navigation));
    for (let i = 0; i < 80; i++) {
      if (await evaluate('!!window.__hudGame?.scene.scenes[0]?.children?.getByName("cast")')) break;
      await pause(100);
    }
    assert(await evaluate('!!window.__hudGame?.scene.scenes[0]?.children?.getByName("cast")'), 'Scene must create the fishing controls');
    assert(await evaluate('!!document.querySelector("#captain-name")'), JSON.stringify(await evaluate('({ url:location.href, text:document.body?.innerText.slice(0, 300) })')));
    await evaluate(`document.querySelector('#captain-name').value = 'Preview'; document.querySelector('#captain-form').requestSubmit();`);
    await pause(250);
    await evaluate(`${scene}.progress.baitStock.fill(20); ${scene}.updateHud();`);
    assert(await evaluate(`[1,2,3,4,5].every(tier => ${scene}.textures.exists('bait-' + tier) && ${scene}.textures.get('bait-' + tier).getSourceImage().width > 1)`), 'All five bait textures load');
    const buttons = await evaluate(`['cast', 'auto-fish', 'manual-fish', 'bait-1', 'bait-2', 'bait-3', 'bait-4', 'bait-5'].map(name => {
      const b = ${scene}.children.getByName(name); return { name, x:b.x, y:b.y, w:b.width, h:b.height };
    })`);
    const bounds = await evaluate(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,gw:window.__hudGame.scale.width,gh:window.__hudGame.scale.height}; })()`);
    for (const b of buttons) {
      assert(b.x - b.w / 2 > 0 && b.x + b.w / 2 < bounds.gw, `${b.name} fits at ${width}`);
      assert(b.y - b.h / 2 > 0 && b.y + b.h / 2 < bounds.gh, `${b.name} fits vertically at ${height}`);
    }
    const at = b => click(bounds.x + b.x * bounds.w / bounds.gw, bounds.y + b.y * bounds.h / bounds.gh);
    await at(buttons[0]);
    assert.notEqual(await evaluate(`${scene}.hookState`), 'idle', 'The visible FISH center must cast');
    await evaluate(`${scene}.finishReel()`);
    await at(buttons[1]);
    assert.equal(await evaluate(`${scene}.autoFishing`), true, 'Auto Fish enables automatic mode');
    await at(buttons[5]);
    assert.equal(await evaluate(`${scene}.progress.selectedBait`), 2, 'Clicking a bait slot equips it');
    // Capture the reference mode; then verify Manual also switches back.
    await evaluate(`${scene}.nextAutoCastAt = ${scene}.time.now + 60000; ${scene}.statusText.setAlpha(0); void 0;`);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(output, `fishing-${width}.png`), Buffer.from(shot.data, 'base64'));
    if (width === 1423) {
      await evaluate(`['harbor_herring','silver_sprat','blue_mackerel','copper_perch','emerald_bass','crimson_cod','sapphire_tuna','ghost_eel','storm_marlin','sunscale_koi','obsidian_grouper','frostfin_shark','thunder_ray','crown_swordfish','prism_ray','coral_crown','void_angler','leviathan_fry','timeworn_oarfish','celestial_coelacanth'].forEach(id => ${scene}.progress.fishInventory[id] = 1);`);
      await evaluate(`${scene}.openPanel('codex');`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-panel="codex"] .pixel-sprite').length`), 21, 'Journal renders all fish sprites plus the selected detail sprite');
      const journalShot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(output, 'fish-journal.png'), Buffer.from(journalShot.data, 'base64'));
      await evaluate(`${scene}.closePanel();`);
      await evaluate(`${scene}.shopCategory = 'bait'; ${scene}.openPanel('shop');`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-panel="shop"] .bait-sprite').length`), 6, 'Shop shows five bait sprites and the selected detail');
      await evaluate(`Promise.all([...document.querySelectorAll('.bait-sprite')].map(img => img.decode()))`);
      await pause(150);
      const baitShot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(output, 'bait-shop.png'), Buffer.from(baitShot.data, 'base64'));
      await evaluate(`${scene}.closePanel();`);
    }
    await at(buttons[2]);
    assert.equal(await evaluate(`${scene}.autoFishing`), false, 'Manual disables automatic mode');
    console.log(`PASS ${width}x${height}: visible controls fit and respond to clicks`);
  }
  console.log(`Screenshots: ${output}`);
  await call('Browser.close');
} finally {
  socket?.close();
  chrome.kill();
  server.closeAllConnections();
  server.close();
}
