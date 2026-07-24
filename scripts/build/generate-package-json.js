/**
 * 从 BasePackage 生成可发布 package.json，并同步展开命令、菜单和设置的本地化占位符。
 * 生成过程同时检查命令唯一性和语言目录完整性，让运行时清单与源码常量保持同源。
 */
const fs = require('fs');
const path = require('path');

const Commands_1 = require("../../out/util/constants/Commands");
const Colors_1 = require("../../out/util/constants/Colors");
const basePackageJsonFile = require("../../out/util/constants/BasePackage");
const { arraySegments, manifestMessageKey } = require('../lib/manifest-message-keys');
const {
  GENERATED_NLS_PATTERN,
  buildManifestLocalizationFiles,
  discoverManifestCatalogs,
} = require('../lib/manifest-language-catalogs');

const root = path.resolve(__dirname, '../..');
const customPackageJsonPath = path.join(root, 'package.json');
const manifestCatalogRoot = path.join(root, 'scripts', 'i18n', 'catalogs');
const manifestCatalogs = discoverManifestCatalogs(manifestCatalogRoot);
const chineseCatalog = manifestCatalogs.get('zh-cn');

const commands = Commands_1.Commands
const colors = Colors_1.Colors

const basePackageJson = basePackageJsonFile.basePackage;
const currentPackageJson = JSON.parse(fs.readFileSync(customPackageJsonPath, 'utf8'));

const sourcePackageJson = {
  ...basePackageJson,
  devDependencies: currentPackageJson.devDependencies ?? {},
  dependencies: currentPackageJson.dependencies ?? {},
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
          // 同一命令可能从多个菜单分支汇入；只保留最先声明的那一项，
          // 这样清单不会出现重复入口，人工安排的菜单顺序也不会被后续分支打乱。
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

const localizedMessages = new Map([...manifestCatalogs].map(([locale]) => [locale, {}]));
const localizedKeys = new Set();

function messageKey(value, pathSegments) {
  if (pathSegments.at(-1) === 'category' && value === '代码书签') {
    return 'codebookmark.common.commandCategory';
  }
  return manifestMessageKey(pathSegments);
}

function localizeManifestValue(value, pathSegments = []) {
  if (typeof value === 'string') {
    if (pathSegments[0] === 'author' || pathSegments[0] === 'keywords') return value;
    const key = messageKey(value, pathSegments);
    const chinese = chineseCatalog[key];
    if (chinese === undefined) {
      if (/[\u3400-\u9fff]/u.test(value)) {
        throw new Error(`Missing manifest catalog entry at ${pathSegments.join('.')}: ${value}`);
      }
      return value;
    }
    if (chinese !== value) {
      throw new Error(`Stale Chinese manifest catalog entry ${key}: expected ${JSON.stringify(value)}, received ${JSON.stringify(chinese)}`);
    }
    if (localizedKeys.has(key)) return `%${key}%`;
    localizedKeys.add(key);
    for (const [locale, catalog] of manifestCatalogs) {
      if (catalog[key] === undefined) {
        throw new Error('Missing manifest catalog entry ' + key + ' in manifest.' + locale + '.json');
      }
      localizedMessages.get(locale)[key] = catalog[key];
    }
    return `%${key}%`;
  }
  if (Array.isArray(value)) {
    const segments = arraySegments(value);
    return value.map((item, index) => localizeManifestValue(item, [...pathSegments, segments[index]]));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, localizeManifestValue(item, [...pathSegments, key])]));
  }
  return value;
}

const customPackageJson = localizeManifestValue(sourcePackageJson);

for (const [locale, catalog] of manifestCatalogs) {
  const unusedKeys = Object.keys(catalog).filter(key => !localizedKeys.has(key));
  if (unusedKeys.length > 0) {
    throw new Error('Unused manifest catalog entries in manifest.' + locale + '.json: ' + unusedKeys.join(', '));
  }
}

const temporaryPackageJsonPath = `${customPackageJsonPath}.${process.pid}.tmp`;
const generatedCatalogs = new Map([...manifestCatalogs]
  .map(([locale]) => [locale, localizedMessages.get(locale)]));
const localizationFiles = [...buildManifestLocalizationFiles(generatedCatalogs)];
const temporaryLocalizationPaths = localizationFiles.map(([fileName]) =>
  [path.join(root, fileName), path.join(root, `${fileName}.${process.pid}.tmp`)]
);
try {
  fs.writeFileSync(temporaryPackageJsonPath, JSON.stringify(customPackageJson, null, 2));
  for (let index = 0; index < localizationFiles.length; index++) {
    fs.writeFileSync(temporaryLocalizationPaths[index][1], JSON.stringify(localizationFiles[index][1], null, 2));
  }
  fs.renameSync(temporaryPackageJsonPath, customPackageJsonPath);
  for (const [target, temporary] of temporaryLocalizationPaths) fs.renameSync(temporary, target);
  const generatedFiles = new Set(localizationFiles.map(([fileName]) => fileName));
  for (const fileName of fs.readdirSync(root)) {
    if (GENERATED_NLS_PATTERN.test(fileName) && !generatedFiles.has(fileName)) {
      fs.unlinkSync(path.join(root, fileName));
    }
  }
} catch (error) {
  try { fs.unlinkSync(temporaryPackageJsonPath); } catch {}
  for (const [, temporary] of temporaryLocalizationPaths) {
    try { fs.unlinkSync(temporary); } catch {}
  }
  throw error;
}

console.log(`Generated custom package.json, ${localizationFiles.length} NLS catalogs, and ${localizedKeys.size} localized manifest messages`);
