<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="Logo di CodeBookmark">
  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <strong>Italiano</strong></p>
  <h1>CodeBookmark</h1>
  <p><strong>Un motore di ancoraggio mantiene i segnalibri legati agli script e segue il codice con precisione, con assistenza IA, icone espressive e salvataggio locale</strong></p>
  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#guida-utente">Guida utente</a> · <a href="#guida-per-sviluppatori">Guida per sviluppatori</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Segnala un problema</a></p>
</div>

CodeBookmark è un’estensione di VS Code per contrassegnare e navigare il codice. Il motore di ancoraggio collega la configurazione all’identità dello script e ritrova i segnalibri dopo modifiche, rinomine, spostamenti di cartelle o trasferimenti del workspace. I dati restano nella cartella locale scelta dall’utente. L’IA può generare segnalibri dal significato del codice, migliorare le etichette e scegliere un’icona solo quando la corrispondenza è chiara.

# Donazioni

Se la navigazione tra i segnalibri e l’assistenza IA ti fanno risparmiare tempo, puoi aiutare l’autore a uscire dalla povertà con uno dei metodi seguenti (≥Д≤).

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="Codice QR per sostenere il progetto con WeChat Pay"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Codice QR per sostenere il progetto con Alipay"></td></tr>
  </table>
</div>

# Guida utente

## 1. Configurazione e navigazione

Imposta `Codebookmark: Global Storage Path` su una cartella locale stabile e scrivibile, separata dai sorgenti e dalle directory temporanee. Con un solo file aperto appare soltanto il suo albero; in una cartella o workspace compaiono nodi file, segnalibri normali e layout tra file. Nessun contenuto viene inviato all’esterno, salvo il codice selezionato quando avvii esplicitamente un comando IA.

`Ctrl+B`／`Cmd+B` aggiunge o rimuove il segnalibro della riga corrente; `Ctrl+Alt+B`／`Cmd+Alt+B` forza l’aggiunta e `Ctrl+Alt+Shift+B`／`Cmd+Alt+Shift+B` la rimozione. Ogni nodo conserva etichetta, riga, ancora letterale, gerarchia, icona, espansione e ID stabile. La navigazione usa una scheda già aperta oppure apre una nuova scheda non provvisoria.

## 2. Gerarchia, ricerca e icone

Segnalibri e nodi file possono essere ordinati, rinominati, personalizzati, usati come contenitori e annidati tra file. Ogni script mantiene la propria configurazione; `_workspace_layout.json` registra solo ordine, relazioni, visibilità, contenitori ed espansione. Eliminare un nodo file non elimina mai il sorgente; dopo la conferma, i segnalibri normali del sottoalbero visivo vengono invece rimossi dalle configurazioni proprietarie.

La ricerca considera etichette, nomi, percorsi e codice. Le etichette nell’editor permettono di regolare colore, dimensione, peso, spaziatura e posizione. Il selettore di icone offre categorie, ricerca approssimata cinese e inglese, pagine e recenti sincronizzabili da VS Code. In caso di dubbio, l’IA mantiene l’icona predefinita.

## 3. Segnalibri automatici TODO, FIXME e BUG

Non è una semplice ricerca testuale. VS Code deve registrare per il linguaggio sia una grammar di evidenziazione sia regole ufficiali dei commenti, e la direttiva deve iniziare un vero commento. Nomi SVG, metadati JSON, stringhe, prosa, Plain Text e file senza evidenziazione sono esclusi. La scansione trova al massimo 2.000 file, ignora quelli chiusi oltre 2 MiB e limita ogni script a 5.000 marker automatici e ogni configurazione a 10.000 nodi.

## 4. Spostamento e recupero

L’identità combina ID dello script, percorso relativo, caratteristiche del contenuto, diario degli spostamenti e stato di assenza. Sono coperti rinomine in VS Code, spostamenti esterni, intere cartelle, singoli script e cancellazione seguita da ricreazione senza evento rename. Il ricollegamento automatico richiede un unico candidato affidabile. Per la riga si confrontano ancora, contesto, struttura e distanza; senza prove il nodo viene dichiarato non valido.

## 5. Importazione, esportazione e gestione

“Importa／esporta segnalibri” salva lo script corrente o il workspace in un’unica configurazione portatile dei segnalibri `.codebookmark`. Il file può essere importato in un’altra cartella locale o su dispositivi Windows, macOS e Linux, modificato e condiviso di nuovo senza perdere etichette, icone, gerarchia, ancore del codice, aspetto dei nodi file o layout tra file. Non contiene percorsi assoluti né identità del file system; i vecchi JSON e le cartelle di configurazione non sono più formati di importazione.

L’importazione riconosce automaticamente un pacchetto per script o workspace e collega soltanto una destinazione univoca, usando percorso relativo, impronta del sorgente o contesto dei segnalibri. Le corrispondenze ambigue vengono segnalate come conflitti; se esistono già segnalibri, puoi scegliere Aggiungi o Sovrascrivi. Markdown, HTML, CSV e testo gerarchico restano formati di sola lettura. Il gestore mostra anche gli stati di scambio tra dispositivi, i layout, le migrazioni, le copie in conflitto e i residui temporanei.

## 6. Assistenza IA

Configura `Codebookmark.AI: Address`, `API Key` e modello. Address accetta Resource Endpoint, API Base URL, Chat Completions, Responses, Anthropic Messages, Gemini `generateContent` e Ollama; dopo un test riuscito salva l’indirizzo realmente funzionante. I servizi remoti devono usare HTTPS. L’IA genera per lo script corrente o per gli script senza segnalibri del workspace e può aggiungere, rigenerare o migliorare le etichette esistenti. Il menu nasconde automaticamente le azioni non applicabili.

Ogni risposta viene verificata per struttura JSON, riga, ancora letterale, quantità, profondità, proprietà degli ID e lista di icone. Codice e nomi sono dati, non istruzioni. L’IA è disabilitata nei workspace non attendibili; annullamento, timeout, modifica durante l’analisi o superamento dei limiti impediscono risultati parziali.

## 7. Annullamento, conflitti e impostazioni

Creazione, eliminazione, rinomina, trascinamento, ordinamento, contenitori, icone, IA, importazione e operazioni in serie producono record atomici separati per scope. Le scritture usano una coda per file, rilevano modifiche esterne e sostituiscono atomicamente. Il cambio di archivio copia e verifica prima, passa alla nuova posizione e soltanto dopo pulisce i vecchi file migrati. Le chiavi principali sono `globalStoragePath`, `defaultIcon`, `showLineNumber`, `showLabelInEditor`, `codeMarkers.enabled`, `AI.address`, `AI.APIKey`, `AI.model` e `AI.assignIcons`.

# Guida per sviluppatori

## 1. Architettura e persistenza

`src/` contiene TypeScript, `scripts/` strumenti di build, verifica, integrazione e pubblicazione, `tests/` test unitari, contrattuali ed Extension Host, `resources/` risorse runtime. `package.json`, `out/` e `package.nls*.json` sono generati; `BasePackage.ts` e `Commands.ts` sono la fonte del manifest. `extension.ts` inizializza localizzazione, configurazione, repository, Provider, comandi e sottoscrizioni. La visibilità usa Context Key stabili, mai testi tradotti.

`Bookmark`, `BookmarkSet` e codec definiscono identità e gerarchie. Ogni script conserva la propria configurazione; `_workspace_layout.json` contiene solo il layout tra file. `PersistenceSchema` e migrazioni validano i dati. `BookmarkRepository` e `ScriptRelocationJournal` gestiscono gli spostamenti. Le scritture sono serializzate e usano file temporanei; il motore accetta soltanto un candidato di posizione unico e forte. L’annullamento salva snapshot completi del dominio.

## 2. IA, marker, Webview e pubblicazione

`AIService` gestisce indirizzi e trasporto, gli schema controllano risposte non attendibili, il catalogo autorizza semanticamente le icone. I marker automatici richiedono grammar e regole di commento. Le Webview usano nonce, CSP rigorosa e messaggi strutturati.

Il progetto usa Node.js 24. `npm run verify` esegue compilazione, ESLint, test unitari e contrattuali e tutte le verifiche valide durante lo sviluppo; `npm run verify:release` controlla i materiali definitivi della versione. `npm run test:integration` riusa VS Code in ambienti isolati per 13 lingue e fallback inglese; `npm run check:release` riunisce tutti i controlli, l’audit e la lista VSIX. Vengono pubblicati solo tag annotati appartenenti a `main`. GitHub Actions usa credenziali OIDC temporanee, confronta l’hash del VSIX Marketplace e crea una Release con il solo VSIX, senza SBOM o `SHA256SUMS`. Consulta la [guida di pubblicazione](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md).

# Cronologia delle stelle

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
