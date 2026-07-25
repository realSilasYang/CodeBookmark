<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="Logotipo do CodeBookmark">
  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.es.md">Español</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <strong>Português</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>
  <h1>CodeBookmark</h1>
  <p><strong>Um mecanismo de ancoragem mantém os favoritos ligados aos scripts e acompanha o código com precisão, com assistência de IA, ícones expressivos e armazenamento local</strong></p>
  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#guia-do-usuário">Guia do usuário</a> · <a href="#guia-do-desenvolvedor">Guia do desenvolvedor</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Relatar um problema</a></p>
</div>

CodeBookmark é uma extensão do VS Code para marcar e navegar pelo código. O mecanismo de ancoragem liga a configuração à identidade do script e reencontra os favoritos depois de edições, renomeações, mudanças de pasta ou transferência do workspace. Os dados ficam na pasta local escolhida pelo usuário. A IA pode gerar favoritos a partir do significado do código, melhorar rótulos e escolher um ícone apenas quando a correspondência semântica for clara.

# Visão geral

[![Interface do CodeBookmark](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# Doações

Se a navegação por favoritos e a assistência de IA poupam seu tempo, você pode oferecer um chá com leite ao autor usando um dos códigos QR abaixo.

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="Código QR de apoio pelo WeChat Pay"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Código QR de apoio pelo Alipay"></td></tr>
  </table>
</div>

# Guia do usuário

## 1. Configuração inicial

Defina `Codebookmark: Global Storage Path` nas configurações. Use uma pasta local estável, gravável e separada do código-fonte e de diretórios temporários. Com um único arquivo aberto, a árvore mostra apenas seus favoritos; em uma pasta ou workspace, mostra nós de arquivo, favoritos comuns e o layout entre arquivos. Nada é enviado para fora, exceto o trecho escolhido quando você executa uma ação de IA.

## 2. Atalhos e navegação

`Ctrl+B`／`Cmd+B` adiciona ou remove o favorito da linha atual; `Ctrl+Alt+B`／`Cmd+Alt+B` força a criação e `Ctrl+Alt+Shift+B`／`Cmd+Alt+Shift+B` força a remoção. Cada favorito guarda rótulo, linha, âncora literal, hierarquia, ícone, expansão e identidade estável. A navegação reutiliza a aba já aberta ou abre o destino em uma aba nova, não provisória.

## 3. Hierarquia, arrastar e contêineres

Favoritos e nós de arquivo podem ser ordenados, renomeados, receber ícones, virar contêineres e aceitar outros nós. O arrasto entre arquivos altera apenas a apresentação do workspace: cada script mantém seu arquivo de configuração, enquanto `_workspace_layout.json` registra ordem, relações, ocultação, contêineres e expansão. Excluir um nó de arquivo nunca exclui o fonte; ao confirmar a exclusão da subárvore visual, seus favoritos comuns são removidos das configurações proprietárias.

## 4. Pesquisa, rótulos e ícones

A pesquisa cobre rótulos, nomes, caminhos e conteúdo do código. Os rótulos no editor permitem ajustar cor, tamanho, peso, espaçamento e posição. O seletor de ícones oferece categorias, pesquisa difusa em chinês e inglês, paginação e itens recentes sincronizáveis pelo VS Code. Na dúvida, a IA mantém o ícone padrão.

## 5. Favoritos automáticos TODO, FIXME e BUG

Não é uma busca textual simples. O VS Code precisa registrar uma grammar de realce e regras oficiais de comentário para a linguagem, e a diretiva deve iniciar um comentário real. Nomes de SVG, metadados JSON, strings, prosa, Plain Text e arquivos sem realce são ignorados. A varredura encontra até 2.000 arquivos, pula arquivos fechados acima de 2 MiB, limita cada script a 5.000 marcadores automáticos e cada configuração a 10.000 nós.

## 6. Movimentação e recuperação

A identidade combina ID do script, caminho relativo, características do conteúdo, diário de movimentação e estado de ausência. Isso cobre renomeações no VS Code, movimentos externos, pastas inteiras, scripts isolados e exclusão seguida de recriação sem evento rename. A religação automática exige um único candidato confiável. Para a linha, o mecanismo compara âncora, contexto, estrutura e distância; sem evidência suficiente, marca o nó como inválido.

## 7. Importação, exportação e gerenciamento

É possível importar um script ou uma pasta completa de configurações. A exportação oferece JSON reimportável, texto hierárquico, Markdown, HTML e CSV. A exportação em lote percorre a pasta atual, processa somente scripts com favoritos e produz um resultado por arquivo-fonte. O gerenciador mostra configurações, layout atual, registros antigos, migrações, cópias conflitantes e resíduos temporários; o hover revela valores completos e somente tipos autorizados podem ser limpos. Scopes vazios desaparecem quando o histórico de desfazer／refazer não precisa mais deles.

## 8. Assistência de IA

Configure `Codebookmark.AI: Address`, `API Key` e o modelo. Address aceita Resource Endpoint, API Base URL, Chat Completions, Responses, Anthropic Messages, Gemini `generateContent` ou Ollama; depois de um teste bem-sucedido, grava o endereço realmente funcional. Serviços remotos devem usar HTTPS. A IA gera para o script atual ou scripts sem favoritos do workspace e pode acrescentar, regenerar ou melhorar rótulos onde já há dados. O menu oculta escolhas que não se aplicam.

Toda resposta passa por validação de JSON, linha, âncora literal, quantidade, profundidade, propriedade de ID e lista de ícones. Código e nomes são dados, não instruções. A IA fica desativada em workspaces não confiáveis; cancelamento, timeout, mudança durante a análise ou estouro de limite impedem resultados parciais.

## 9. Desfazer, refazer e conflitos

Criação, exclusão, renomeação, arrasto, ordem, contêiner, ícone, IA, importação e operações em lote geram registros atômicos separados por scope. As gravações usam uma fila por arquivo, detectam alterações externas e substituem o destino de forma atômica. A troca do armazenamento copia e verifica primeiro, alterna depois e só então limpa os arquivos migrados da pasta anterior.

## 10. Configurações principais

`globalStoragePath` escolhe o armazenamento; `defaultIcon`, `showLineNumber` e `showLabelInEditor` controlam a apresentação; `codeMarkers.enabled` ativa marcadores automáticos. A IA usa `AI.address`, `AI.APIKey`, `AI.model` e `AI.assignIcons`.

# Guia do desenvolvedor

## 1. Estrutura e ativação

`src/` contém TypeScript, `scripts/` ferramentas de build, verificação, integração e publicação, `tests/` testes unitários, contratuais e de Extension Host, e `resources/` os recursos. `package.json`, `out/` e `package.nls*.json` são gerados; `BasePackage.ts` e `Commands.ts` são a fonte do manifesto. `extension.ts` inicializa localização, configuração, repositório, Provider, comandos e assinaturas. A visibilidade usa Context Keys estáveis, nunca texto traduzido.

## 2. Modelo, persistência e arquivos

`Bookmark`, `BookmarkSet` e codecs definem identidades e hierarquias. Cada script conserva sua configuração e `_workspace_layout.json` representa apenas o layout entre arquivos. `PersistenceSchema` e migrações validam os dados. `BookmarkRepository`, `ScriptRelocationJournal` e assinaturas resolvem movimentos. As gravações são serializadas, comparam a versão lida e substituem via arquivo temporário.

## 3. Rastreamento, desfazer e segurança

O mecanismo só aceita um candidato de posição único e sólido. O desfazer usa snapshots completos; operações entre arquivos incluem todas as configurações e o layout afetados. `AIService` trata endereços e transporte, schemas validam respostas não confiáveis e o catálogo autoriza ícones por semântica. Marcadores exigem grammar e regras de comentário. Webviews usam nonce, CSP estrita e mensagens estruturadas.

## 4. Build, testes e publicação

O projeto usa Node.js 24. `npm run verify` executa compilação, ESLint, testes unitários e contratuais e verificadores; `npm run test:integration` reutiliza o VS Code em ambientes isolados para 13 idiomas e fallback em inglês; `npm run check:release` acrescenta auditoria e listagem do VSIX.

Somente tags anotadas pertencentes a `main` podem ser publicadas. O GitHub Actions usa credenciais OIDC temporárias, publica no Marketplace, compara o hash do VSIX remoto e cria uma Release com VSIX, CycloneDX SBOM e `SHA256SUMS`. Consulte o [guia de publicação](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md).

# Histórico de estrelas

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
