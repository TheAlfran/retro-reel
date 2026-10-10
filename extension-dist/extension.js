"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const fs = __importStar(require("node:fs"));
const node_crypto_1 = require("node:crypto");
const vscode = __importStar(require("vscode"));
const VIEW_TYPE = 'retroReel.game';
const SIDEBAR_VIEW_TYPE = 'retroReel.sidebar';
function activate(context) {
    const sidebarProvider = new ReelSidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.commands.registerCommand('retroReel.openGame', () => openGame(context)), vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_TYPE, sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
}
class ReelSidebarProvider {
    extensionUri;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri],
        };
        webviewView.webview.html = getWebviewHtml(webviewView.webview, distUri, true);
    }
}
function openGame(context) {
    const distUri = vscode.Uri.joinPath(context.extensionUri, 'dist');
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Retro Reel', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distUri],
    });
    panel.iconPath = {
        light: vscode.Uri.joinPath(context.extensionUri, 'media', 'reel-light.svg'),
        dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'reel-dark.svg'),
    };
    panel.webview.html = getWebviewHtml(panel.webview, distUri, false);
}
function getWebviewHtml(webview, distUri, sidebar) {
    const indexUri = vscode.Uri.joinPath(distUri, 'index.html');
    let html = fs.readFileSync(indexUri.fsPath, 'utf8');
    const nonce = (0, node_crypto_1.randomBytes)(16).toString('base64');
    html = html.replace(/(src|href)="\/([^"#]+)"/g, (_match, attribute, relativePath) => {
        const resource = vscode.Uri.joinPath(distUri, ...relativePath.split('/'));
        return `${attribute}="${webview.asWebviewUri(resource)}"`;
    });
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
function deactivate() { }
