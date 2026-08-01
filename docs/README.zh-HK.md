<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark 標誌">

  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <strong>繁體中文（香港）</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>程式碼書籤 - CodeBookmark</h1>

  <p><strong>黏性引擎讓書籤持續綁定程式檔並準確跟隨程式碼，配合 AI 輔助、豐富圖示及本機儲存</strong></p>

  <p>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/v/release/realSilasYang/CodeBookmark?style=flat-square&amp;label=version" alt="最新版本"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/realSilasYang/CodeBookmark/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI 狀態"></a>
    <a href="../LICENSE"><img src="https://img.shields.io/github/license/realSilasYang/CodeBookmark?style=flat-square" alt="授權條款"></a>
  </p>

  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">擴充功能市集</a> · <a href="#使用指南">使用指南</a> · <a href="#開發者指南">開發者指南</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">回報問題</a></p>
</div>

CodeBookmark 是用書籤標記及導覽程式碼的 VS Code 擴充功能。黏性引擎會把書籤設定與程式檔身份綁定，即使內容增刪、檔案改名、資料夾搬移或工作區路徑改變，仍會嘗試重新定位。書籤資料只會儲存在你指定的本機目錄；AI 可按程式碼語意產生書籤、改善標籤及在證據充分時選擇圖示。

# 介面概覽

[![CodeBookmark 介面概覽](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# 捐贈

如果書籤導覽與 AI 輔助為你節省了時間，歡迎透過以下方式扶貧（≥Д≤）

<div align="center">
  <table>
    <tr><td align="center"><strong>微信</strong></td><td align="center"><strong>支付寶</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="微信個人收款碼"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="支付寶個人收款碼"></td></tr>
  </table>
</div>

# 使用指南

## 1. 首次設定

首次使用時，請在「程式碼書籤設定」指定 `Codebookmark: Global Storage Path`。這是書籤設定的根目錄，不應指向原始碼目錄、同步中的臨時目錄或沒有寫入權限的位置。

- 開啟單一檔案時，側欄只顯示該檔案的書籤。
- 開啟資料夾或工作區時，側欄顯示工作區內的檔案節點、普通書籤及跨檔案佈局。
- 所有設定檔均儲存在本機；擴充功能不會把書籤內容上載到自設伺服器。

## 2. 快捷鍵與基本操作

| 操作 | Windows／Linux | macOS |
| --- | --- | --- |
| 加入或移除目前行的書籤 | `Ctrl+B` | `Cmd+B` |
| 強制加入書籤 | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| 強制移除書籤 | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

新增書籤時會記錄標籤、行號、原始碼錨點、層級、圖示、展開狀態及穩定身份。按一下樹狀節點會跳到對應程式碼；若目標檔案已開啟便切換到該分頁，否則以非預覽分頁開啟。失效節點可透過右鍵功能重新綁定或清理。

## 3. 層級、拖放、容器與排序

書籤和檔案節點都可以排序、改名、自訂圖示、成為書籤容器及接收其他節點。工作區模式支援跨檔案拖放，但不會把不同檔案的書籤正文合併：每個程式檔仍保留自己的設定檔，跨檔案父子關係只寫入工作區 `_workspace_layout.json`。

多選後可一次移動、刪除或修改節點。刪除檔案節點不會刪除任何原始碼檔案；確認刪除視覺子樹時，子樹內的普通書籤會從各自程式檔設定中真正移除。工具列可展開全部、摺疊全部或按指定深度展開。

## 4. 搜尋、行內標籤與圖示

搜尋會比對標籤、檔案名稱、路徑及程式碼內容。行內裝飾可直接顯示書籤標籤；顏色、字型大小、字重、間距及顯示方式均可在設定中調整。

圖示選擇器按程式狀態、核心架構、介面資源、趣味標籤及品牌分類，支援中英文模糊搜尋、分頁載入及最近使用。最近圖示會透過 VS Code 設定同步；AI 只有在標籤具有明確語意證據時才可指定圖示，含糊情況使用預設書籤圖示。

## 5. TODO、FIXME、BUG 自動書籤

自動標記不是簡單搜尋文字。只有 VS Code 已為該語言註冊語法高亮 grammar 及正式註解規則，而且 `TODO`、`FIXME` 或 `BUG` 位於真正註解開頭並符合指令結構時，才會建立自動書籤。SVG 圖示名稱、JSON 資料、字串、一般文章、純文字模式及沒有語法高亮的檔案不會誤判。

自動書籤會保留穩定身份及使用者自訂標籤／圖示；標記消失後會清理自動節點並保留已提升的手動子節點。工作區背景掃描最多發現 2,000 個檔案，未開啟且超過 2 MiB 的檔案會略過；每個程式檔最多 5,000 個自動標記，整份設定最多 10,000 個節點。

## 6. 檔案搬移、改名與復原

書籤不只依賴絕對路徑。儲存層會綜合腳本身份、工作區相對路徑、內容特徵、搬移日誌及缺失墓碑重新識別檔案，因此可處理 VS Code 改名、檔案總管搬移、資料夾整體搬移、單一程式檔移動，以及未收到改名事件的刪除後重建流程。

檔案短暫消失時不會立即遺忘身份；重新出現並通過無歧義比對後會自動綁定。若多個候選同樣可信，擴充功能不會猜測。原始碼位置則由錨點、鄰近內容及結構評分追蹤，內容證據不足時節點會標示失效，避免跳到錯誤位置。

## 7. 匯入、匯出與設定檔管理

- 「匯入／匯出書籤」可把目前程式檔或工作區保存成單一 `.codebookmark` 可攜式書籤設定，供本機其他資料夾或 Windows、macOS、Linux 裝置反覆匯入、修改及分享。
- 設定包保留標籤、圖示、層級、程式碼錨點、檔案節點外觀及跨檔案佈局，但不包含本機絕對路徑或檔案系統身份。舊 JSON 及設定資料夾不再支援匯入。
- 匯入會自動辨識單檔或工作區，並按相對路徑、原始碼摘要及書籤上下文尋找唯一目標；有歧義時列出衝突，不會猜測綁定。目標已有書籤時可選擇追加或覆蓋。
- 「其他格式」仍提供階層化純文字、Markdown、HTML 及 CSV；這些閱讀格式不能再次匯入。資料夾匯出只處理有書籤的程式檔。

「管理書籤設定檔」會列出程式檔設定、工作區佈局、跨裝置交換記錄、遷移日誌、衝突副本及臨時殘留。欄位可懸停查看完整內容；清理交換記錄不會刪除目前書籤，但會失去該系列的身份映射與合併基準。作用域沒有內容且不再受撤銷／重做歷史保護時，空資料夾會自動刪除。

## 8. AI 輔助

在設定中填寫 `Codebookmark.AI: Address`、`API Key` 及模型名稱。Address 可接受資源 Endpoint、API Base URL、Chat Completions、Responses、Anthropic Messages、Gemini `generateContent` 或 Ollama 位址；測試成功後會把輸入框更新為實際可用地址。遠端服務應使用 HTTPS。

AI 可為目前程式檔或工作區內無書籤的程式檔產生書籤，也可為已有書籤的程式檔追加、重新產生或改善標籤。選單會按目前是否開啟檔案、是否為工作區，以及目標範圍是否已有書籤動態隱藏無效項目。

擴充功能會驗證 JSON 結構、行號、逐字錨點、節點數量、深度、ID 所有權及圖示白名單；原始碼、標籤和檔名一律視為資料，不能改寫輸出協議。未受信任工作區停用 AI。逾時、取消、檔案變更或回應超出限制時會中止，不會套用半完成結果。

## 9. 撤銷、重做與衝突處理

新增、刪除、改名、拖放、排序、容器、圖示、AI 結果、匯入及批次操作均建立原子撤銷記錄。新操作會截斷重做分支；歷史按作用域隔離並有容量上限。只要仍有可撤銷或重做內容，相關作用域目錄便不會提前清理。

儲存採用每個檔案的序列化佇列、外部修改檢查及原子替換。若磁碟版本在本次讀取後被其他程序修改，擴充功能會停止覆寫並提示重新載入，避免靜默遺失資料。更換全域儲存根目錄時，成功遷移後會清除舊目錄內已遷移的檔案。

## 10. 主要設定

| 設定 | 用途 |
| --- | --- |
| `codebookmark.globalStoragePath` | 本機書籤根目錄 |
| `codebookmark.defaultIcon` | 預設書籤圖示 |
| `codebookmark.showLineNumber` | 在樹狀檢視顯示行號 |
| `codebookmark.showLabelInEditor` | 在編輯器顯示行內標籤 |
| `codebookmark.autoSpace` | 自動調整中英文／數字間距 |
| `codebookmark.codeMarkers.enabled` | 啟用 TODO／FIXME／BUG 自動書籤 |
| `codebookmark.AI.address` | AI 服務地址 |
| `codebookmark.AI.APIKey` | AI 介面密鑰 |
| `codebookmark.AI.model` | AI 模型或部署名稱 |
| `codebookmark.AI.assignIcons` | 讓 AI 在產生書籤後選擇圖示 |

# 開發者指南

## 1. 專案結構與生成邊界

`src/` 保存 TypeScript 原始碼，`scripts/` 保存建置、驗證、整合測試及發佈工具，`tests/` 保存單元、契約及 Extension Host 測試，`resources/` 保存執行期資源。`package.json`、`out/` 和 `package.nls*.json` 均由建置流程生成；清單真值位於 `src/util/constants/BasePackage.ts` 與 `Commands.ts`。

## 2. 啟用與檢視狀態

`extension.ts` 初始化本地化、設定、儲存庫、Provider、命令和檔案訂閱。檢視狀態由明確 Context Key 驅動；歡迎頁、工具列和 AI 選單不得用顯示文字作判斷。

## 3. 模型與樹狀結構

`Bookmark`、`BookmarkSet` 和 Codec 定義穩定身份、父子關係及持久化格式。Provider 負責把領域模型投影成 VS Code TreeItem；檔案節點完整參與排序、圖示、容器、改名和刪除工作流。

## 4. 持久化與腳本身份

每個程式檔有獨立書籤設定；工作區 `_workspace_layout.json` 只保存跨檔案順序、父子關係、隱藏、容器及展開狀態。持久化資料帶有正式 schema 身份並經 `PersistenceSchema`、`BookmarkCodec` 和遷移邏輯驗證。

## 5. 檔案事件與儲存根目錄

`BookmarkRepository`、`ScriptRelocationJournal` 及檔案訂閱共同處理 VS Code 改名、外部搬移、刪除後出現和資料夾遷移。切換儲存根目錄採先複製驗證、再切換、最後清理舊資料的次序。

## 6. 儲存佇列與原子寫入

同一設定檔的寫入必須序列化；提交前比較已讀版本，並透過臨時檔與原子重新命名取代目標。任何外部版本衝突都必須顯式回報。

## 7. 程式碼位置追隨

黏性引擎先嘗試精確錨點，再以鄰近內容、結構及距離評分候選。只有唯一可信結果才更新位置；歧義不會以「最近一行」強行配對。

## 8. 撤銷架構

撤銷單位是完整領域快照，不是散落的反向指令。跨檔案操作必須在同一原子記錄內涵蓋所有受影響程式檔及工作區佈局。

## 9. AI 協議與安全

`AIService` 負責地址辨識及傳輸，Schema 負責不受信任輸入的結構驗證，圖示目錄負責語意授權。提示注入不能改變固定 JSON 協議；金鑰保存在 VS Code 設定中，不得寫入日誌或匯出資料。

## 10. 自動標記與語言資格

`LanguageCommentProfileRegistry` 先確認 grammar，再載入正式語言設定中的註解語法；`CodeMarkerScanner` 只在已授權的註解 token 內辨識指令。語言 ID 或副檔名本身不能授權掃描。

## 11. 圖示與 Webview

圖示資源有來源授權、下載大小、HTTPS、SVG 安全及語意詞驗證。Webview 使用 nonce、嚴格 CSP、結構化訊息和穩定值；不可依賴本地化文字傳遞命令。

## 12. 建置、測試與發佈

使用 Node.js 24。`npm run verify` 執行編譯、ESLint、單元測試、契約測試及全部適用於開發階段的專項驗證；`npm run verify:release` 核對已完成的正式版本資料。`npm run test:integration` 重用本機 VS Code，在隔離使用者目錄測試 13 種語言及英語回退；`npm run check:release` 將以上檢查連同依賴審計和 VSIX 清單檢查一併執行。

發佈只接受屬於 `main` 歷史的註解標籤。GitHub Actions 以 OIDC 短期憑證發佈 Marketplace，核對線上 VSIX 哈希，再建立只包含 VSIX 的 GitHub Release，不再提供 SBOM 或 `SHA256SUMS`。詳細流程見[發佈指南](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.md)。

# Star 歷史趨勢

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
