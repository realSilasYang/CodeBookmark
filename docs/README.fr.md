<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="Logo CodeBookmark">
  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <strong>Français</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>
  <h1>CodeBookmark</h1>
  <p><strong>Un moteur d’ancrage garde les signets liés à leurs scripts et suit précisément le code, avec assistance IA, icônes expressives et stockage local</strong></p>
  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#guide-utilisateur">Guide utilisateur</a> · <a href="#guide-de-développement">Guide de développement</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Signaler un problème</a></p>
</div>

CodeBookmark est une extension VS Code destinée au balisage et à la navigation dans le code. Son moteur d’ancrage relie la configuration à l’identité du script et retrouve les signets après une modification du code, un renommage, un déplacement de dossier ou le transfert d’un workspace. Les données restent dans le dossier local choisi par l’utilisateur. L’IA peut générer des signets selon le sens du code, améliorer les libellés et choisir une icône uniquement lorsque la correspondance est suffisamment nette.

# Aperçu de l’interface

[![Interface CodeBookmark](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# Faire un don

Si la navigation par signets et l’assistance IA vous font gagner du temps, vous pouvez aider l’auteur à sortir de la pauvreté par l’un des moyens ci-dessous (≥Д≤).

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="Code QR de soutien WeChat Pay"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Code QR de soutien Alipay"></td></tr>
  </table>
</div>

# Guide utilisateur

## 1. Première configuration

Renseignez `Codebookmark: Global Storage Path` dans les paramètres. Choisissez un dossier local durable et accessible en écriture, distinct du code source et des répertoires temporaires. Avec un seul fichier ouvert, l’arbre ne montre que ses signets ; avec un dossier ou un workspace, il affiche les nœuds de fichiers, les signets ordinaires et la disposition inter-fichiers. Aucun contenu n’est transmis, sauf le code sélectionné lorsque vous lancez volontairement une commande IA.

## 2. Raccourcis et navigation

`Ctrl+B`／`Cmd+B` ajoute ou retire le signet de la ligne courante ; `Ctrl+Alt+B`／`Cmd+Alt+B` force l’ajout et `Ctrl+Alt+Shift+B`／`Cmd+Alt+Shift+B` force la suppression. Un signet conserve son libellé, sa ligne, son ancre exacte, sa hiérarchie, son icône, son état développé et son identité stable. La navigation réutilise l’onglet déjà ouvert ou ouvre le fichier dans un nouvel onglet non provisoire.

## 3. Hiérarchie, glisser-déposer et conteneurs

Signets et nœuds de fichiers peuvent être triés, renommés, recevoir une icône, devenir conteneurs ou accueillir d’autres nœuds. Le glisser-déposer entre fichiers ne mélange pas leurs données : chaque script garde son propre fichier de configuration, tandis que `_workspace_layout.json` stocke uniquement l’ordre, les relations, le masquage, les conteneurs et le développement. La suppression d’un nœud de fichier ne supprime jamais le source ; après confirmation du sous-arbre visuel, ses signets ordinaires sont réellement retirés de leurs configurations d’origine.

## 4. Recherche, libellés et icônes

La recherche porte sur les libellés, noms, chemins et contenus. Les libellés dans l’éditeur sont réglables en couleur, taille, graisse, espacement et position. Le sélecteur d’icônes propose des catégories, une recherche floue chinoise et anglaise, un chargement paginé et les éléments récents synchronisables par VS Code. En cas d’ambiguïté, l’IA conserve toujours l’icône par défaut.

## 5. Signets automatiques TODO, FIXME et BUG

Il ne s’agit pas d’une recherche de texte brute. Le langage doit fournir à VS Code une grammar de coloration et des règles officielles de commentaires ; la directive doit se trouver au début d’un véritable commentaire. Les noms de SVG, métadonnées JSON, chaînes, textes explicatifs, Plain Text et fichiers sans coloration sont exclus. Le balayage est limité à 2 000 fichiers, ignore les fichiers fermés de plus de 2 Mio, autorise 5 000 marqueurs automatiques par script et 10 000 nœuds par configuration.

## 6. Déplacements et récupération

L’identité combine l’ID du script, son chemin relatif, des caractéristiques de contenu, le journal de déplacement et l’état d’absence. Sont couverts les renommages VS Code, déplacements externes, dossiers complets, scripts isolés et suppressions suivies d’une recréation sans événement rename. La reconnexion automatique exige un candidat unique et fiable. Pour une ligne, le moteur compare l’ancre, le voisinage, la structure et la distance ; en l’absence de preuve, il signale le nœud comme invalide plutôt que de viser une mauvaise ligne.

## 7. Import, export et gestion des configurations

« Importer／exporter les signets » enregistre le script courant ou l’espace de travail dans un unique fichier de configuration `.codebookmark`. Ce fichier peut être importé dans un autre dossier local ou sur un appareil Windows, macOS ou Linux, puis modifié et repartagé sans perdre libellés, icônes, hiérarchie, ancres de code, apparence des nœuds de fichier ni disposition entre fichiers. Il ne contient aucun chemin absolu ni identifiant propre au système de fichiers ; les anciens JSON et dossiers de configuration ne sont plus acceptés à l’importation.

L’importation reconnaît automatiquement un paquet de script ou d’espace de travail et ne lie qu’une cible certaine, d’après le chemin relatif, l’empreinte du code ou le contexte des signets. Les correspondances ambiguës sont signalées comme conflits ; si des signets existent déjà, vous choisissez Ajouter ou Écraser. Markdown, HTML, CSV et le texte hiérarchique restent des formats de lecture. Le gestionnaire affiche aussi les états d’échange entre appareils, les dispositions, migrations, copies en conflit et résidus temporaires.

## 8. Assistance IA

Configurez `Codebookmark.AI: Address`, `API Key` et le modèle. Address accepte un Resource Endpoint, une API Base URL, Chat Completions, Responses, Anthropic Messages, Gemini `generateContent` ou Ollama ; après un test réussi, l’adresse réellement opérationnelle est enregistrée. Les services distants doivent utiliser HTTPS. L’IA peut générer pour le script courant ou les scripts sans signets du workspace, puis ajouter, régénérer ou améliorer les libellés des scripts déjà renseignés. Le menu masque automatiquement les choix sans objet.

Chaque réponse est contrôlée : structure JSON, ligne, ancre littérale, quantité, profondeur, propriété des ID et liste d’icônes. Le code et les noms de fichiers sont des données, jamais des instructions. L’IA est désactivée dans un workspace non approuvé ; annulation, délai dépassé, modification pendant l’analyse ou limite franchie empêchent toute application partielle.

## 9. Annuler, rétablir et conflits

Ajout, suppression, renommage, déplacement, tri, conteneur, icône, IA, import et opérations en lot créent des enregistrements atomiques séparés par scope. Les écritures passent par une file par fichier, détectent les modifications externes et remplacent atomiquement la cible. Le changement de stockage copie et vérifie d’abord, bascule ensuite, puis nettoie les fichiers migrés de l’ancien emplacement.

## 10. Paramètres principaux

`globalStoragePath` choisit le stockage ; `defaultIcon`, `showLineNumber` et `showLabelInEditor` règlent l’affichage ; `codeMarkers.enabled` active les marqueurs automatiques. L’IA utilise `AI.address`, `AI.APIKey`, `AI.model` et `AI.assignIcons`.

# Guide de développement

## 1. Structure et activation

`src/` contient TypeScript, `scripts/` les outils de build, vérification, intégration et publication, `tests/` les tests unitaires, contractuels et Extension Host, `resources/` les actifs. `package.json`, `out/` et `package.nls*.json` sont générés ; `BasePackage.ts` et `Commands.ts` sont la source du manifeste. `extension.ts` initialise localisation, configuration, dépôt, Provider, commandes et abonnements. La visibilité repose sur des Context Keys stables, jamais sur un texte traduit.

## 2. Modèle, persistance et fichiers

`Bookmark`, `BookmarkSet` et les codecs définissent identités et hiérarchies. Chaque script garde sa configuration ; `_workspace_layout.json` représente seulement la disposition inter-fichiers. `PersistenceSchema` et les migrations valident les données. `BookmarkRepository`, `ScriptRelocationJournal` et les abonnements résolvent les déplacements. Les écritures sont sérialisées, comparent la version lue et remplacent via un fichier temporaire.

## 3. Suivi, annulation et sécurité

Le moteur n’accepte qu’un candidat de position unique et solide. L’annulation utilise des instantanés complets ; une opération inter-fichiers inclut toutes les configurations et la disposition concernées. `AIService` gère les adresses et le transport, les schemas valident les réponses non fiables et le catalogue autorise les icônes selon leur sens. Les marqueurs exigent grammar et règles de commentaire. Les Webview utilisent nonce, CSP stricte et messages structurés.

## 4. Build, tests et publication

Le projet utilise Node.js 24. `npm run verify` lance la compilation, ESLint, les tests unitaires et contractuels ainsi que tous les contrôles valables pendant le développement ; `npm run verify:release` vérifie les documents définitifs de la version. `npm run test:integration` réutilise VS Code dans des environnements isolés pour 13 langues et le repli anglais ; `npm run check:release` réunit ces contrôles, l’audit et le contenu VSIX.

Seuls les tags annotés appartenant à `main` sont publiables. GitHub Actions utilise des identifiants OIDC éphémères, publie sur Marketplace, compare le hash du VSIX distant, puis crée une Release avec VSIX, CycloneDX SBOM et `SHA256SUMS`. Voir le [guide de publication](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md).

# Historique des étoiles

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
