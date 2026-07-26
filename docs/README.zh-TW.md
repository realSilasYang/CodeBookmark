<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark 圖示">

  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <strong>繁體中文（台灣）</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>程式碼書籤 - CodeBookmark</h1>

  <p><strong>黏性引擎讓書籤持續綁定程式檔並精準跟隨程式碼，支援 AI 輔助、豐富圖示與本機儲存</strong></p>

  <p>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/v/release/realSilasYang/CodeBookmark?style=flat-square&amp;label=version" alt="最新版本"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/realSilasYang/CodeBookmark/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI 狀態"></a>
    <a href="../LICENSE"><img src="https://img.shields.io/github/license/realSilasYang/CodeBookmark?style=flat-square" alt="授權條款"></a>
  </p>

  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">擴充功能市集</a> · <a href="#使用者指南">使用者指南</a> · <a href="#開發者指南">開發者指南</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">問題回報</a></p>
</div>

CodeBookmark 是一套用書籤標記並導覽程式碼的 VS Code 擴充功能。核心黏性引擎會把書籤設定與程式檔身分持續綁定；即使程式碼增刪、檔案重新命名、資料夾搬移或工作區路徑改變，也會重新尋找正確位置。資料只儲存在使用者指定的本機目錄；AI 可依程式碼語意產生書籤、改善標籤，並只在語意明確時選擇圖示。

# 介面概覽

[![CodeBookmark 介面概覽](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# 贊賞

如果書籤導覽與 AI 輔助為你節省了時間，歡迎透過下方 QR Code 請作者喝杯奶茶！

<div align="center">
  <table>
    <tr><td align="center"><strong>微信</strong></td><td align="center"><strong>支付寶</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="微信個人收款碼"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="支付寶個人收款碼"></td></tr>
  </table>
</div>

# 使用者指南

## 1. 第一次使用

先在「程式碼書籤設定」指定 `Codebookmark: Global Storage Path`。這是所有書籤設定的根目錄，請選擇可長期寫入的本機資料夾，不要指向原始碼目錄或暫存資料夾。

- 只開啟單一檔案時，側邊欄只顯示該檔案的書籤。
- 開啟資料夾或工作區時，側邊欄顯示工作區中的檔案節點、一般書籤與跨檔案版面配置。
- 擴充功能不會自行把書籤內容上傳到遠端服務；只有使用 AI 指令時，選定的程式碼才會送往使用者設定的 AI 端點。

## 2. 快捷鍵與日常操作

| 操作 | Windows／Linux | macOS |
| --- | --- | --- |
| 新增或移除游標所在行的書籤 | `Ctrl+B` | `Cmd+B` |
| 強制新增書籤 | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| 強制移除書籤 | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

書籤會記錄標籤、行號、原始碼錨點、階層、圖示、展開狀態與穩定身分。點選節點後，已開啟的目標檔案會直接切換；尚未開啟的檔案會使用非預覽分頁開啟，不會覆蓋目前分頁。失效節點可透過內容選單重新綁定或清除。

## 3. 階層、拖放、容器與排序

一般書籤和檔案節點都能排序、重新命名、自訂圖示、設為書籤容器，以及接收其他檔案節點或書籤。跨檔案拖放只改變工作區的視覺結構：每個程式檔的書籤本文仍保存在自己的設定檔，跨檔案順序與父子關係則寫入 `_workspace_layout.json`。

多選模式可一次搬移、刪除或調整多個節點。刪除檔案節點絕不會刪除原始碼檔案；若確認刪除整個視覺子樹，子樹中的一般書籤會從各自程式檔設定中實際移除。工具列可全部展開、全部收合或依深度展開。

## 4. 搜尋、行內標籤與圖示

搜尋範圍包含書籤標籤、檔名、路徑與程式碼內容。編輯器可顯示行內書籤標籤，並可設定色彩、字型大小、字重、間距與顯示位置。

圖示選擇器依程式狀態、核心架構、介面資源、趣味標籤與品牌分類，支援中英文模糊搜尋、分頁載入及最近使用。最近使用的圖示可由 VS Code 設定同步。AI 只有在標籤具有高度吻合的明確語意時才會指定圖示；無法確定時一律使用預設圖示。

## 5. TODO、FIXME、BUG 自動書籤

自動標記依賴 VS Code 真正的語法資訊，而不是全文搜尋。語言必須同時註冊語法醒目提示 grammar 與正式註解規則，而且 `TODO`、`FIXME` 或 `BUG` 必須位於真實註解的開頭並符合指令格式。SVG 圖示名稱、JSON 中繼資料、字串、一般文字、純文字模式或沒有語法醒目提示的檔案都不會建立書籤。

自動節點會沿用穩定身分並保留使用者自訂的標籤與圖示；標記消失時會移除自動節點，但保留已提升為手動內容的子節點。工作區掃描最多發現 2,000 個檔案，未開啟且超過 2 MiB 的檔案會略過；單一程式檔最多 5,000 個自動標記，完整設定最多 10,000 個節點。

## 6. 檔案搬移、重新命名與復原

書籤身分不只依賴絕對路徑。儲存庫會綜合腳本身分、工作區相對路徑、內容特徵、搬移紀錄與缺失墓碑，處理 VS Code 重新命名、檔案總管搬移、整個資料夾搬移、單一腳本移動，以及沒有收到重新命名事件的刪除後建立流程。

檔案暫時消失時，身分不會立刻失效；重新出現且只有一個可信候選時會自動重新綁定。多個候選同樣可信時不會猜測。程式碼位置追蹤先使用精確錨點，再比對鄰近內容與結構；證據不足時會把節點標為失效，以免跳到錯誤位置。

## 7. 匯入、匯出與設定檔管理

- 「匯入／匯出書籤」可將目前腳本或工作區儲存成單一 `.codebookmark` 可攜式書籤設定，供本機其他資料夾或 Windows、macOS、Linux 裝置反覆匯入、修改與分享。
- 設定包保留標籤、圖示、階層、程式碼錨點、檔案節點外觀與跨檔案版面配置，但不包含本機絕對路徑或檔案系統身分。舊 JSON 與設定資料夾不再支援匯入。
- 匯入會自動辨識單一腳本或工作區，並依相對路徑、原始碼摘要與書籤上下文尋找唯一目標；有歧義時列出衝突，不會猜測綁定。目標已有書籤時可選擇附加或覆寫。
- 「其他格式」仍提供階層式純文字、Markdown、HTML 與 CSV；這些閱讀格式不能再次匯入。資料夾匯出只處理有書籤的程式檔。

「管理書籤設定檔」會列出腳本設定、工作區版面配置、跨裝置交換記錄、儲存遷移紀錄、衝突副本與暫存殘留。將游標停在欄位即可查看完整資訊；清理交換記錄不會刪除目前書籤，但會失去該系列的身分對應與合併基準。作用域已沒有內容，且沒有任何可復原或重做操作時，空資料夾會自動刪除。

## 8. AI 輔助

請設定 `Codebookmark.AI: Address`、`API Key` 與模型名稱。Address 可填資源 Endpoint、API Base URL、Chat Completions URL、Responses URL、Anthropic Messages URL、Gemini `generateContent` URL 或 Ollama 位址；連線測試成功後，欄位會更新為實際可用地址。遠端服務應使用 HTTPS。

AI 可替目前程式檔或工作區內所有無書籤腳本產生書籤，也可對已有書籤的腳本追加、重新產生或改善標籤。選單會依是否開啟檔案、是否處於工作區，以及目標範圍是否已有書籤，自動隱藏沒有意義的項目並移除只剩單一選項的子選單。

所有回應都要通過 JSON 結構、行號、逐字錨點、節點數、深度、ID 所有權及圖示白名單驗證。原始碼、檔名與既有標籤只會被視為資料，不能更改輸出協定。未受信任的工作區不會啟用 AI；逾時、取消、分析期間檔案變更或回應過大時，結果不會部分套用。

## 9. 復原、重做與衝突處理

新增、刪除、重新命名、拖放、排序、容器、圖示、AI 結果、匯入與批次操作都會建立原子復原記錄。執行新操作會截斷重做分支；歷史依作用域隔離並設有容量上限。仍有可復原或重做內容時，不會提前刪除對應作用域資料夾。

寫入同一設定檔時會經過序列化佇列、外部修改檢查與原子取代。如果磁碟版本在讀取後被其他程式修改，擴充功能會停止覆寫並要求重新載入。變更全域儲存路徑時，資料會先複製並驗證，切換成功後才清除舊目錄中已完成遷移的檔案。

## 10. 主要設定

| 設定 | 用途 |
| --- | --- |
| `codebookmark.globalStoragePath` | 本機書籤根目錄 |
| `codebookmark.defaultIcon` | 預設書籤圖示 |
| `codebookmark.showLineNumber` | 在樹狀檢視顯示行號 |
| `codebookmark.showLabelInEditor` | 在編輯器顯示行內標籤 |
| `codebookmark.autoSpace` | 自動調整中英文與數字間距 |
| `codebookmark.codeMarkers.enabled` | 啟用 TODO／FIXME／BUG 自動書籤 |
| `codebookmark.AI.address` | AI 服務地址 |
| `codebookmark.AI.APIKey` | AI 介面金鑰 |
| `codebookmark.AI.model` | 模型或部署名稱 |
| `codebookmark.AI.assignIcons` | 讓 AI 在產生書籤後選擇圖示 |

# 開發者指南

## 1. 專案結構與生成邊界

`src/` 是 TypeScript 原始碼，`scripts/` 包含建置、驗證、整合測試與發布工具，`tests/` 包含單元、契約及 Extension Host 測試，`resources/` 保存執行階段資源。`package.json`、`out/` 和 `package.nls*.json` 是生成內容；清單真值位於 `BasePackage.ts` 與 `Commands.ts`。

## 2. 啟用流程與檢視狀態

`extension.ts` 依序初始化本地化、設定、儲存庫、Provider、命令與檔案訂閱。歡迎頁、工具列和 AI 選單由穩定 Context Key 控制，不得以翻譯後的顯示文字參與判斷。

## 3. 模型與樹狀結構

`Bookmark`、`BookmarkSet` 與 Codec 定義穩定身分、父子關係及持久化格式；Provider 只負責投影為 TreeItem。檔案節點與一般書籤共用排序、圖示、容器、重新命名及刪除工作流程。

## 4. 持久化版面與腳本身分

每個腳本都有獨立設定檔；`_workspace_layout.json` 只保存跨檔案順序、父子關係、隱藏、容器與展開狀態。所有持久化內容都帶有正式 schema 身分，並由 `PersistenceSchema`、`BookmarkCodec` 及遷移流程驗證。

## 5. 檔案事件與儲存根目錄

`BookmarkRepository`、`ScriptRelocationJournal` 和檔案訂閱共同處理重新命名、外部搬移、刪除後出現與資料夾遷移。更換儲存根目錄時，必須先複製驗證、再切換、最後清理舊資料。

## 6. 儲存佇列與原子寫入

同一檔案的寫入一律序列化；提交前比較已讀版本，再透過暫存檔與原子重新命名取代目標。任何外部版本衝突都必須明確回報。

## 7. 程式碼位置追蹤

黏性引擎先尋找精確錨點，再以鄰近內容、結構及距離評分。只有唯一且可信的候選才會更新位置；不會因為距離最近就強制配對。

## 8. 復原架構

復原單位是完整領域快照。跨檔案操作必須在同一原子記錄內包含所有受影響的腳本設定與工作區版面，避免只回復一半。

## 9. AI 協定與安全邊界

`AIService` 負責地址辨識與傳輸，Schema 驗證不受信任的回應，圖示目錄負責語意授權。提示注入不能更改固定 JSON 協定；API 金鑰不得寫入記錄或匯出資料。

## 10. 自動標記與語言設定

`LanguageCommentProfileRegistry` 先從已安裝擴充功能確認 grammar，再讀取正式語言設定中的註解語法。`CodeMarkerScanner` 只掃描已授權的註解 token；語言 ID 或副檔名本身不能授權。

## 11. 圖示系統與 Webview

圖示管線會檢查來源授權、HTTPS、下載大小與 SVG 安全，並驗證每個圖示的搜尋詞與語意規則。Webview 使用 nonce、嚴格 CSP、結構化訊息與穩定值，不以本地化文字傳遞命令。

## 12. 建置、測試與發布

專案使用 Node.js 24。`npm run verify` 執行編譯、ESLint、單元測試、契約測試與所有適用於開發階段的專項驗證；`npm run verify:release` 核對已完成的正式版本資料。`npm run test:integration` 重用本機 VS Code，在隔離環境驗證 13 種語言及英文回退；`npm run check:release` 將上述檢查連同依賴稽核與 VSIX 清單檢查一併執行。

發布流程只接受位於 `main` 歷史上的註解標籤。GitHub Actions 使用 OIDC 短期憑證發布 Marketplace、比對線上 VSIX 雜湊，並建立包含 VSIX、CycloneDX SBOM 與 `SHA256SUMS` 的 GitHub Release。完整步驟請參閱[發布指南](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.md)。

# Star 歷史趨勢

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
