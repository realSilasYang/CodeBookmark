<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="CodeBookmark-Logo">
  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <strong>Deutsch</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>
  <h1>CodeBookmark</h1>
  <p><strong>Eine Anker-Engine hält Lesezeichen an Skripte gebunden und folgt Codeänderungen präzise – mit KI-Unterstützung, aussagekräftigen Symbolen und lokaler Speicherung</strong></p>
  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#benutzerhandbuch">Benutzerhandbuch</a> · <a href="#entwicklerhandbuch">Entwicklerhandbuch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Problem melden</a></p>
</div>

CodeBookmark ist eine VS-Code-Erweiterung zum Markieren und Navigieren von Code. Die Anker-Engine verbindet die Konfiguration mit der Identität eines Skripts und findet Lesezeichen nach Bearbeitungen, Umbenennungen, Ordner- oder Workspace-Verschiebungen wieder. Daten bleiben im gewählten lokalen Ordner. Die KI erzeugt semantische Lesezeichen, verbessert Beschriftungen und wählt nur bei eindeutiger Bedeutung ein spezielles Symbol.

# Spenden

Wenn Lesezeichen-Navigation und KI-Unterstützung Ihnen Zeit sparen, können Sie dem Autor über einen der QR-Codes unten einen Milchtee spendieren.

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="QR-Code für eine Unterstützung über WeChat Pay"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="QR-Code für eine Unterstützung über Alipay"></td></tr>
  </table>
</div>

# Benutzerhandbuch

## 1. Einrichtung und Navigation

Setze `Codebookmark: Global Storage Path` auf einen dauerhaften, beschreibbaren lokalen Ordner außerhalb von Quellcode und temporären Verzeichnissen. Eine einzelne Datei zeigt nur ihren Baum; Ordner und Workspaces zeigen Dateiknoten, normale Lesezeichen und das dateiübergreifende Layout. Ohne einen bewusst gestarteten KI-Befehl werden keine Inhalte übertragen.

`Ctrl+B`／`Cmd+B` schaltet das Lesezeichen der aktuellen Zeile um, `Ctrl+Alt+B`／`Cmd+Alt+B` erzwingt das Hinzufügen und `Ctrl+Alt+Shift+B`／`Cmd+Alt+Shift+B` das Entfernen. Gespeichert werden Beschriftung, Zeile, wortgetreuer Codeanker, Hierarchie, Symbol, Aufklappzustand und stabile ID. Ziele werden in einer vorhandenen oder neuen, nicht vorläufigen Registerkarte geöffnet.

## 2. Hierarchie, Suche und Symbole

Lesezeichen und Dateiknoten lassen sich sortieren, umbenennen, mit Symbolen versehen, als Container verwenden und dateiübergreifend verschachteln. Jede Skriptkonfiguration bleibt getrennt; `_workspace_layout.json` speichert nur Reihenfolge, Beziehungen, Sichtbarkeit, Container und Aufklappzustand. Das Löschen eines Dateiknotens löscht niemals die Quelldatei; bestätigte normale Lesezeichen im visuellen Unterbaum werden jedoch aus ihren Besitzerkonfigurationen entfernt.

Die Suche berücksichtigt Beschriftungen, Namen, Pfade und Code. Editor-Beschriftungen sind in Farbe, Größe, Gewicht, Abstand und Position anpassbar. Der Symbolwähler bietet Kategorien, unscharfe chinesische und englische Suche, Seitenladung und synchronisierbare zuletzt verwendete Symbole. Bei Unsicherheit bleibt das Standardsymbol.

## 3. Automatische TODO-, FIXME- und BUG-Lesezeichen

Dies ist keine reine Textsuche. VS Code muss für die Sprache sowohl eine Syntax-grammar als auch offizielle Kommentarregeln registrieren, und die Direktive muss am Anfang eines echten Kommentars stehen. SVG-Namen, JSON-Metadaten, Zeichenketten, Fließtext, Plain Text und Dateien ohne Syntaxhervorhebung sind ausgeschlossen. Der Workspace-Scan ist auf 2.000 Dateien begrenzt, überspringt geschlossene Dateien über 2 MiB und erlaubt 5.000 automatische Marker pro Skript sowie 10.000 Knoten pro Konfiguration.

## 4. Verschieben und Wiederherstellen

Die Identität kombiniert Skript-ID, relativen Pfad, Inhaltsmerkmale, Verschiebungsjournal und Fehlstatus. Damit werden VS-Code-Umbenennungen, externe Verschiebungen, ganze Ordner, einzelne Skripte sowie Löschen und Neuerstellen ohne rename-Ereignis abgedeckt. Automatisch gebunden wird nur bei genau einem verlässlichen Kandidaten. Für Zeilen bewertet die Engine Anker, Umgebung, Struktur und Abstand; bei fehlender Sicherheit wird der Knoten ungültig markiert.

## 5. Import, Export und Verwaltung

„Lesezeichen importieren／exportieren“ speichert das aktuelle Skript oder den Workspace als eine einzige übertragbare `.codebookmark`-Lesezeichenkonfiguration. Sie lässt sich in einen anderen lokalen Ordner oder auf Windows-, macOS- und Linux-Geräte importieren, dort bearbeiten und erneut weitergeben. Beschriftungen, Symbole, Hierarchie, Codeanker, Darstellung der Dateiknoten und das dateiübergreifende Layout bleiben erhalten; gerätespezifische absolute Pfade oder Dateisystemkennungen werden nicht gespeichert. Frühere JSON-Dateien und Konfigurationsordner werden nicht mehr importiert.

Der Import erkennt Skript- und Workspace-Pakete automatisch und bindet nur ein eindeutig bestimmtes Ziel anhand von relativem Pfad, Quelltext-Prüfsumme oder Lesezeichenkontext. Mehrdeutige Treffer werden als Konflikt gemeldet; vorhandene Lesezeichen können angehängt oder überschrieben werden. Markdown, HTML, CSV und hierarchischer Text bleiben reine Leseformate. Die Verwaltung zeigt zusätzlich geräteübergreifende Austauschstände, Layouts, Migrationen, Konfliktkopien und temporäre Reste.

## 6. KI-Unterstützung

Konfiguriere `Codebookmark.AI: Address`, `API Key` und Modell. Address akzeptiert Resource Endpoint, API Base URL, Chat Completions, Responses, Anthropic Messages, Gemini `generateContent` und Ollama; nach erfolgreichem Test wird die tatsächlich funktionierende Adresse gespeichert. Entfernte Dienste sollen HTTPS verwenden. Die KI erzeugt für das aktuelle Skript oder unmarkierte Workspace-Skripte und kann bestehende Daten ergänzen, neu erzeugen oder Beschriftungen verbessern. Unpassende Menüeinträge werden automatisch ausgeblendet.

Antworten werden auf JSON-Struktur, Zeile, wörtlichen Anker, Anzahl, Tiefe, ID-Besitz und Symbolfreigabe geprüft. Code und Dateinamen sind Daten, keine Anweisungen. In nicht vertrauenswürdigen Workspaces ist KI deaktiviert; Abbruch, Timeout, Änderungen während der Analyse oder Grenzwertüberschreitung verhindern Teilergebnisse.

## 7. Undo, Konflikte und Einstellungen

Alle Änderungen einschließlich Drag-and-drop, KI, Import und Stapelaktionen erzeugen atomare, nach Scope getrennte Einträge. Schreibvorgänge laufen je Datei seriell, erkennen externe Änderungen und ersetzen atomar. Ein Speicherwechsel kopiert und prüft zuerst, schaltet dann um und räumt erst danach migrierte Altdaten auf. Wichtige Schlüssel sind `globalStoragePath`, `defaultIcon`, `showLineNumber`, `showLabelInEditor`, `codeMarkers.enabled` sowie `AI.address`, `AI.APIKey`, `AI.model` und `AI.assignIcons`.

# Entwicklerhandbuch

## 1. Architektur und Persistenz

`src/` enthält TypeScript, `scripts/` Build-, Prüf-, Integrations- und Release-Werkzeuge, `tests/` Unit-, Vertrags- und Extension-Host-Tests, `resources/` Laufzeitressourcen. `package.json`, `out/` und `package.nls*.json` werden erzeugt; `BasePackage.ts` und `Commands.ts` sind die Manifestquelle. `extension.ts` initialisiert Lokalisierung, Konfiguration, Repository, Provider, Befehle und Abonnements. Sichtbarkeit verwendet stabile Context Keys, nie Übersetzungen.

`Bookmark`, `BookmarkSet` und Codecs definieren Identitäten und Hierarchien. Jedes Skript behält seine Konfiguration; `_workspace_layout.json` enthält nur das dateiübergreifende Layout. `PersistenceSchema` und Migrationen validieren Daten. `BookmarkRepository` und `ScriptRelocationJournal` behandeln Verschiebungen. Schreibvorgänge sind serialisiert und verwenden temporäre Dateien; die Anker-Engine akzeptiert nur einen eindeutigen starken Positionskandidaten. Undo speichert vollständige Domänenschnappschüsse.

## 2. KI, Marker, Webview und Veröffentlichung

`AIService` verarbeitet Adressen und Transport, Schemas prüfen nicht vertrauenswürdige Antworten, der Katalog autorisiert Symbole semantisch. Automarker benötigen grammar und Kommentarregeln. Webviews verwenden nonce, strikte CSP und strukturierte Nachrichten.

Das Projekt verwendet Node.js 24. `npm run verify` führt Kompilierung, ESLint, Unit-, Vertrags- und alle entwicklungsgeeigneten Spezialprüfungen aus; `npm run verify:release` prüft die finalisierten Versions- und Veröffentlichungsunterlagen. `npm run test:integration` testet den installierten VS Code isoliert in 13 Sprachen samt englischem Fallback; `npm run check:release` verbindet alle Prüfungen mit Audit und VSIX-Liste. Nur annotierte Tags aus `main` werden veröffentlicht. GitHub Actions nutzt kurzlebige OIDC-Anmeldedaten, gleicht den Marketplace-VSIX-Hash ab und erstellt eine Release mit VSIX, CycloneDX SBOM und `SHA256SUMS`. Siehe [Veröffentlichungsleitfaden](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md).

# Star-Verlauf

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
