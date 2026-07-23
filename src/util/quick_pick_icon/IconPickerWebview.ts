/**
 * 模块说明：本文件负责图标选择界面与资源检索，具体对象为 `IconPickerWebview`。
 *
 * 实现要点：生成受 CSP 约束的界面资源，并通过结构化消息处理用户操作。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`shouldShowRestoreDefaultIcon`、`IconPickerWebview`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { normalizeBookmarkIconName } from '../BookmarkIconName';
import { logger } from '../Logger';
import { readRecentIconIds, writeRecentIconIds } from '../RecentIconState';
import { currentFormattingLocale, currentLanguage, localize } from '../../i18n/Localization';
import { iconDictionaryCatalog, type IconDictionaryEntry } from './IconDictionaryCatalog';

function normalizedDefaultIcon(value: string | undefined): string | undefined {
    if (value === undefined || value === '') return value;
    return normalizeBookmarkIconName(value) || undefined;
}

export function shouldShowRestoreDefaultIcon(currentIcon: string | undefined, defaultIcon: string | undefined): boolean {
    return defaultIcon !== undefined && currentIcon !== defaultIcon;
}

function recentIconIds(context: vscode.ExtensionContext): string[] {
    return readRecentIconIds(context);
}

export class IconPickerWebview {
    public static currentPanel: IconPickerWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _bookmarkId: string | undefined;
    private _currentIcon: string | undefined;
    private _defaultIcon: string | undefined;
    private _onDidSelectIcon: (iconName: string, bookmarkId: string) => void;
    private _disposed = false;
    private _renderGeneration = 0;

    public static createOrShow(
        context: vscode.ExtensionContext,
        bookmarkId: string,
        currentIcon: string,
        defaultIcon: string | undefined,
        onDidSelectIcon: (iconName: string, bookmarkId: string) => void,
    ) {
        const safeDefaultIcon = normalizedDefaultIcon(defaultIcon);
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (IconPickerWebview.currentPanel) {
            IconPickerWebview.currentPanel._bookmarkId = bookmarkId;
            IconPickerWebview.currentPanel._currentIcon = currentIcon;
            IconPickerWebview.currentPanel._defaultIcon = safeDefaultIcon;
            IconPickerWebview.currentPanel._onDidSelectIcon = onDidSelectIcon;
            IconPickerWebview.currentPanel._update();
            IconPickerWebview.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'iconPicker',
            localize('🎨 选择书签图标', '🎨 Choose a Bookmark Icon'),
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'resources')]
            }
        );

        IconPickerWebview.currentPanel = new IconPickerWebview(panel, context, bookmarkId, currentIcon, safeDefaultIcon, onDidSelectIcon);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        bookmarkId: string,
        currentIcon: string,
        defaultIcon: string | undefined,
        onDidSelectIcon: (iconName: string, bookmarkId: string) => void,
    ) {
        this._panel = panel;
        this._context = context;
        this._bookmarkId = bookmarkId;
        this._currentIcon = currentIcon;
        this._defaultIcon = defaultIcon;
        this._onDidSelectIcon = onDidSelectIcon;

        this._update();

        this._panel.onDidDispose(() => this._disposeResources(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message: unknown) => {
                void this._handleMessage(message).catch(error => {
                    logger.error(localize(`处理图标选择消息失败：${error}`, `Failed to handle an icon picker message: ${error}`));
                });
            },
            null,
            this._disposables
        );
    }

    private async _handleMessage(message: unknown): Promise<void> {
        if (typeof message !== 'object' || message === null) return;
        const candidate = message as Record<string, unknown>;
        if (typeof candidate.command !== 'string' || typeof candidate.iconName !== 'string') return;

        const iconName = candidate.iconName;
        const isKnownIcon = iconDictionaryCatalog.has(iconName);
        switch (candidate.command) {
            case 'selectIcon':
                if (iconName !== '' && !isKnownIcon) return;
                if (iconName !== '') await this._addRecentIcon(iconName);
                if (this._bookmarkId) this._onDidSelectIcon(iconName, this._bookmarkId);
                this.dispose();
                return;
            case 'restoreDefaultIcon':
                if (this._defaultIcon === undefined || iconName !== this._defaultIcon) return;
                if (this._bookmarkId) this._onDidSelectIcon(this._defaultIcon, this._bookmarkId);
                this.dispose();
                return;
            case 'removeRecentIcon':
                if (isKnownIcon) await this._removeRecentIcon(iconName);
                return;
            case 'addRecentIcon':
                if (isKnownIcon) await this._addRecentIcon(iconName);
                return;
        }
    }

    private async _addRecentIcon(iconId: string): Promise<void> {
        let recent = recentIconIds(this._context);
        recent = recent.filter(id => id !== iconId && iconDictionaryCatalog.has(id));
        recent.unshift(iconId);
        await writeRecentIconIds(this._context, recent.slice(0, 100));
    }

    private async _removeRecentIcon(iconId: string): Promise<void> {
        let recent = recentIconIds(this._context);
        recent = recent.filter(id => id !== iconId);
        await writeRecentIconIds(this._context, recent);
    }

    public dispose() {
        if (!this._disposed) this._panel.dispose();
    }

    private _disposeResources(): void {
        if (this._disposed) return;
        this._disposed = true;
        if (IconPickerWebview.currentPanel === this) IconPickerWebview.currentPanel = undefined;
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        const generation = ++this._renderGeneration;
        if (!iconDictionaryCatalog.isLoaded) {
            this._panel.webview.html = `<!DOCTYPE html><html lang="${currentLanguage()}"><body>${localize('正在加载图标…', 'Loading icons…')}</body></html>`;
        }
        void this._getHtmlForWebview().then(html => {
            if (!this._disposed && generation === this._renderGeneration) this._panel.webview.html = html;
        }).catch(error => {
            logger.error(localize(`加载图标选择器失败：${error}`, `Failed to load the icon picker: ${error}`));
            if (!this._disposed && generation === this._renderGeneration) {
                this._panel.webview.html = `<!DOCTYPE html><html lang="${currentLanguage()}"><body>${localize('无法加载图标资源。', 'Unable to load icon resources.')}</body></html>`;
            }
        });
    }

    private async _getHtmlForWebview(): Promise<string> {
        const baseUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'custom_icons'));
        const fuseUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'fuse.min.js'));
        const nonce = crypto.randomBytes(16).toString('base64');
        const iconDictionary = await iconDictionaryCatalog.load(this._context);
        const locale = currentFormattingLocale();
        const htmlLanguage = currentLanguage();
        const text = {
            addRecent: localize('添加到最近使用', 'Add to recently used'),
            brandName: localize('代码书签', 'CodeBookmark'),
            categoryArchitecture: localize('核心架构', 'Architecture'),
            categoryBrand: localize('品牌徽标', 'Brand Logos'),
            categoryFun: localize('趣味标签', 'Fun Tags'),
            categoryStatus: localize('代码状态', 'Code Status'),
            categoryUi: localize('界面资源', 'UI Resources'),
            emptyRecent: localize('暂无最近使用记录', 'No recently used icons'),
            noMatches: localize('未找到匹配的图标', 'No matching icons found'),
            recent: localize('最近使用', 'Recently Used'),
            remove: localize('移除', 'Remove'),
            restoreDefault: localize('恢复默认', 'Restore Default'),
            searchPlaceholder: localize(
                `在 ${iconDictionary.length.toLocaleString(locale)} 个代码书签图标中搜索（支持中英双语检索）`,
                `Search ${iconDictionary.length.toLocaleString(locale)} bookmark icons in English or Chinese`,
            ),
            selectIcon: localize('选择书签图标', 'Choose a Bookmark Icon'),
            searchableKeywords: localize('可以搜索这些关键词：{keywords}', 'Searchable keywords: {keywords}'),
        };
        const textJson = JSON.stringify(text)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');

        const recentIds = recentIconIds(this._context);
        const baseUriStr = baseUri.toString();

        const iconSvg = (path: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="${path}"/></svg>`;

        const groups: Record<string, IconDictionaryEntry[]> = { status: [], arch: [], ui: [], fun: [], brand: [] };
        for (const icon of iconDictionary) groups[icon.id.split('_', 1)[0]]?.push(icon);
        const titleMap: Record<string, string> = {
            status: iconSvg('M22 12h-4l-3 9L9 3l-3 9H2') + ` ${text.categoryStatus}`,
            arch: iconSvg('M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 12H2M12 2v20') + ` ${text.categoryArchitecture}`,
            ui: iconSvg('M3 3h18v18H3zM3 9h18') + ` ${text.categoryUi}`,
            fun: iconSvg('M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z') + ` ${text.categoryFun}`,
            brand: iconSvg('M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01') + ` ${text.categoryBrand}`,
        };
        const categoryKeys = ['status', 'arch', 'ui', 'fun', 'brand'].filter(key => groups[key].length > 0);
        const categoryTabsHtml = categoryKeys.map((key, index) =>
            `<div class="tab ${index === 0 ? 'active' : ''}" data-target="panel-${key}">${titleMap[key]}</div>`
        ).join('');
        const categoryPanelsHtml = categoryKeys.map((key, index) => `
            <div class="category-section ${index === 0 ? '' : 'hidden'}" id="panel-${key}" data-category="${key}" data-rendered="0">
                <div class="grid"></div>
            </div>
        `).join('');

        // 根据同步后的最近图标状态动态生成“最近使用”标签页。
        let recentInnerGrid = '';
        const showRestoreDefault = shouldShowRestoreDefaultIcon(this._currentIcon, this._defaultIcon);
        
        if (showRestoreDefault) {
            recentInnerGrid += `
                <div class="icon-item-container restore-default" data-id="${this._defaultIcon}">
                    <div class="icon-card">
                        <div class="icon-content">
                            <span>↩</span>
                        </div>
                    </div>
                    <span class="icon-name">${text.restoreDefault}</span>
                </div>
            `;
        }

        const recentIcons = recentIds
            .map(id => iconDictionaryCatalog.get(id))
            .filter((icon): icon is IconDictionaryEntry => icon !== undefined);
        if (recentIcons.length === 0 && !showRestoreDefault) {
            recentInnerGrid = `<div class="empty-recent">${text.emptyRecent}</div>`;
        } else {
            const baseUriStr = baseUri.toString();
            recentInnerGrid += recentIcons.map(icon => `
                <div class="icon-item-container" data-id="${icon.id}">
                    <div class="icon-card" id="card-recent-${icon.id}">
                        <div class="remove-btn" data-action="remove-recent" data-icon-id="${icon.id}" title="${text.remove}" aria-label="${text.remove}">❌</div>
                        <div class="icon-content" data-icon-id="${icon.id}" data-keywords="${(icon.keywords || []).join(', ')}">
                            <img class="icon-img" src="${baseUriStr}/${icon.id}" alt="${icon.name}" loading="lazy">
                        </div>
                    </div>
                    <span class="icon-name">${icon.name.replace(/_/g, ' ')}</span>
                </div>
            `).join('');
        }

        const recentTabHtml = `<div class="tab active" data-target="panel-recent">${iconSvg('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2')} ${text.recent}</div>`;
        const recentPanelHtml = `
            <div class="category-section" id="panel-recent">
                <div class="grid">
                    ${recentInnerGrid}
                </div>
            </div>
        `;

        let finalTabsHtml: string;
        let initialPanelsHtml: string;
        if (recentIcons.length > 0 || showRestoreDefault) {
            finalTabsHtml = recentTabHtml + `<hr class="sidebar-separator"/>` + categoryTabsHtml.replace('class="tab active"', 'class="tab"');
            initialPanelsHtml = recentPanelHtml + categoryPanelsHtml.replace('class="category-section "', 'class="category-section hidden"');
        } else {
            finalTabsHtml = categoryTabsHtml;
            initialPanelsHtml = categoryPanelsHtml;
        }

        const iconDataJson = JSON.stringify(iconDictionary)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')

        return `<!DOCTYPE html>
            <html lang="${htmlLanguage}">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} data:; style-src ${this._panel.webview.cspSource} 'nonce-${nonce}'; script-src ${this._panel.webview.cspSource} 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${text.selectIcon}</title>
                <style nonce="${nonce}">
                    html, body {
                        overflow: hidden;
                        margin: 0;
                        padding: 0;
                        height: 100vh;
                    }
                    * {
                        box-sizing: border-box;
                    }
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-editor-foreground);
                        background-color: var(--vscode-editor-background);
                        display: flex;
                        flex-direction: column;
                    }
                    .header {
                        display: flex;
                        align-items: center;
                        padding: 20px 20px 10px 20px;
                        background: var(--vscode-editor-background);
                        z-index: 100;
                        border-bottom: 1px solid transparent;
                    }
                    .brand-container {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 150px;
                        flex-shrink: 0;
                    }
                    .brand-logo {
                        width: 20px;
                        height: 20px;
                        stroke: #D8BA92;
                    }
                    .brand-name {
                        font-size: 14px;
                        font-weight: 600;
                        color: var(--vscode-foreground);
                        letter-spacing: 0.5px;
                    }
                    .search-container {
                        flex: 1;
                        padding-left: 20px;
                    }
                    input {
                        width: 100%;
                        padding: 12px;
                        font-size: 16px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        outline: none;
                        border-radius: 4px;
                    }
                    input:focus {
                        border-color: var(--vscode-focusBorder);
                    }
                    
                    .main-layout {
                        display: flex;
                        flex: 1;
                        overflow: hidden;
                    }
                    
                    .sidebar {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        width: 170px;
                        padding: 10px 20px;
                        border-right: 1px solid var(--vscode-panel-border);
                        overflow-y: auto;
                        flex-shrink: 0;
                    }
                    
                    .sidebar-separator {
                        border: none;
                        border-top: 2px dashed rgba(128, 128, 128, 0.4);
                        margin: 12px 0;
                        width: 100%;
                    }
                    
                    .tab {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 10px 14px;
                        cursor: pointer;
                        border-radius: 8px;
                        color: var(--vscode-foreground);
                        opacity: 0.85;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.2s;
                        position: relative;
                        box-sizing: border-box;
                    }
                    .tab:hover {
                        background-color: var(--vscode-list-hoverBackground);
                        opacity: 1;
                    }
                    .tab.active {
                        background-color: rgba(180, 150, 100, 0.15);
                        color: #D8BA92;
                        font-weight: 600;
                        opacity: 1;
                    }
                    .tab::before {
                        content: '';
                        position: absolute;
                        left: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 4px;
                        height: 0;
                        background-color: transparent;
                        border-radius: 4px;
                        transition: height 0.15s ease, background-color 0.15s ease;
                    }
                    .tab.active::before {
                        height: 18px;
                        background-color: #D8BA92;
                    }
                    .sidebar-icon {
                        flex-shrink: 0;
                        stroke: currentColor;
                    }

                    #gallery {
                        flex: 1;
                        overflow-y: scroll;
                        padding: 10px 20px 20px 20px;
                    }

                    .grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                        gap: 15px;
                        align-items: start;
                    }
                    .icon-item-container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                    }
                    .icon-card {
                        background: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 6px;
                        width: 60px;
                        height: 60px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                        position: relative;
                        box-sizing: border-box;
                    }
                    .icon-item-container:hover .icon-card {
                        background: var(--vscode-list-hoverBackground);
                        transform: translateY(-2px);
                    }
                    .icon-item-container.restore-default:hover .icon-card {
                        background: rgba(216, 186, 146, 0.2) !important;
                        transform: none;
                    }
                    
                    .icon-img {
                        width: 28px;
                        height: 28px;
                        object-fit: contain;
                        pointer-events: none;
                    }
                    .icon-name {
                        font-size: 12px;
                        text-align: center;
                        overflow-wrap: break-word;
                        word-break: normal;
                        pointer-events: none;
                        width: 100%;
                        line-height: 1.2;
                    }
                    .category-section {
                        margin-bottom: 30px;
                    }
                    .hidden {
                        display: none !important;
                    }
                    .remove-btn, .add-recent-btn {
                        position: absolute;
                        top: 2px;
                        right: 2px;
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        line-height: 10px;
                        cursor: pointer;
                        opacity: 0;
                        transition: opacity 0.2s;
                        z-index: 10;
                        background: transparent;
                        padding: 0;
                    }
                    .icon-item-container:hover .remove-btn,
                    .icon-item-container:hover .add-recent-btn {
                        opacity: 1;
                    }
                    .empty-recent {
                        grid-column: 1 / -1;
                        text-align: center;
                        padding: 30px;
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
                    }
                    .restore-default .icon-card {
                        border-color: #D8BA92;
                        background: rgba(216, 186, 146, 0.1);
                    }
                    .restore-default .icon-content span {
                        color: #D8BA92;
                        font-size: 24px;
                    }
                    .restore-default .icon-name {
                        color: #D8BA92;
                    }
                    #empty-state {
                        display: none;
                    }
                    #search-results-panel {
                        display: none;
                    }
                    .search-mode #search-results-panel {
                        display: block;
                    }
                    .search-mode .sidebar {
                        opacity: 0.5;
                        pointer-events: none;
                    }
                    .search-mode .category-section:not(#search-results-panel) {
                        display: none !important;
                    }
                    #custom-tooltip {
                        position: fixed;
                        background: var(--vscode-editorWidget-background);
                        color: var(--vscode-editorWidget-foreground);
                        border: 1px solid var(--vscode-widget-border);
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                        pointer-events: none;
                        z-index: 9999;
                        opacity: 0;
                        transition: opacity 0.15s ease-in-out;
                        display: none;
                        max-width: 250px;
                        text-align: center;
                    }
                    .tooltip-title {
                        font-weight: bold;
                        margin-bottom: 4px;
                        display: block;
                        color: var(--vscode-textPreformat-foreground);
                    }
                </style>
                <script nonce="${nonce}" src="${fuseUri}"></script>
            </head>
            <body>
                <div class="header">
                    <div class="brand-container">
                        <svg class="brand-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span class="brand-name">${text.brandName}</span>
                    </div>
                    <div class="search-container">
                        <input type="text" id="search" disabled placeholder="${text.searchPlaceholder}" aria-label="${text.searchPlaceholder}">
                    </div>
                </div>
                
                <div class="main-layout">
                    <div class="sidebar" id="tabs-container">
                        ${finalTabsHtml}
                    </div>

                    <div id="gallery">
                        ${initialPanelsHtml}
                        <div id="search-results-panel" class="category-section">
                            <div class="grid" id="search-results-grid"></div>
                        </div>
                        <div id="empty-state" class="empty-recent">${text.noMatches}</div>
                    </div>
                </div>
                
                <div id="custom-tooltip"></div>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    const iconData = ${iconDataJson};
                    const text = ${textJson};
                    
                    let fuse;
                    let tabs = document.querySelectorAll('.tab');
                    let panels = document.querySelectorAll('.category-section:not(#search-results-panel)');

                    const searchInput = document.getElementById('search');
                    const emptyState = document.getElementById('empty-state');
                    const gallery = document.getElementById('gallery');
                    const searchResultsGrid = document.getElementById('search-results-grid');
                    const tooltip = document.getElementById('custom-tooltip');

                    function selectIcon(iconId) {
                        vscode.postMessage({ command: 'selectIcon', iconName: iconId });
                    }
                    
                    window.selectIcon = selectIcon;
                    
                    window.addRecent = function(event, iconId) {
                        event.stopPropagation();
                        vscode.postMessage({ command: 'addRecentIcon', iconName: iconId });
                        let btn = event.target;
                        if (!btn.classList.contains('add-recent-btn')) {
                            btn = btn.closest('.add-recent-btn');
                        }
                        if (btn) {
                            const oldText = btn.innerText;
                            btn.innerText = '✔️';
                            setTimeout(() => { btn.innerText = oldText; }, 1000);
                        }
                        
                        const recentGrid = document.querySelector('#panel-recent .grid');
                        const emptyState = document.querySelector('#panel-recent .empty-recent');
                        if (emptyState) emptyState.style.display = 'none';
                        
                        if (recentGrid) {
                            if (!document.getElementById('card-recent-' + iconId)) {
                                const cardHtml = \`
                                    <div class="icon-item-container" data-id="\${iconId}">
                                        <div class="icon-card" id="card-recent-\${iconId}">
                                            <div class="remove-btn" data-action="remove-recent" data-icon-id="\${iconId}" title="\${text.remove}" aria-label="\${text.remove}">❌</div>
                                            <div class="icon-content" data-icon-id="\${iconId}">
                                                <img class="icon-img" src="${baseUriStr}/\${iconId}" loading="lazy">
                                            </div>
                                        </div>
                                        <span class="icon-name">\${iconId.split('.')[0].replace(/_/g, ' ')}</span>
                                    </div>
                                \`;
                                recentGrid.insertAdjacentHTML('afterbegin', cardHtml);
                            }
                        }
                    };
                    
                    window.removeRecent = function(event, iconId) {
                        event.stopPropagation();
                        const card = document.getElementById('card-recent-' + iconId)?.closest('.icon-item-container');
                        if (card) card.style.display = 'none';
                        vscode.postMessage({ command: 'removeRecentIcon', iconName: iconId });
                    };

                    const baseUriStr = "${baseUriStr}";
                    const categoryPageSize = 160;
                    const categoryData = new Map();
                    for (const icon of iconData) {
                        const category = icon.id.split('_', 1)[0];
                        const items = categoryData.get(category) || [];
                        items.push(icon);
                        categoryData.set(category, items);
                    }

                    function iconCardHtml(icon) {
                        return \`
                            <div class="icon-item-container" data-id="\${icon.id}">
                                <div class="icon-card" id="card-\${icon.id}">
                                     <div class="add-recent-btn" data-action="add-recent" data-icon-id="\${icon.id}" title="\${text.addRecent}" aria-label="\${text.addRecent}">📌</div>
                                    <div class="icon-content" data-icon-id="\${icon.id}" data-keywords="\${(icon.keywords || []).join(', ')}">
                                        <img class="icon-img" src="\${baseUriStr}/\${icon.id}" alt="\${icon.name}" loading="lazy">
                                    </div>
                                </div>
                                <span class="icon-name">\${icon.name.replace(/_/g, ' ')}</span>
                            </div>
                        \`;
                    }

                    function renderNextCategoryPage(panel) {
                        if (!panel?.dataset.category) return;
                        const items = categoryData.get(panel.dataset.category) || [];
                        const rendered = Number(panel.dataset.rendered || 0);
                        if (rendered >= items.length) return;
                        const next = items.slice(rendered, rendered + categoryPageSize);
                        panel.querySelector('.grid').insertAdjacentHTML('beforeend', next.map(iconCardHtml).join(''));
                        panel.dataset.rendered = String(rendered + next.length);
                    }

                    setTimeout(() => {
                        fuse = new Fuse(iconData, {
                            keys: [
                                { name: 'name', weight: 0.7 },
                                { name: 'keywords', weight: 0.3 }
                            ],
                            threshold: 0.3,
                            ignoreLocation: true,
                            useExtendedSearch: true
                        });
                        renderNextCategoryPage(document.querySelector('.category-section:not(.hidden)[data-category]'));
                        searchInput.disabled = false;
                        searchInput.focus();
                    }, 10);

                    tabs.forEach(tab => {
                        tab.addEventListener('click', () => {
                            if (document.body.classList.contains('search-mode')) return;
                            tabs.forEach(t => t.classList.remove('active'));
                            tab.classList.add('active');
                            panels.forEach(p => p.classList.add('hidden'));
                            const targetId = tab.getAttribute('data-target');
                            const targetPanel = document.getElementById(targetId);
                            targetPanel.classList.remove('hidden');
                            renderNextCategoryPage(targetPanel);
                        });
                    });

                    gallery.addEventListener('scroll', () => {
                        if (document.body.classList.contains('search-mode')) return;
                        if (gallery.scrollTop + gallery.clientHeight < gallery.scrollHeight - 240) return;
                        renderNextCategoryPage(document.querySelector('.category-section:not(.hidden)[data-category]'));
                    });

                    searchInput.addEventListener('input', (e) => {
                        if (!fuse) return;
                        const query = e.target.value.trim();
                        
                        if (!query) {
                            document.body.classList.remove('search-mode');
                            emptyState.style.display = 'none';
                            return;
                        }

                        document.body.classList.add('search-mode');
                        const results = fuse.search(query, { limit: 200 });
                        
                        if (results.length === 0) {
                            searchResultsGrid.innerHTML = '';
                            emptyState.style.display = 'block';
                            return;
                        }

                        emptyState.style.display = 'none';
                        
                        searchResultsGrid.innerHTML = results.map(res => {
                            const icon = res.item;
                            return \`
                                <div class="icon-item-container" data-id="\${icon.id}">
                                    <div class="icon-card">
                                         <div class="add-recent-btn" data-action="add-recent" data-icon-id="\${icon.id}" title="\${text.addRecent}" aria-label="\${text.addRecent}">📌</div>
                                        <div class="icon-content" data-icon-id="\${icon.id}" data-keywords="\${(icon.keywords || []).join(', ')}">
                                            <img class="icon-img" src="${baseUriStr}/\${icon.id}" alt="\${icon.name}" loading="lazy">
                                        </div>
                                    </div>
                                    <span class="icon-name">\${icon.name.replace(/_/g, ' ')}</span>
                                </div>
                            \`;
                        }).join('');
                    });

                    gallery.addEventListener('click', (e) => {
                        const action = e.target.closest('[data-action]');
                        if (action?.dataset.action === 'add-recent') {
                            window.addRecent(e, action.dataset.iconId);
                            return;
                        }
                        if (action?.dataset.action === 'remove-recent') {
                            window.removeRecent(e, action.dataset.iconId);
                            return;
                        }
                        const card = e.target.closest('.icon-item-container');
                        if (card && !e.target.closest('.remove-btn') && !e.target.closest('.add-recent-btn')) {
                            const iconId = card.getAttribute('data-id');
                            if (card.classList.contains('restore-default')) {
                                vscode.postMessage({ command: 'restoreDefaultIcon', iconName: iconId });
                            } else {
                                selectIcon(iconId);
                            }
                        }
                    });

                    let tooltipTimeout;

                    gallery.addEventListener('mouseover', (e) => {
                        const card = e.target.closest('.icon-item-container');
                        if (!card) return;
                        
                        const content = card.querySelector('.icon-content');
                        if (!content) return;

                        const keywords = content.getAttribute('data-keywords');
                        
                        if (!keywords) return;

                        clearTimeout(tooltipTimeout);

                        const rect = card.getBoundingClientRect();
                        
                        tooltip.replaceChildren();
                        const tooltipTitle = document.createElement('span');
                        tooltipTitle.className = 'tooltip-title';
                        tooltipTitle.textContent = text.brandName;
                        const tooltipKeywords = document.createElement('span');
                        tooltipKeywords.textContent = text.searchableKeywords.replace('{keywords}', keywords);
                        tooltip.append(tooltipTitle, tooltipKeywords);
                        tooltip.style.display = 'block';
                        
                        requestAnimationFrame(() => {
                            const tooltipRect = tooltip.getBoundingClientRect();
                            let top = rect.bottom + 8;
                            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

                            if (left < 10) left = 10;
                            if (left + tooltipRect.width > window.innerWidth - 10) {
                                left = window.innerWidth - tooltipRect.width - 10;
                            }
                            
                            if (top + tooltipRect.height > window.innerHeight - 10) {
                                top = rect.top - tooltipRect.height - 8;
                            }

                            tooltip.style.top = top + 'px';
                            tooltip.style.left = left + 'px';
                            tooltip.style.opacity = '1';
                        });
                    });

                    gallery.addEventListener('mouseout', (e) => {
                        const card = e.target.closest('.icon-item-container');
                        if (card) {
                            clearTimeout(tooltipTimeout);
                            tooltip.style.opacity = '0';
                            tooltipTimeout = setTimeout(() => {
                                tooltip.style.display = 'none';
                            }, 150);
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
