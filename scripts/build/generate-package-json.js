const fs = require('fs');
const path = require('path');

const Commands_1 = require("../../out/util/constants/Commands");
const Colors_1 = require("../../out/util/constants/Colors");
const basePackageJsonFile = require("../../out/util/constants/BasePackage");
const {
  ENGLISH_MANIFEST_LOCALES,
  MARKETPLACE_DEFAULT_KEYS,
  translateManifestText,
} = require('../lib/manifest-localizations');

const root = path.resolve(__dirname, '../..');
const customPackageJsonPath = path.join(root, 'package.json');

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

const englishMessages = {};
const chineseMessages = {};
const localizedKeys = new Set();

function messageKey(pathSegments) {
  return `codebookmark.${pathSegments.join('.').replace(/[^A-Za-z0-9_.-]/g, '_')}`;
}

function localizeManifestValue(value, pathSegments = []) {
  if (typeof value === 'string') {
    if (!/[\u3400-\u9fff]/u.test(value)) return value;
    if (pathSegments[0] === 'author' || pathSegments[0] === 'keywords') return value;
    const english = translateManifestText(value);
    if (english === undefined) {
      throw new Error(`Missing English manifest localization at ${pathSegments.join('.')}: ${value}`);
    }
    const key = messageKey(pathSegments);
    if (localizedKeys.has(key)) throw new Error(`Duplicate manifest localization key: ${key}`);
    localizedKeys.add(key);
    englishMessages[key] = english;
    chineseMessages[key] = value;
    return `%${key}%`;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => localizeManifestValue(item, [...pathSegments, String(index)]));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, localizeManifestValue(item, [...pathSegments, key])]));
  }
  return value;
}

const customPackageJson = localizeManifestValue(sourcePackageJson);

const marketplaceDefaultMessages = { ...englishMessages };
const englishMarketplaceOverrides = {};
for (const key of MARKETPLACE_DEFAULT_KEYS) {
  if (!(key in englishMessages) || !(key in chineseMessages)) {
    throw new Error(`Missing Marketplace localization key: ${key}`);
  }
  marketplaceDefaultMessages[key] = chineseMessages[key];
  englishMarketplaceOverrides[key] = englishMessages[key];
}

const temporaryPackageJsonPath = `${customPackageJsonPath}.${process.pid}.tmp`;
const localizationFiles = [
  ['package.nls.json', marketplaceDefaultMessages],
  ['package.nls.en.json', englishMessages],
  ...ENGLISH_MANIFEST_LOCALES
    .filter(locale => locale !== 'en')
    .map(locale => [`package.nls.${locale}.json`, englishMarketplaceOverrides]),
  ['package.nls.zh.json', chineseMessages],
  ['package.nls.zh-cn.json', chineseMessages],
  ['package.nls.zh-tw.json', chineseMessages],
];
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
    if (/^package\.nls(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.json$/i.test(fileName) && !generatedFiles.has(fileName)) {
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
