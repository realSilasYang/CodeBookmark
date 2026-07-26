<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="Biểu trưng CodeBookmark">

  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <strong>Tiếng Việt</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>CodeBookmark</h1>
  <p><strong>Công cụ neo giữ dấu trang gắn với tệp lệnh và bám chính xác theo mã nguồn, kèm trợ lý AI, thư viện biểu tượng phong phú và lưu trữ cục bộ</strong></p>

  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#hướng-dẫn-sử-dụng">Hướng dẫn sử dụng</a> · <a href="#hướng-dẫn-dành-cho-nhà-phát-triển">Hướng dẫn phát triển</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Báo lỗi</a></p>
</div>

CodeBookmark là tiện ích VS Code để đánh dấu và điều hướng mã nguồn. Công cụ neo liên kết cấu hình dấu trang với danh tính của tệp lệnh, nhờ đó vẫn tìm lại đúng vị trí sau khi thêm hoặc xóa mã, đổi tên tệp, di chuyển thư mục hay chuyển cả workspace. Dữ liệu được lưu trong thư mục cục bộ do bạn chọn. AI có thể tạo dấu trang theo ngữ nghĩa, cải thiện nhãn và chỉ chọn biểu tượng khi mức độ phù hợp đủ rõ ràng.

# Tổng quan giao diện

[![Giao diện CodeBookmark](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# Ủng hộ

Nếu tính năng điều hướng dấu trang và hỗ trợ AI giúp bạn tiết kiệm thời gian, bạn có thể dùng một trong hai mã QR bên dưới để mời tác giả một ly trà sữa!

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="Mã QR ủng hộ qua WeChat Pay"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Mã QR ủng hộ qua Alipay"></td></tr>
  </table>
</div>

# Hướng dẫn sử dụng

## 1. Thiết lập lần đầu

Mở phần cài đặt CodeBookmark và đặt `Codebookmark: Global Storage Path`. Đây là thư mục gốc chứa mọi cấu hình dấu trang; nên dùng một thư mục cục bộ ổn định, có quyền ghi, không phải thư mục mã nguồn hoặc thư mục tạm.

Khi chỉ mở một tệp, cây chỉ hiển thị dấu trang của tệp đó. Khi mở thư mục hoặc workspace, cây hiển thị các nút tệp, dấu trang thường và bố cục liên tệp. CodeBookmark không tự tải dữ liệu lên máy chủ; mã chỉ được gửi tới endpoint AI mà bạn cấu hình khi chủ động chạy lệnh AI.

## 2. Phím tắt và thao tác cơ bản

| Thao tác | Windows／Linux | macOS |
| --- | --- | --- |
| Thêm hoặc xóa dấu trang tại dòng hiện tại | `Ctrl+B` | `Cmd+B` |
| Buộc thêm dấu trang | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| Buộc xóa dấu trang | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

Mỗi dấu trang lưu nhãn, số dòng, neo mã nguồn, cấp bậc, biểu tượng, trạng thái mở rộng và định danh ổn định. Khi nhấp vào nút, tệp đã mở sẽ được chuyển tới; tệp chưa mở sẽ xuất hiện trong tab không phải preview. Nút mất hiệu lực có thể được liên kết lại hoặc dọn dẹp.

## 3. Cấp bậc, kéo thả, vùng chứa và sắp xếp

Cả nút tệp lẫn dấu trang đều có thể sắp xếp, đổi tên, đổi biểu tượng, làm vùng chứa hoặc nhận các nút khác. Kéo thả liên tệp chỉ thay đổi bố cục workspace: nội dung dấu trang của từng tệp vẫn nằm trong cấu hình riêng, còn thứ tự, quan hệ cha con, trạng thái ẩn, vùng chứa và mở rộng được ghi vào `_workspace_layout.json`.

Có thể chọn nhiều nút để di chuyển hoặc xóa cùng lúc. Xóa nút tệp không bao giờ xóa tệp mã nguồn. Nếu xác nhận xóa cả cây con đang hiển thị, các dấu trang thường bên trong sẽ thực sự bị xóa khỏi cấu hình của tệp sở hữu.

## 4. Tìm kiếm, nhãn trong trình soạn thảo và biểu tượng

Tìm kiếm xét nhãn, tên tệp, đường dẫn và nội dung mã. Nhãn trong trình soạn thảo có thể tùy chỉnh màu, cỡ chữ, độ đậm, khoảng cách và vị trí. Bộ chọn biểu tượng có phân loại, tìm kiếm mờ bằng tiếng Trung và tiếng Anh, tải theo trang và danh sách dùng gần đây; lịch sử gần đây có thể đồng bộ qua VS Code Settings Sync. AI sẽ dùng biểu tượng mặc định nếu ngữ nghĩa không đủ chắc chắn.

## 5. Dấu trang tự động TODO, FIXME và BUG

Tính năng này không tìm chuỗi một cách máy móc. Ngôn ngữ phải có cả grammar tô sáng cú pháp và quy tắc chú thích chính thức do VS Code đăng ký; `TODO`, `FIXME` hoặc `BUG` phải nằm ở đầu một chú thích thật và có cấu trúc chỉ thị rõ ràng. Tên tệp SVG, metadata JSON, chuỗi ký tự, văn bản thường, Plain Text hoặc tệp không có tô sáng cú pháp sẽ không bị nhận nhầm.

Nút tự động giữ định danh ổn định cùng nhãn và biểu tượng mà người dùng đã chỉnh. Quét workspace tối đa 2.000 tệp, bỏ qua tệp chưa mở lớn hơn 2 MiB; mỗi tệp có tối đa 5.000 marker tự động và toàn bộ cấu hình tối đa 10.000 nút.

## 6. Di chuyển, đổi tên và khôi phục tệp

CodeBookmark kết hợp định danh tệp lệnh, đường dẫn tương đối trong workspace, đặc trưng nội dung, nhật ký di chuyển và trạng thái mất tệp thay vì chỉ dựa vào đường dẫn tuyệt đối. Vì vậy hệ thống xử lý được đổi tên trong VS Code, di chuyển ngoài trình soạn thảo, chuyển cả thư mục, chuyển một tệp riêng lẻ và cả tình huống xóa rồi tạo lại khi không nhận được sự kiện rename.

Tệp tạm biến mất vẫn giữ khả năng khôi phục. Khi xuất hiện lại, hệ thống chỉ tự liên kết nếu có đúng một ứng viên đáng tin cậy; trường hợp mơ hồ sẽ không đoán. Vị trí mã được đánh giá bằng neo chính xác, nội dung lân cận, cấu trúc và khoảng cách; thiếu bằng chứng thì dấu trang được đánh dấu mất hiệu lực.

## 7. Nhập, xuất và quản lý cấu hình

Mục “Nhập／xuất dấu trang” lưu script hiện tại hoặc toàn bộ workspace thành một cấu hình dấu trang di động `.codebookmark`. Bạn có thể nhập tệp này vào thư mục khác trên máy hoặc trên thiết bị Windows, macOS và Linux, tiếp tục chỉnh sửa rồi chia sẻ lại. Gói giữ nguyên nhãn, biểu tượng, phân cấp, neo mã nguồn, cách hiển thị nút tệp và bố cục xuyên tệp, nhưng không chứa đường dẫn tuyệt đối hay định danh hệ thống tệp của máy. JSON và thư mục cấu hình kiểu cũ không còn là định dạng nhập.

Khi nhập, CodeBookmark tự nhận biết gói dành cho một script hay workspace và chỉ liên kết khi tìm được đúng một đích đáng tin cậy bằng đường dẫn tương đối, dấu vân tay nội dung hoặc ngữ cảnh dấu trang. Trường hợp mơ hồ được báo là xung đột; nếu đích đã có dấu trang, bạn có thể chọn nối thêm hoặc ghi đè. Markdown, HTML, CSV và văn bản phân cấp chỉ để đọc. Trang quản lý còn hiển thị bản ghi trao đổi giữa thiết bị, bố cục, nhật ký di chuyển, bản sao xung đột và phần dư tạm để kiểm tra hoặc dọn dẹp.

## 8. Trợ lý AI

Điền `Codebookmark.AI: Address`, `API Key` và tên mô hình. Address chấp nhận Resource Endpoint, API Base URL, Chat Completions URL, Responses URL, Anthropic Messages URL, Gemini `generateContent` URL hoặc địa chỉ Ollama; sau khi kiểm tra thành công, ô nhập được cập nhật thành địa chỉ thực sự hoạt động. Dịch vụ từ xa nên dùng HTTPS.

AI có thể tạo dấu trang cho tệp hiện tại hoặc mọi tệp chưa có dấu trang trong workspace; với tệp đã có dữ liệu, AI có thể bổ sung, tạo lại hoặc tối ưu nhãn. Menu tự ẩn những lựa chọn không phù hợp dựa trên trạng thái tệp, workspace và dữ liệu hiện có.

Phản hồi phải vượt qua kiểm tra cấu trúc JSON, số dòng, neo khớp nguyên văn, số lượng, độ sâu, quyền sở hữu ID và danh sách biểu tượng cho phép. Mã nguồn và tên tệp chỉ là dữ liệu, không phải chỉ thị. AI bị tắt trong workspace không đáng tin cậy; timeout, hủy, tệp thay đổi giữa lúc phân tích hoặc phản hồi vượt giới hạn đều không áp dụng kết quả dở dang.

## 9. Hoàn tác, làm lại và xung đột

Thêm, xóa, đổi tên, kéo thả, sắp xếp, vùng chứa, biểu tượng, kết quả AI, nhập và thao tác hàng loạt đều tạo bản ghi nguyên tử. Thao tác mới cắt nhánh làm lại; lịch sử được tách theo scope và có giới hạn dung lượng. Ghi tệp dùng hàng đợi tuần tự, kiểm tra thay đổi bên ngoài và thay thế nguyên tử, vì vậy phiên bản đã bị chương trình khác sửa sẽ không bị ghi đè âm thầm.

Khi đổi thư mục lưu trữ, dữ liệu được sao chép và xác minh trước, sau đó mới chuyển sang nơi mới và dọn các tệp đã di chuyển ở nơi cũ.

## 10. Cài đặt chính

`codebookmark.globalStoragePath` chọn nơi lưu; `defaultIcon` chọn biểu tượng mặc định; `showLineNumber` và `showLabelInEditor` điều khiển hiển thị; `codeMarkers.enabled` bật marker tự động. Nhóm AI gồm `AI.address`, `AI.APIKey`, `AI.model` và `AI.assignIcons`.

# Hướng dẫn dành cho nhà phát triển

## 1. Cấu trúc kho mã và ranh giới sinh tự động

`src/` chứa TypeScript, `scripts/` chứa công cụ build, kiểm tra, integration và phát hành, `tests/` chứa unit, contract và Extension Host test, còn `resources/` chứa tài nguyên chạy thật. `package.json`, `out/` và `package.nls*.json` là đầu ra sinh tự động; nguồn chuẩn của manifest là `BasePackage.ts` và `Commands.ts`.

## 2. Kích hoạt và trạng thái giao diện

`extension.ts` khởi tạo bản địa hóa, cấu hình, repository, provider, command và đăng ký sự kiện tệp. Mọi điều kiện hiển thị dùng Context Key ổn định, không dùng chuỗi đã dịch để quyết định logic.

## 3. Mô hình, cây và lưu trữ

`Bookmark`, `BookmarkSet` và codec định nghĩa ID, quan hệ cha con và định dạng bền vững. Mỗi tệp lệnh có cấu hình riêng; `_workspace_layout.json` chỉ giữ bố cục liên tệp. `PersistenceSchema`, `BookmarkCodec` và migration kiểm tra mọi dữ liệu đọc vào.

## 4. Sự kiện tệp, ghi nguyên tử và bám vị trí

`BookmarkRepository`, `ScriptRelocationJournal` cùng subscriber xử lý di chuyển và tái xuất hiện. Ghi cùng một cấu hình luôn được tuần tự hóa, so phiên bản đã đọc và thay thế qua tệp tạm. Công cụ neo chỉ nhận một ứng viên có bằng chứng duy nhất, không ghép cưỡng ép theo dòng gần nhất.

## 5. Undo và thao tác liên tệp

Undo dùng snapshot miền hoàn chỉnh. Một thao tác liên tệp phải đưa tất cả cấu hình bị ảnh hưởng và bố cục workspace vào cùng một bản ghi nguyên tử để không thể hoàn tác nửa chừng.

## 6. AI, marker, biểu tượng và Webview

`AIService` xử lý địa chỉ và truyền tải; schema kiểm tra phản hồi không đáng tin; catalog biểu tượng cấp quyền theo ngữ nghĩa. `LanguageCommentProfileRegistry` xác nhận grammar và quy tắc chú thích trước khi scanner chạy. Tài nguyên biểu tượng được kiểm tra giấy phép, HTTPS, kích thước và an toàn SVG. Webview dùng nonce, CSP nghiêm ngặt và thông điệp có cấu trúc.

## 7. Build, kiểm thử và phát hành

Dùng Node.js 24. `npm run verify` chạy biên dịch, ESLint, unit test, contract test và mọi kiểm tra chuyên biệt có hiệu lực trong giai đoạn phát triển; `npm run verify:release` kiểm tra các tài liệu phiên bản đã hoàn tất. `npm run test:integration` tái sử dụng VS Code đã cài, cách ly dữ liệu người dùng và kiểm tra 13 ngôn ngữ cùng cơ chế dự phòng tiếng Anh. `npm run check:release` kết hợp toàn bộ các bước này với audit phụ thuộc và kiểm tra nội dung VSIX.

Chỉ tag có chú thích thuộc lịch sử `main` mới được phát hành. GitHub Actions dùng thông tin xác thực OIDC ngắn hạn để đăng Marketplace, so khớp hash của VSIX trực tuyến, rồi tạo GitHub Release có VSIX, CycloneDX SBOM và `SHA256SUMS`. Xem [hướng dẫn phát hành](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md).

# Lịch sử Star

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
