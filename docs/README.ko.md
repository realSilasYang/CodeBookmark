<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark 로고">

  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <strong>한국어</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>

  <h1>CodeBookmark</h1>
  <p><strong>앵커 엔진이 북마크를 스크립트에 계속 연결하고 코드 변경을 정확히 따라갑니다. AI 지원, 다양한 아이콘, 로컬 저장도 함께 제공합니다</strong></p>

  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#사용자-안내서">사용자 안내서</a> · <a href="#개발자-안내서">개발자 안내서</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">문제 신고</a></p>
</div>

CodeBookmark는 코드에 북마크를 붙이고 빠르게 이동하기 위한 VS Code 확장입니다. 핵심 앵커 엔진은 북마크 설정을 스크립트의 정체성과 연결하므로 코드가 늘거나 줄고, 파일 이름이 바뀌고, 폴더나 워크스페이스가 이동해도 올바른 위치를 다시 찾습니다. 데이터는 사용자가 지정한 로컬 폴더에만 저장됩니다. AI는 코드 의미를 바탕으로 북마크를 만들고 라벨을 다듬으며, 의미가 분명할 때만 전용 아이콘을 선택합니다.

# 화면 개요

[![CodeBookmark 화면](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# 프로젝트 후원

CodeBookmark로 코드 북마크와 AI 지원을 활용해 시간을 절약했다면 아래 QR 코드로 개발자를 후원해 주세요. 후원 방법을 선택해 주세요:

<p align="center">
  <img src="../resources/donate/wechat-pay.png" width="220" alt="WeChat Pay 후원 QR 코드">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="../resources/donate/alipay.png" width="220" alt="Alipay 후원 QR 코드">
</p>

# 사용자 안내서

## 1. 처음 설정하기

먼저 CodeBookmark 설정에서 `Codebookmark: Global Storage Path`를 지정합니다. 모든 북마크 설정을 보관하는 로컬 루트 폴더이므로 쓰기 권한이 있고 계속 유지되는 위치를 선택하고, 소스 폴더나 임시 폴더는 피하십시오.

파일 하나만 열면 해당 파일의 북마크만 보입니다. 폴더나 워크스페이스를 열면 파일 노드, 일반 북마크, 파일 간 배치가 함께 표시됩니다. AI 명령을 직접 실행하지 않는 한 북마크와 코드는 외부 서비스로 전송되지 않습니다.

## 2. 단축키와 기본 동작

| 동작 | Windows／Linux | macOS |
| --- | --- | --- |
| 현재 줄의 북마크 추가／제거 | `Ctrl+B` | `Cmd+B` |
| 북마크 강제 추가 | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| 북마크 강제 제거 | `Ctrl+Alt+Shift+B` | `Cmd+Alt+Shift+B` |

북마크에는 라벨, 줄 번호, 코드 앵커, 계층, 아이콘, 펼침 상태, 안정 ID가 저장됩니다. 노드를 누르면 이미 열린 대상 파일로 전환하고, 열려 있지 않으면 현재 탭을 덮어쓰지 않는 새 탭으로 엽니다. 위치를 잃은 노드는 다시 연결하거나 정리할 수 있습니다.

## 3. 계층, 끌어놓기, 컨테이너와 정렬

일반 북마크와 파일 노드는 모두 정렬, 이름 변경, 아이콘 변경, 컨테이너 지정, 다른 노드 수용을 지원합니다. 파일 간 끌어놓기는 워크스페이스의 시각적 구조만 바꿉니다. 각 스크립트의 북마크 본문은 독립 설정 파일에 남고, 파일 간 순서·부모 자식 관계·숨김·컨테이너·펼침 상태만 `_workspace_layout.json`에 저장됩니다.

여러 노드를 선택해 함께 이동하거나 삭제할 수 있습니다. 파일 노드를 삭제해도 소스 파일은 절대 삭제되지 않습니다. 표시된 하위 트리 전체 삭제를 확인하면 그 안의 일반 북마크는 각 소유 스크립트 설정에서 실제로 제거됩니다.

## 4. 검색, 인라인 라벨과 아이콘

검색은 라벨, 파일 이름, 경로, 코드 내용을 모두 봅니다. 편집기 라벨은 색상, 크기, 굵기, 간격, 위치를 설정할 수 있습니다. 아이콘 선택기는 분류, 중국어·영어 퍼지 검색, 페이지 단위 로딩, 최근 사용 목록을 제공하며 최근 목록은 VS Code 설정 동기화 대상입니다. AI는 라벨 의미가 충분히 명확할 때만 전용 아이콘을 지정하고, 애매하면 기본 아이콘을 유지합니다.

## 5. TODO, FIXME, BUG 자동 북마크

단순 문자열 검색이 아닙니다. VS Code가 해당 언어의 구문 강조 grammar와 공식 주석 규칙을 모두 등록했고, `TODO`, `FIXME`, `BUG`가 실제 주석의 시작 부분에서 명확한 지시 형식을 이룰 때만 생성됩니다. SVG 파일 이름, JSON 메타데이터, 문자열, 설명문, Plain Text, 구문 강조가 없는 파일은 오인하지 않습니다.

자동 노드는 안정 ID와 사용자가 바꾼 라벨·아이콘을 유지합니다. 워크스페이스 탐색은 최대 2,000개 파일을 찾고, 열리지 않은 2 MiB 초과 파일은 건너뜁니다. 스크립트마다 자동 마커는 최대 5,000개, 전체 설정은 최대 10,000개 노드입니다.

## 6. 파일 이동, 이름 변경과 복구

절대 경로만 보지 않고 스크립트 ID, 워크스페이스 상대 경로, 내용 특징, 이동 기록, 누락 상태를 함께 사용합니다. 따라서 VS Code 이름 변경, 파일 탐색기 이동, 폴더 전체 이동, 단일 스크립트 이동, rename 이벤트 없이 삭제 후 다시 만들어지는 경우를 처리합니다.

파일이 잠시 사라져도 정체성을 즉시 버리지 않습니다. 다시 나타났을 때 신뢰할 수 있는 후보가 하나뿐이면 자동으로 연결하고, 여러 후보가 비슷하면 추측하지 않습니다. 코드 위치도 정확한 앵커, 주변 내용, 구조, 거리를 평가하며 증거가 부족하면 잘못 이동하는 대신 무효 상태로 표시합니다.

## 7. 가져오기, 내보내기와 설정 관리

“북마크 가져오기／내보내기”에서 현재 스크립트나 워크스페이스를 하나의 `.codebookmark` 이식 가능한 북마크 설정으로 저장할 수 있습니다. 다른 로컬 폴더 또는 Windows, macOS, Linux 기기에서 반복해서 가져오고 수정한 뒤 다시 공유할 수 있습니다. 레이블, 아이콘, 계층, 코드 앵커, 파일 노드 표시와 파일 간 배치는 보존하지만 기기 고유의 절대 경로나 파일 시스템 식별자는 포함하지 않습니다. 이전 JSON과 구성 폴더는 더 이상 가져오기 형식이 아닙니다.

가져오기는 단일 스크립트와 워크스페이스를 자동 판별하고 상대 경로, 소스 다이제스트, 북마크 문맥으로 유일하게 확인되는 대상만 연결합니다. 모호한 대상은 충돌로 알리며, 기존 북마크가 있으면 추가 또는 덮어쓰기를 선택합니다. Markdown, HTML, CSV와 계층형 텍스트는 읽기용이라 다시 가져올 수 없습니다. “북마크 설정 파일 관리”에서는 스크립트 설정, 배치, 기기 간 교환 기록, 저장소 이동 기록, 충돌 사본과 임시 잔여물을 확인하고 정리할 수 있습니다.

## 8. AI 지원

`Codebookmark.AI: Address`, `API Key`, 모델 이름을 입력합니다. Address에는 Resource Endpoint, API Base URL, Chat Completions URL, Responses URL, Anthropic Messages URL, Gemini `generateContent` URL, Ollama 주소를 넣을 수 있습니다. 연결에 성공하면 실제로 동작한 주소로 입력값을 갱신합니다. 원격 서비스에는 HTTPS를 사용하십시오.

현재 스크립트나 워크스페이스 안의 북마크 없는 스크립트에 새 북마크를 만들 수 있고, 기존 북마크가 있는 스크립트에는 추가·재생성·라벨 최적화를 실행할 수 있습니다. 메뉴는 열린 파일, 워크스페이스 여부와 기존 데이터에 맞춰 의미 없는 항목과 불필요한 단계를 자동으로 숨깁니다.

응답은 JSON 구조, 줄 번호, 원문 그대로의 앵커, 개수, 깊이, ID 소유권, 아이콘 허용 목록으로 검증합니다. 코드와 파일 이름은 분석 데이터일 뿐 지시문이 아닙니다. 신뢰하지 않은 워크스페이스에서는 AI가 꺼지며, 시간 초과·취소·분석 중 파일 변경·한도 초과 때는 일부 결과도 적용하지 않습니다.

## 9. 실행 취소, 다시 실행과 충돌 처리

추가, 삭제, 이름 변경, 끌어놓기, 정렬, 컨테이너, 아이콘, AI 결과, 가져오기, 일괄 작업은 모두 원자적 기록을 만듭니다. 새 작업은 다시 실행 분기를 끊고 기록은 scope별로 분리됩니다. 저장은 파일별 직렬 큐, 외부 변경 확인, 원자적 교체를 사용해 다른 프로그램이 수정한 버전을 조용히 덮어쓰지 않습니다.

저장 위치 변경은 복사와 검증을 먼저 마친 다음 전환하고, 성공한 뒤 이전 위치의 이동 완료 파일을 정리합니다. 실행 취소／다시 실행 기록이 참조하는 scope는 비어 보여도 유지합니다.

## 10. 주요 설정

`codebookmark.globalStoragePath`는 저장 위치, `defaultIcon`은 기본 아이콘, `showLineNumber`와 `showLabelInEditor`는 표시, `codeMarkers.enabled`는 자동 마커를 제어합니다. AI 그룹은 `AI.address`, `AI.APIKey`, `AI.model`, `AI.assignIcons`입니다.

# 개발자 안내서

## 1. 저장소 구조와 생성 경계

`src/`에는 TypeScript, `scripts/`에는 빌드·검증·통합 테스트·배포 도구, `tests/`에는 단위·계약·Extension Host 테스트, `resources/`에는 런타임 자산이 있습니다. `package.json`, `out/`, `package.nls*.json`은 생성 결과이며 manifest 원본은 `BasePackage.ts`와 `Commands.ts`입니다.

## 2. 활성화와 뷰 상태

`extension.ts`는 지역화, 설정, 저장소, Provider, 명령, 파일 구독을 초기화합니다. 표시 조건은 안정적인 Context Key만 사용하며 번역된 문구가 로직에 들어가지 않습니다.

## 3. 모델, 트리와 지속성

`Bookmark`, `BookmarkSet`, Codec이 ID, 부모 자식 관계, 저장 형식을 정의하고 Provider가 TreeItem으로 투영합니다. 각 스크립트는 독립 설정을 가지며 `_workspace_layout.json`은 파일 간 배치만 저장합니다. `PersistenceSchema`와 migration이 읽는 데이터를 검증합니다.

## 4. 파일 이벤트, 원자적 저장과 위치 추적

`BookmarkRepository`, `ScriptRelocationJournal`, subscriber가 내부·외부 이동과 재등장을 처리합니다. 동일 파일 쓰기는 직렬화하고 읽은 버전을 비교한 뒤 임시 파일과 rename으로 교체합니다. 앵커 엔진은 유일하고 충분히 강한 후보만 채택합니다.

## 5. Undo와 파일 간 작업

Undo 단위는 완전한 도메인 스냅샷입니다. 파일 간 작업은 영향을 받은 모든 스크립트 설정과 워크스페이스 배치를 하나의 원자적 기록에 포함해야 합니다.

## 6. AI, 자동 마커, 아이콘과 Webview

`AIService`는 주소와 전송, schema는 신뢰하지 않은 응답, 아이콘 카탈로그는 의미 허용을 담당합니다. `LanguageCommentProfileRegistry`가 grammar와 공식 주석 규칙을 확인한 뒤 scanner가 실행됩니다. 아이콘은 라이선스, HTTPS, 크기, SVG 안전성을 검사하며 Webview는 nonce, 엄격한 CSP, 구조화 메시지를 사용합니다.

## 7. 빌드, 테스트와 배포

Node.js 24를 사용합니다. `npm run verify`는 컴파일, ESLint, 단위·계약 테스트와 개발 단계에서 유효한 모든 전문 검증을 실행하고, `npm run verify:release`는 확정된 버전 자료를 검사합니다. `npm run test:integration`은 설치된 VS Code를 격리 환경에서 재사용해 13개 언어와 영어 폴백을 검사합니다. `npm run check:release`는 이 모든 검증에 의존성 감사와 VSIX 목록 확인을 더해 실행합니다.

`main` 기록에 속한 주석 태그만 배포할 수 있습니다. GitHub Actions는 OIDC 단기 자격 증명으로 Marketplace에 게시하고 온라인 VSIX 해시를 확인한 뒤 VSIX만 포함하는 GitHub Release를 만들며, SBOM이나 `SHA256SUMS`는 더 이상 제공하지 않습니다. 자세한 내용은 [배포 안내서](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md)를 참조하십시오.

# Star 기록

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
