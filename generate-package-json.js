const fs = require('fs');
const path = require('path');

const Commands_1 = require("./out/util/constants/Commands");
const Colors_1 = require("./out/util/constants/Colors");
const basePackageJsonFile = require("./out/util/constants/BasePackage");

const customPackageJsonPath = path.join(__dirname, 'package.json');

const commands = Commands_1.Commands
const colors = Colors_1.Colors

const basePackageJson = basePackageJsonFile.basePackage;

const customPackageJson = {
  ...basePackageJson,
  contributes: {
    ...basePackageJson.contributes,
    viewsContainers: {
      activitybar: [
        {
          "id": commands.nameExtension,
          "title": "代码书签",
          "icon": "resources/bookmark.svg",
        }
      ]
    },
    views: {
      codebookmark: commands.codebookmark,
    },
    viewsWelcome: [
      {
        "view": commands.codeBookmarkViewName,
        "contents": `暂无书签，按下 Ctrl+B 即刻添加！\n\n[导入书签配置文件](command:${commands.bookmarkCommands.importBookmarkConfig.command})\n\n[查看使用说明](command:codebookmark.openHelp)`,
        "when": `${commands.varBookmarkLoaded} && !${commands.varBookmarkLoadFailed} && ${commands.varAIAnalysisAvailable} && !${commands.varActiveFileHasBookmark}`
      },
      {
        "view": commands.codeBookmarkViewName,
        "contents": "[查看使用说明](command:codebookmark.openHelp)",
        "when": `${commands.varBookmarkLoaded} && !${commands.varBookmarkLoadFailed} && !${commands.varAIAnalysisAvailable}`
      }
    ],
    commands: [
      ...[
        ...Object.values(commands.bookmarkCommands),
        ...commands.undoCommands,
        ...commands.redoCommands,
      ]
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
        })
    ],
    keybindings: commands.keybindings,
    menus: {
      "view/title": [
        ...commands.view_title
          .map((e) => {
            const menu = { "when": e.when, "group": e.group };
            if (e.command) menu.command = e.command;
            if (e.submenu) menu.submenu = e.submenu;
            return menu;
          })
      ],
      "view/item/context": commands.view_item_context,
      "editor/context": commands.editor_context,
      "commandPalette": commands.command_palette,
      [commands.editSubmenuId]: commands.editSubmenu_items,
      [commands.moreSubmenuId]: commands.moreSubmenu_items,
      [commands.exportSubmenuId]: commands.exportSubmenu_items,
      [commands.batchExportSubmenuId]: commands.batchExportSubmenu_items,
      [commands.aiSubmenuId]: commands.aiSubmenu_items,
      [commands.aiGenerateSubmenuId]: commands.aiGenerateSubmenu_items,
			[commands.aiGenerateWorkspaceSubmenuId]: commands.aiGenerateWorkspaceSubmenu_items,
      [commands.aiGenerateFileSubmenuId]: commands.aiGenerateFileSubmenu_items,
      [commands.aiGenerateFolderSubmenuId]: commands.aiGenerateFolderSubmenu_items,
      [commands.aiOptimizeSubmenuId]: commands.aiOptimizeSubmenu_items
    },

    submenus: commands.submenus,
    configuration: commands.configuration,
    colors: colors.colors
  }
};

const temporaryPackageJsonPath = `${customPackageJsonPath}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temporaryPackageJsonPath, JSON.stringify(customPackageJson, null, 2));
  fs.renameSync(temporaryPackageJsonPath, customPackageJsonPath);
} catch (error) {
  try { fs.unlinkSync(temporaryPackageJsonPath); } catch {}
  throw error;
}

console.log(`Generated custom package.json `);
