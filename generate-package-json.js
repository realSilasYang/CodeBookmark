const fs = require('fs');
const path = require('path');

const Commands_1 = require("./out/util/constants/Commands");
const Colors_1 = require("./out/util/constants/Colors");
const basePackageJsonFile = require("./out/util/constants/BasePackage");

const customPackageJsonPath = path.join(__dirname, 'package.json');

const commants = Commands_1.Commands
const colors = Colors_1.Colors

console.log("nameExtension = " + commants.nameExtension)

const basePackageJson = basePackageJsonFile.basePackage;

let dynamicCommands = [];
let dynamicMenus = [];

const actions = {
  '': '',
  'drag': '拖拽节点位置',
  'add': '新增书签',
  'delete': '删除书签',
  'sync': '同步代码变更',
  'rename': '重命名书签',
  'icon': '修改书签图标',
  'move': '移动书签层级',
  'status': '更改展开状态',
  'ai': 'AI 批量生成书签',
  'ai-optimize': 'AI 批量优化标签'
};

for (const [key, name] of Object.entries(actions)) {
  const suffix = key ? `.${key}` : '';
  const undoTitle = key ? `撤销上一步操作 (${name})` : `撤销`;
  const redoTitle = key ? `恢复撤销的操作 (${name})` : `恢复`;
  const undoWhen = key ? `view == ${commants.codeBookmarkViewName} && codebookmark.undoAction == '${key}'` : `view == ${commants.codeBookmarkViewName} && !codebookmark.undoAction`;
  const redoWhen = key ? `view == ${commants.codeBookmarkViewName} && codebookmark.redoAction == '${key}'` : `view == ${commants.codeBookmarkViewName} && !codebookmark.redoAction`;
  
  // Undo
  dynamicCommands.push({
    "command": `codebookmark.undo${suffix}`,
    "title": undoTitle,
    "icon": "$(discard)",
    "category": "Code Bookmarks",
    "enablement": commants.varCanUndo
  });
  dynamicMenus.push({
    "command": `codebookmark.undo${suffix}`,
    "when": undoWhen,
    "group": `navigation@1`
  });

  // Redo
  dynamicCommands.push({
    "command": `codebookmark.redo${suffix}`,
    "title": redoTitle,
    "icon": "$(redo)",
    "category": "Code Bookmarks",
    "enablement": commants.varCanRedo
  });
  dynamicMenus.push({
    "command": `codebookmark.redo${suffix}`,
    "when": redoWhen,
    "group": `navigation@2`
  });
}

const customPackageJson = {
  ...basePackageJson,
  contributes: {
    ...basePackageJson.contributes,
    viewsContainers: {
      activitybar: [
        {
          "id": commants.nameExtension,
          "title": "代码书签",
          "icon": "resources/bookmark.svg",
        }
      ]
    },
    views: {
      codebookmark: commants.codebookmark,
    },
    viewsWelcome: [
      {
        "view": commants.codeBookmarkViewName,
        "contents": "暂无书签，按 [Ctrl+B] 添加\n\n[查看使用说明](command:codebookmark.openHelp)",
        "when": `${commants.varBookmarkLoaded} && !${commants.varHasBookmark}`
      }
    ],
    commands: [
      ...Object.values(commants.bookmarkCommands)
        .filter(e => e.command !== 'codebookmark.undo' && e.command !== 'codebookmark.redo')
        .filter((e, i, arr) => {
          // Deduplicate: keep only the first occurrence of each command ID
          return arr.findIndex(x => x.command === e.command) === i;
        })
        .map((e) => {
          const cmd = { "command": e.command, "title": e.title };
          if (e.icon) cmd.icon = e.icon;
          if (e.enablement) cmd.enablement = e.enablement;
          if (e.category) cmd.category = e.category;
          return cmd;
        }),
      ...dynamicCommands
    ],
    keybindings: commants.keybindings,
    menus: {
      "commandPalett": commants.commandPalett,
      "view/title": [
        ...commants.view_title
          .filter(e => e.command !== 'codebookmark.undo' && e.command !== 'codebookmark.redo')
          .map((e) => {
            const menu = { "when": e.when, "group": e.group };
            if (e.command) menu.command = e.command;
            if (e.submenu) menu.submenu = e.submenu;
            return menu;
          }),
        ...dynamicMenus
      ],
      "view/item/context": commants.view_item_context,
      "editor/context": commants.editor_context,
      [commants.editSubmenuId]: commants.editSubmenu_items,
      [commants.moreSubmenuId]: commants.moreSubmenu_items,
      [commants.aiSubmenuId]: commants.aiSubmenu_items,
      [commants.aiGenerateSubmenuId]: commants.aiGenerateSubmenu_items,
      [commants.aiGenerateFileSubmenuId]: commants.aiGenerateFileSubmenu_items,
      [commants.aiGenerateFolderSubmenuId]: commants.aiGenerateFolderSubmenu_items,
      [commants.aiOptimizeSubmenuId]: commants.aiOptimizeSubmenu_items
    },

    submenus: commants.submenus,
    configuration: commants.configuration,
    colors: colors.colors
  }
};

customPackageJson.name = "codebookmark";
customPackageJson.displayName = "Code Bookmarks";
customPackageJson.version = "1.0.0";
customPackageJson.publisher = "阳熙来";
customPackageJson.description = "一款强大的代码书签管理插件，能够让你在 VS Code 中高效地标记、导航和管理代码跳转。";
customPackageJson.icon = "resources/bookmark_logo.png";

fs.writeFileSync(customPackageJsonPath, JSON.stringify(customPackageJson, null, 2));

console.log(`Generated custom package.json `);
