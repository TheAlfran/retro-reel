// Run after npm run build. Exercise the compiled extension's HTML generation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let openGame;
let sidebar;
const uri = fsPath => ({ fsPath });
const webview = () => ({
  cspSource: 'https://assets.example',
  asWebviewUri: resource => `https://assets.example${new URL(`file:///${resource.fsPath.replaceAll('\\', '/')}`).pathname}`,
  html: '',
});
const panel = { webview: webview() };
const vscode = {
  Uri: { joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
  ViewColumn: { One: 1 },
  commands: { registerCommand: (_name, callback) => { openGame = callback; } },
  window: {
    registerWebviewViewProvider: (_name, provider) => { sidebar = provider; },
    createWebviewPanel: () => panel,
  },
};
const exports = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'extension-dist/extension.js'), 'utf8'), {
  exports, require: name => name === 'vscode' ? vscode : require(name),
});
exports.activate({ extensionUri: uri(root), subscriptions: [] });
openGame();
const view = { webview: webview() };
sidebar.resolveWebviewView(view);

for (const target of [panel, view]) {
  const html = target.webview.html;
  const scriptUrl = html.match(/<script[^>]+src="([^"]+)"/)[1];
  assert(scriptUrl.startsWith('https://assets.example/'));
  assert.match(html, /img-src https:\/\/assets.example data:/);
  assert.match(html, /<link[^>]+href="https:\/\/assets.example\//);
  const jsName = decodeURIComponent(new URL(scriptUrl).pathname.split('/').pop());
  const bundle = fs.readFileSync(path.join(root, 'dist/assets', jsName), 'utf8');
  const sprites = [...bundle.matchAll(/new URL\("([^"\n]*(?:starter-(?:boat|captain|rod)|reef-backdrop-(?:wide|tall)|sky-backdrop-(?:wide|narrow))[^"\n]*\.png)",import.meta.url\)/g)];
  assert.equal(sprites.length, 7, 'All seven boat, reef and sky asset URLs must be in the build');
  for (const [, asset] of sprites) {
    const resolved = new URL(asset, scriptUrl);
    assert(resolved.href.startsWith(new URL('./', scriptUrl).href), 'Sprite must resolve inside the extension assets folder');
    assert(fs.existsSync(path.join(root, 'dist/assets', path.basename(asset))));
  }
  assert.match(bundle, /imageLoadType:"HTMLImageElement"/, 'Use direct image loads permitted by img-src');
}
assert.match(view.webview.html, /class="vscode-sidebar"/);
console.log('PASS: editor and sidebar webviews resolve all seven boat, reef and sky assets with the permitted image loader.');
