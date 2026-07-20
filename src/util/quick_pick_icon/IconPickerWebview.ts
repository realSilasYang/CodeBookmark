import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class IconPickerWebview {
    public static currentPanel: IconPickerWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _bookmarkId: string | undefined;
    private _currentIcon: string | undefined;
    private _onDidSelectIcon: (iconName: string, bookmarkId: string) => void;

    public static createOrShow(context: vscode.ExtensionContext, bookmarkId: string, currentIcon: string, onDidSelectIcon: (iconName: string, bookmarkId: string) => void) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (IconPickerWebview.currentPanel) {
            IconPickerWebview.currentPanel._bookmarkId = bookmarkId;
            IconPickerWebview.currentPanel._currentIcon = currentIcon;
            IconPickerWebview.currentPanel._onDidSelectIcon = onDidSelectIcon;
            IconPickerWebview.currentPanel._update();
            IconPickerWebview.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'iconPicker',
            '🎨 选择书签图标',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'resources')]
            }
        );

        IconPickerWebview.currentPanel = new IconPickerWebview(panel, context, bookmarkId, currentIcon, onDidSelectIcon);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, bookmarkId: string, currentIcon: string, onDidSelectIcon: (iconName: string, bookmarkId: string) => void) {
        this._panel = panel;
        this._context = context;
        this._bookmarkId = bookmarkId;
        this._currentIcon = currentIcon;
        this._onDidSelectIcon = onDidSelectIcon;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message: any) => {
                switch (message.command) {
                    case 'selectIcon':
                        this._addRecentIcon(message.iconName);
                        if (this._bookmarkId) {
                            this._onDidSelectIcon(message.iconName, this._bookmarkId);
                        }
                        this._panel.dispose();
                        return;
                    case 'removeRecentIcon':
                        this._removeRecentIcon(message.iconName);
                        return;
                    case 'addRecentIcon':
                        this._addRecentIcon(message.iconName);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _addRecentIcon(iconId: string) {
        let recent = this._context.globalState.get<string[]>('codebookmark.recentIcons') || [];
        recent = recent.filter(id => id !== iconId); // Remove if exists
        recent.unshift(iconId); // Add to beginning
        if (recent.length > 100) {
            recent = recent.slice(0, 100); // Keep max 100
        }
        this._context.globalState.update('codebookmark.recentIcons', recent);
    }

    private _removeRecentIcon(iconId: string) {
        let recent = this._context.globalState.get<string[]>('codebookmark.recentIcons') || [];
        recent = recent.filter(id => id !== iconId);
        this._context.globalState.update('codebookmark.recentIcons', recent);
    }

    public dispose() {
        IconPickerWebview.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    
    private static _cachedIconDict: any[] | null = null;
    private static _cachedTabsHtml: string = '';
    private static _cachedPanelsHtml: string = '';
    private static _cachedIconMap = new Map<string, any>();

                private _getHtmlForWebview() {
        const baseUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'custom_icons'));
        const fuseUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'fuse.min.js'));

        const recentIds = this._context.globalState.get<string[]>('codebookmark.recentIcons') || [];
        const baseUriStr = baseUri.toString();

        const iconSvg = (path: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="${path}"/></svg>`;

        // Preload and cache JSON statically
        if (!IconPickerWebview._cachedIconDict) {
            const jsonPath = path.join(this._context.extensionPath, 'resources', 'icon_dictionary.json');
            IconPickerWebview._cachedIconDict = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            
            const groups: Record<string, any[]> = {
                'status': [], 'arch': [], 'ui': [], 'fun': [], 'brand': []
            };

            IconPickerWebview._cachedIconDict!.forEach((icon: any) => {
                IconPickerWebview._cachedIconMap.set(icon.id, icon);
                if (icon.id.startsWith('status_')) groups['status'].push(icon);
                else if (icon.id.startsWith('arch_')) groups['arch'].push(icon);
                else if (icon.id.startsWith('ui_')) groups['ui'].push(icon);
                else if (icon.id.startsWith('fun_')) groups['fun'].push(icon);
                else if (icon.id.startsWith('brand_')) groups['brand'].push(icon);
            });

            const titleMap: Record<string, string> = {
                'status': iconSvg('M22 12h-4l-3 9L9 3l-3 9H2') + ' 代码状态',
                'arch': iconSvg('M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 12H2M12 2v20') + ' 核心架构',
                'ui': iconSvg('M3 3h18v18H3zM3 9h18') + ' 界面资源',
                'fun': iconSvg('M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z') + ' 趣味标签',
                'brand': iconSvg('M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01') + ' 品牌徽标'
            };

            const baseUriStr = baseUri.toString();

            ['status', 'arch', 'ui', 'fun', 'brand'].forEach((key, index) => {
                if (groups[key].length === 0) return;
                const activeClass = index === 0 ? 'active' : '';
                IconPickerWebview._cachedTabsHtml += `<div class="tab ${activeClass}" data-target="panel-${key}">${titleMap[key]}</div>`;
                
                const innerGrid = groups[key].map((icon: any) => `
                    <div class="icon-item-container" data-id="${icon.id}">
                        <div class="icon-card" id="card-${key}-${icon.id}">
                            <div class="add-recent-btn" onclick="addRecent(event, '${icon.id}')" title="添加到最近使用">📌</div>
                            <div class="icon-content" data-icon-id="${icon.id}" data-keywords="${(icon.keywords || []).join(', ')}">
                                <img class="icon-img" src="${baseUriStr}/${icon.id}" alt="${icon.name}" loading="lazy">
                            </div>
                        </div>
                        <span class="icon-name">${icon.name.replace(/_/g, ' ')}</span>
                    </div>
                `).join('');

                const hiddenClass = index === 0 ? '' : 'hidden';
                IconPickerWebview._cachedPanelsHtml += `
                    <div class="category-section ${hiddenClass}" id="panel-${key}">
                        <div class="grid">
                            ${innerGrid}
                        </div>
                    </div>
                `;
            });
        }

        // Generate Recent Tab dynamically
        let recentInnerGrid = '';
        
        if (this._currentIcon && this._currentIcon !== '') {
            recentInnerGrid += `
                <div class="icon-item-container restore-default" data-id="">
                    <div class="icon-card" style="border-color: #D8BA92; background: rgba(216, 186, 146, 0.1);" onclick="selectIcon('')">
                        <div class="icon-content">
                            <span style="font-size: 24px; color: #D8BA92;">↩</span>
                        </div>
                    </div>
                    <span class="icon-name" style="color: #D8BA92;">恢复默认</span>
                </div>
            `;
        }

        const recentIcons = recentIds.map(id => IconPickerWebview._cachedIconMap.get(id)).filter(Boolean);
        if (recentIcons.length === 0 && (!this._currentIcon || this._currentIcon === '')) {
            recentInnerGrid = `<div class="empty-recent">暂无最近使用记录</div>`;
        } else {
            const baseUriStr = baseUri.toString();
            recentInnerGrid += recentIcons.map((icon: any) => `
                <div class="icon-item-container" data-id="${icon.id}">
                    <div class="icon-card" id="card-recent-${icon.id}">
                        <div class="remove-btn" onclick="removeRecent(event, '${icon.id}')" title="移除">❌</div>
                        <div class="icon-content" data-icon-id="${icon.id}" data-keywords="${(icon.keywords || []).join(', ')}">
                            <img class="icon-img" src="${baseUriStr}/${icon.id}" alt="${icon.name}" loading="lazy">
                        </div>
                    </div>
                    <span class="icon-name">${icon.name.replace(/_/g, ' ')}</span>
                </div>
            `).join('');
        }

        const recentTabHtml = `<div class="tab active" data-target="panel-recent">${iconSvg('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2')} 最近使用</div>`;
        const recentPanelHtml = `
            <div class="category-section" id="panel-recent">
                <div class="grid">
                    ${recentInnerGrid}
                </div>
            </div>
        `;

        let finalTabsHtml = '';
        let initialPanelsHtml = '';
        let deferredPanelsHtml = '';
        if (recentIcons.length > 0) {
            finalTabsHtml = recentTabHtml + `<hr class="sidebar-separator"/>` + IconPickerWebview._cachedTabsHtml.replace('class="tab active"', 'class="tab"');
            initialPanelsHtml = recentPanelHtml;
            deferredPanelsHtml = IconPickerWebview._cachedPanelsHtml.replace('class="category-section "', 'class="category-section hidden"');
        } else {
            finalTabsHtml = IconPickerWebview._cachedTabsHtml;
            const firstPanelEndIndex = IconPickerWebview._cachedPanelsHtml.indexOf('<div class="category-section hidden"');
            if (firstPanelEndIndex > -1) {
                initialPanelsHtml = IconPickerWebview._cachedPanelsHtml.substring(0, firstPanelEndIndex);
                deferredPanelsHtml = IconPickerWebview._cachedPanelsHtml.substring(firstPanelEndIndex);
            } else {
                initialPanelsHtml = IconPickerWebview._cachedPanelsHtml;
                deferredPanelsHtml = '';
            }
        }

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>选择书签图标</title>
                <style>
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
                <script src="${fuseUri}"></script>
            </head>
            <body>
                <div class="header">
                    <div class="brand-container">
                        <svg class="brand-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span class="brand-name">代码书签</span>
                    </div>
                    <div class="search-container">
                        <input type="text" id="search" placeholder="在 ${IconPickerWebview._cachedIconDict?.length} 个代码书签图标中搜索 (支持中英双语检索)">
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
                        <div id="empty-state" class="empty-recent" style="display: none;">未找到匹配的图标</div>
                    </div>
                </div>
                
                <template id="deferred-panels">
                    ${deferredPanelsHtml}
                </template>

                <div id="custom-tooltip"></div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const iconData = ${JSON.stringify(IconPickerWebview._cachedIconDict)};
                    
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
                                            <div class="remove-btn" onclick="removeRecent(event, '\${iconId}')" title="移除">❌</div>
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

                    setTimeout(() => {
                        const template = document.getElementById('deferred-panels');
                        if (template && template.innerHTML.trim().length > 0) {
                            gallery.insertAdjacentHTML('beforeend', template.innerHTML);
                            template.remove();
                            panels = document.querySelectorAll('.category-section:not(#search-results-panel)');
                        }

                        fuse = new Fuse(iconData, {
                            keys: [
                                { name: 'name', weight: 0.7 },
                                { name: 'keywords', weight: 0.3 }
                            ],
                            threshold: 0.3,
                            ignoreLocation: true,
                            useExtendedSearch: true
                        });
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
                            document.getElementById(targetId).classList.remove('hidden');
                        });
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
                        const results = fuse.search(query);
                        
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
                                        <div class="add-recent-btn" onclick="addRecent(event, '\${icon.id}')" title="添加到最近使用">📌</div>
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
                        const card = e.target.closest('.icon-item-container');
                        if (card && !e.target.closest('.remove-btn') && !e.target.closest('.add-recent-btn')) {
                            selectIcon(card.getAttribute('data-id'));
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
                        
                        tooltip.innerHTML = \`<span class="tooltip-title">代码书签</span><span>可以搜这些关键词: \${keywords}</span>\`;
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
