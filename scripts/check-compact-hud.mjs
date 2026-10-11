import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
    let body = await readFile(file);
    const ext = path.extname(file);
    // Expose the scene only in this temporary preview server for interaction checks.
    if (ext === '.js') body = body.toString().replace(/new (\w+)\.Game\(\{type:/, 'window.__hudGame = new $1.Game({type:');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[ext] || 'text/plain');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(5177, '127.0.0.1', resolve));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9227', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${path.join(root, 'hud-browser-profile')}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let tabs;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { tabs = await (await fetch('http://127.0.0.1:9227/json')).json(); break; } catch { await pause(250); }
  }
  assert(tabs?.length, 'Preview browser must start');
  socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const job = pending.get(message.id);
    if (job) { pending.delete(message.id); message.error ? job.reject(message.error) : job.resolve(message.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const click = async (x, y) => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
    await pause(100);
  };
  await call('Page.enable');
  await pause(1000);
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.search.includes('sidebar')) {
      const observer = new MutationObserver(() => { if (document.body) { document.body.classList.add('vscode-sidebar'); observer.disconnect(); } });
      observer.observe(document, { childList: true, subtree: true });
    }
  ` });
  for (const [name, width, height, sidebar] of [['desktop', 1100, 720, false], ['tall', 535, 1285, true], ['narrow', 280, 440, true]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const navigation = await call('Page.navigate', { url: `http://127.0.0.1:5177/${sidebar ? '?sidebar' : ''}` });
    assert(!navigation.errorText, JSON.stringify(navigation));
    await pause(2000);
    console.log(await evaluate(`({url:location.href, title:document.title, ready:!!document.querySelector('#captain-name')})`));
    await evaluate(`document.querySelector('#captain-name').value = 'Preview'; document.querySelector('#captain-form').requestSubmit();`);
    await pause(600);
    assert.equal(await evaluate(`document.querySelector('.brand') === null && getComputedStyle(document.querySelector('#game')).borderWidth === '0px'`), true);
    const scene = 'window.__hudGame.scene.scenes[0]';
    const buttons = await evaluate(`${scene}.children.list.filter(o => o.type === 'Container' && o.depth === 22).map(o => ({x:o.x,y:o.y,width:o.width,height:o.height}))`);
    assert.equal(buttons.length, 7);
    const bounds = await evaluate(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,gw:window.__hudGame.config.width,gh:window.__hudGame.config.height}; })()`);
    const at = (x, y) => click(bounds.x + x * bounds.w / bounds.gw, bounds.y + y * bounds.h / bounds.gh);
    for (const [index, button] of buttons.slice(0, 6).entries()) {
      assert(button.x - button.width / 2 >= 0 && button.x + button.width / 2 <= bounds.gw);
      await at(button.x, button.y);
      const title = await evaluate(`${scene}.activePanel?.list.find(o => o.type === 'Text')?.text`);
      assert.equal(title, ['INVENTORY','SHOP','CODEX','PROFILE','SKILLS','BOAT'][index]);
      await evaluate(`${scene}.closePanel()`);
    }
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width / 2, y: 20 });
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(root, `hud-preview-${name}.png`), Buffer.from(shot.data, 'base64'));
    await at(buttons[3].x, buttons[3].y);
    const stats = await evaluate(scene + '.profileStats.text');
    assert.match(stats, /COINS/); assert.match(stats, /STREAK/); assert.match(stats, /BAIT/);
    const profileShot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(root, 'hud-preview-profile-' + name + '.png'), Buffer.from(profileShot.data, 'base64'));
    const autoPosition = await evaluate(scene + '.activePanel.list.filter(o => o.type === "Rectangle" && o.input).at(-1).getCenter()');
    await at(autoPosition.x, autoPosition.y);
    assert.equal(await evaluate(scene + '.autoFishing'), true);
    assert.equal(await evaluate(scene + '.autoIndicator.visible'), true);
    await at(autoPosition.x, autoPosition.y);
    assert.equal(await evaluate(scene + '.autoFishing'), false);
    await evaluate(scene + '.closePanel()');
    await at(buttons[6].x, buttons[6].y);
    assert.equal(await evaluate(scene + '.hookState'), 'dropping');
    await pause(750);
    assert.equal(await evaluate(scene + '.hookState'), 'timing');
    await at(buttons[6].x, buttons[6].y);
    assert.equal(await evaluate(scene + '.hookState'), 'reeling');
    await pause(1100);
    assert.equal(await evaluate(scene + '.hookState'), 'idle');
    console.log('PASS ' + name + ': compact buttons, profile stats, auto toggle, manual cast/reel');
  }
  await call('Browser.close');
} finally {
  socket?.close(); chrome.kill(); server.close();
}
