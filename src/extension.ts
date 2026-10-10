import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

const VIEW_TYPE = 'retroReel.game';
const SIDEBAR_VIEW_TYPE = 'retroReel.sidebar';

export function activate(context: vscode.ExtensionContext): void {
  const sidebarProvider = new ReelSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.commands.registerCommand('retroReel.openGame', () => openGame(context)),
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_TYPE, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

class ReelSidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [distUri],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, distUri, true);
  }
}

function openGame(context: vscode.ExtensionContext): void {
  const distUri = vscode.Uri.joinPath(context.extensionUri, 'dist');
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Retro Reel',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distUri],
    },
  );

  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, 'media', 'reel-light.svg'),
    dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'reel-dark.svg'),
  };
  panel.webview.html = getWebviewHtml(panel.webview, distUri, false);
}

function getWebviewHtml(webview: vscode.Webview, distUri: vscode.Uri, sidebar: boolean): string {
  const indexUri = vscode.Uri.joinPath(distUri, 'index.html');
  let html = fs.readFileSync(indexUri.fsPath, 'utf8');
  const nonce = randomBytes(16).toString('base64');

  html = html.replace(
    /(src|href)="\/([^"#]+)"/g,
    (_match: string, attribute: string, relativePath: string) => {
      const resource = vscode.Uri.joinPath(distUri, ...relativePath.split('/'));
      return `${attribute}="${webview.asWebviewUri(resource)}"`;
    },
  );

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com data:',
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
  html = html.replace(/<script\b/g, `<script nonce="${nonce}"`);
  if (sidebar) {
    html = html.replace('<body>', '<body class="vscode-sidebar">');
  }
  return html;
}

export function deactivate(): void {}
