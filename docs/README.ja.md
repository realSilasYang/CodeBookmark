<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark ロゴ">

  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <strong>日本語</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>CodeBookmark</h1>
  <p><strong>アンカーエンジンがブックマークをスクリプトに結び付け、コードの変更にも正確に追従。AI 支援、豊富なアイコン、ローカル保存にも対応</strong></p>

  <p>
    <a href="https://github.com/realSilasYang/CodeBookmark/releases"><img src="https://img.shields.io/github/v/release/realSilasYang/CodeBookmark?style=flat-square&amp;label=version" alt="最新バージョン"></a>
    <a href="https://github.com/realSilasYang/CodeBookmark/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/realSilasYang/CodeBookmark/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI 状態"></a>
    <a href="../LICENSE"><img src="https://img.shields.io/github/license/realSilasYang/CodeBookmark?style=flat-square" alt="ライセンス"></a>
  </p>

  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#ユーザーガイド">ユーザーガイド</a> · <a href="#開発者ガイド">開発者ガイド</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">問題を報告</a></p>
</div>

CodeBookmark は、コードをブックマークで整理し、すばやく移動するための VS Code 拡張機能です。アンカーエンジンはブックマークの設定をスクリプトの識別情報と結び付け、行の追加・削除、ファイル名の変更、フォルダーの移動、ワークスペースの移設後も位置を再検出します。データは指定したローカルフォルダーに保存され、AI はコードの意味に基づくブックマーク生成、ラベル改善、確実な場合に限ったアイコン選択を支援します。

# 画面の概要

[![CodeBookmark の画面](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# 寄付

ブックマークのナビゲーションや AI 支援で時間を節約できたら、下の QR コードから作者にミルクティーを一杯ごちそうしていただけるとうれしいです。

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="WeChat Pay 支援用 QR コード"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Alipay 支援用 QR コード"></td></tr>
  </table>
</div>

# ユーザーガイド

## 1. 初期設定

最初に「CodeBookmark 設定」で `Codebookmark: Global Storage Path` を指定します。ここはすべてのブックマーク設定を保存するローカルのルートフォルダーです。ソースコードのフォルダーや一時フォルダーではなく、継続して書き込める場所を選んでください。

単一ファイルを開いた場合はそのファイルだけを表示し、フォルダーまたはワークスペースを開いた場合はファイルノード、通常のブックマーク、ファイルをまたぐレイアウトを表示します。AI を実行しない限り、ブックマークやコードが外部サービスへ送信されることはありません。

## 2. ショートカットと基本操作

| 操作 | Windows／Linux | macOS |
| --- | --- | --- |
| 現在行のブックマークを追加／削除 | `Ctrl+B` | `Cmd+B` |
| ブックマークを強制追加 | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| ブックマークを強制削除 | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

ブックマークにはラベル、行番号、コードアンカー、階層、アイコン、展開状態、安定 ID が記録されます。ノードを選ぶと、すでに開いているファイルならそのタブへ切り替え、未表示ならプレビューではない新しいタブで開きます。無効になったノードは再バインドまたは削除できます。

## 3. 階層、ドラッグ、コンテナー、並べ替え

通常のブックマークとファイルノードは、並べ替え、名前変更、アイコン変更、コンテナー化、別ノードの受け入れに対応します。ワークスペースではファイルをまたいでドラッグできますが、各スクリプトの本文データはそれぞれの設定ファイルに残ります。ファイル間の順序、親子関係、非表示、コンテナー、展開状態だけが `_workspace_layout.json` に保存されます。

複数選択したノードはまとめて移動または削除できます。ファイルノードを削除してもソースファイルは削除されません。視覚上のサブツリー削除を確定した場合、その中の通常ブックマークは所有元の設定ファイルから実際に削除されます。

## 4. 検索、インラインラベル、アイコン

検索対象はラベル、ファイル名、パス、コード内容です。エディター内のラベル表示は色、サイズ、太さ、間隔、位置を設定できます。アイコン選択画面はカテゴリ、日中両言語のあいまい検索、段階的な読み込み、最近使ったアイコンに対応し、最近の履歴は VS Code の設定同期対象です。AI は意味が明確に一致するときだけ専用アイコンを指定し、曖昧な場合は既定アイコンを使います。

## 5. TODO、FIXME、BUG の自動ブックマーク

単なる文字列検索ではありません。対象言語に VS Code の構文強調 grammar と正式なコメント規則が登録され、`TODO`、`FIXME`、`BUG` が実際のコメント先頭で指示形式になっている場合だけ作成されます。SVG 名、JSON メタデータ、文字列、説明文、Plain Text、構文強調のないファイルは対象外です。

自動ノードは安定 ID とユーザーが変更したラベル／アイコンを保持します。ワークスペース検索は最大 2,000 ファイル、未表示で 2 MiB を超えるファイルは除外、1 スクリプトあたり最大 5,000 自動マーカー、設定全体は最大 10,000 ノードです。

## 6. ファイル移動、名前変更、復旧

識別には絶対パスだけでなく、スクリプト ID、ワークスペース相対パス、内容の特徴、移動履歴、欠落状態を使います。そのため VS Code 内の名前変更、エクスプローラーでの移動、フォルダー全体の移設、単独スクリプトの移動、rename イベントを受け取れない削除後の再作成に対応します。

一時的に消えたファイルの ID はすぐには破棄されません。再出現後に候補が一意なら自動で再バインドし、候補が競合する場合は推測しません。行位置もアンカー、周辺コード、構造、距離で評価し、確証がなければ無効表示にします。

## 7. インポート、エクスポート、設定管理

「ブックマークをインポート／エクスポート」では、現在のスクリプトまたはワークスペースを 1 個の `.codebookmark` 移行可能ブックマーク設定として保存できます。別のローカルフォルダーや Windows、macOS、Linux の端末へ繰り返し取り込み、編集して再共有できます。ラベル、アイコン、階層、コードアンカー、ファイルノードの表示、ファイルをまたぐレイアウトは保持されますが、端末固有の絶対パスやファイルシステム識別子は含まれません。従来の JSON と設定フォルダーはインポート対象外です。

インポートは単一スクリプトかワークスペースかを自動判定し、相対パス、ソースのダイジェスト、ブックマーク周辺の文脈から一意の対象だけを採用します。曖昧な対象は競合として表示され、既存のブックマークがある場合は「追加」または「上書き」を選べます。Markdown、HTML、CSV、階層テキストは閲覧用で再インポートできません。「ブックマーク設定ファイルを管理」では、スクリプト設定、レイアウト、端末間の交換記録、移行ログ、競合コピー、一時残留を確認して整理できます。

## 8. AI 支援

`Codebookmark.AI: Address`、`API Key`、モデル名を設定します。Address にはリソース Endpoint、API Base URL、Chat Completions、Responses、Anthropic Messages、Gemini `generateContent`、Ollama の各 URL を入力でき、接続成功後は実際に使えたアドレスへ更新されます。リモートサービスには HTTPS を使用してください。

現在のスクリプトやワークスペース内の未作成スクリプトにブックマークを生成でき、既存のスクリプトには追加、再生成、ラベル改善を実行できます。メニューはファイル／ワークスペースの状態と既存ブックマークの有無に応じて不要な項目を隠します。

応答は JSON 構造、行番号、完全一致アンカー、数、深さ、ID 所有権、アイコン許可リストで検証されます。コードやファイル名は命令ではなく分析対象です。信頼されていないワークスペースでは AI を無効化し、タイムアウト、キャンセル、分析中の変更、上限超過時には部分結果を適用しません。

## 9. Undo、Redo、競合処理

追加、削除、名前変更、ドラッグ、並べ替え、コンテナー、アイコン、AI、インポート、一括操作は原子的な履歴になります。新しい操作は Redo 分岐を切り捨て、履歴はスコープごとに分離されます。保存はファイル単位の直列キュー、外部変更検出、原子的な置換を使い、読み取り後に外部更新されたデータを上書きしません。

保存先の変更は、コピー、検証、切り替え、旧データ削除の順で行います。Undo／Redo が参照している間は空に見えるスコープも保持されます。

## 10. 主な設定

`codebookmark.globalStoragePath` は保存先、`defaultIcon` は既定アイコン、`showLineNumber` と `showLabelInEditor` は表示、`codeMarkers.enabled` は自動マーカーを制御します。AI 関連は `AI.address`、`AI.APIKey`、`AI.model`、`AI.assignIcons` です。

# 開発者ガイド

## 1. リポジトリ構成と生成物

`src/` は TypeScript、`scripts/` はビルド・検証・統合テスト・リリース、`tests/` は単体・契約・Extension Host テスト、`resources/` は実行時資産です。`package.json`、`out/`、`package.nls*.json` は生成物で、マニフェストの正本は `BasePackage.ts` と `Commands.ts` です。

## 2. 起動とビュー状態

`extension.ts` がローカライズ、設定、リポジトリ、Provider、コマンド、ファイル購読を初期化します。表示条件は安定した Context Key に限定し、翻訳文を判定値に使いません。

## 3. モデルとツリー

`Bookmark`、`BookmarkSet`、Codec が ID、親子関係、保存形式を定義し、Provider が TreeItem へ投影します。ファイルノードも通常ノードと同じ操作契約に従います。

## 4. 永続化とスクリプト ID

各スクリプトは独立設定を持ち、`_workspace_layout.json` はファイル間レイアウトだけを保存します。データは `PersistenceSchema`、`BookmarkCodec`、移行処理で検証されます。

## 5. ファイルイベントと保存先移行

`BookmarkRepository`、`ScriptRelocationJournal`、購読処理が内部・外部の移動と再出現を扱います。保存先変更は検証済みコピーの後に切り替え、最後に旧データを消します。

## 6. 保存キューと原子的書き込み

同一設定への書き込みは直列化し、既読バージョンを比較してから一時ファイルと rename で置換します。外部競合は必ず利用者へ通知します。

## 7. コード位置の追従

完全一致アンカーを優先し、周辺内容、構造、距離で候補を評価します。一意で十分に強い候補だけを採用し、近さだけでは決めません。

## 8. Undo 設計

履歴は領域モデル全体のスナップショットです。ファイル間操作では関係するすべての設定とレイアウトを同じ原子記録に含めます。

## 9. AI プロトコルと安全性

`AIService` は URL と通信、Schema は未信頼応答、アイコンカタログは意味上の許可を担当します。プロンプトインジェクションは固定 JSON 契約を変更できず、API キーはログやエクスポートへ出しません。

## 10. 自動マーカーと言語資格

`LanguageCommentProfileRegistry` が grammar と正式なコメント設定を確認した後、`CodeMarkerScanner` が許可済みコメント token のみを走査します。言語 ID や拡張子だけでは有効化しません。

## 11. アイコンと Webview

アイコンはライセンス、HTTPS、容量、SVG 安全性、検索語を検証します。Webview は nonce、厳格な CSP、構造化メッセージ、言語非依存の安定値を使います。

## 12. ビルド、テスト、リリース

Node.js 24 を使用します。`npm run verify` はコンパイル、ESLint、単体・契約テストと開発中に成立するすべての専門検証を実行し、`npm run verify:release` は確定済みのバージョン資料を検証します。`npm run test:integration` はローカル VS Code を再利用して 13 言語と英語フォールバックを確認し、`npm run check:release` はこれらに依存監査と VSIX 内容確認を加えて一括実行します。

リリースは `main` 履歴上の注釈付きタグだけを受け付けます。GitHub Actions は OIDC の短期資格情報で Marketplace へ公開し、オンライン VSIX のハッシュを照合してから VSIX、CycloneDX SBOM、`SHA256SUMS` を含む GitHub Release を作成します。詳細は[リリースガイド](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md)を参照してください。

# Star の推移

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
