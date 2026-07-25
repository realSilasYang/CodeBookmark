<div align="center">
  <img src="../resources/bookmark_logo.png" width="112" height="112" alt="Logotipo de CodeBookmark">
  <p><a href="https://github.com/realSilasYang/CodeBookmark/blob/main/README.md">简体中文</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.en.md">English</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ja.md">日本語</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.vi.md">Tiếng Việt</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ko.md">한국어</a> · <strong>Español</strong> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.fr.md">Français</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.pt.md">Português</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.ru.md">Русский</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.de.md">Deutsch</a> · <a href="https://github.com/realSilasYang/CodeBookmark/blob/main/docs/README.it.md">Italiano</a></p>
  <h1>CodeBookmark</h1>
  <p><strong>Un motor de anclaje mantiene los marcadores vinculados a sus scripts y sigue el código con precisión, con ayuda de IA, iconos expresivos y almacenamiento local</strong></p>
  <p><a href="https://marketplace.visualstudio.com/items?itemName=realSilasYang.codebookmark">Marketplace</a> · <a href="#guía-de-uso">Guía de uso</a> · <a href="#guía-para-desarrolladores">Guía para desarrolladores</a> · <a href="https://github.com/realSilasYang/CodeBookmark/issues/new/choose">Informar de un problema</a></p>
</div>

CodeBookmark es una extensión de VS Code para marcar y recorrer código. Su motor de anclaje vincula la configuración con la identidad del script y vuelve a localizar cada marcador tras editar el código, renombrar archivos, mover carpetas o trasladar un workspace. Los datos se guardan en una carpeta local elegida por el usuario. La IA puede generar marcadores según el significado del código, mejorar etiquetas y asignar iconos solo cuando la relación semántica es inequívoca.

# Vista general

[![Interfaz de CodeBookmark](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)](https://raw.githubusercontent.com/realSilasYang/CodeBookmark/main/docs/images/codebookmark-overview.png)

# Donaciones

Si la navegación por marcadores y la asistencia de IA te ahorran tiempo, puedes invitar al autor a un té con leche mediante cualquiera de los códigos QR de abajo.

<div align="center">
  <table>
    <tr><td align="center"><strong>WeChat Pay</strong></td><td align="center"><strong>Alipay</strong></td></tr>
    <tr><td align="center"><img src="../resources/donate/wechat-pay.png" width="240" alt="Código QR para donar con WeChat Pay"></td><td align="center"><img src="../resources/donate/alipay.png" width="240" alt="Código QR para donar con Alipay"></td></tr>
  </table>
</div>

# Guía de uso

## 1. Primera configuración

Indica `Codebookmark: Global Storage Path` en los ajustes. Debe ser una carpeta local estable y con permiso de escritura, no el árbol del código fuente ni una carpeta temporal. Con un solo archivo abierto se muestra únicamente su árbol; con una carpeta o workspace se muestran nodos de archivo, marcadores normales y el diseño entre archivos. Nada se envía fuera salvo el código elegido cuando ejecutas una orden de IA.

## 2. Atajos y navegación

`Ctrl+B`／`Cmd+B` añade o quita el marcador de la línea actual; `Ctrl+Alt+B`／`Cmd+Alt+B` fuerza la creación y `Ctrl+Alt+Shift+B`／`Cmd+Alt+Shift+B` fuerza la eliminación. Cada nodo conserva etiqueta, línea, ancla literal, jerarquía, icono, expansión e identidad estable. Al abrirlo, CodeBookmark cambia a la pestaña existente o abre el destino en una pestaña no provisional.

## 3. Jerarquía, arrastre y contenedores

Los marcadores y nodos de archivo admiten ordenación, cambio de nombre, iconos, función de contenedor y arrastre entre archivos. El contenido de cada script permanece en su archivo de configuración; `_workspace_layout.json` solo guarda orden, relaciones entre archivos, ocultación, contenedores y expansión. La selección múltiple permite mover o borrar en bloque. Borrar un nodo de archivo jamás borra el archivo fuente; al confirmar el borrado del subárbol visual, sus marcadores normales sí se eliminan de las configuraciones propietarias.

## 4. Búsqueda, etiquetas e iconos

La búsqueda cubre etiquetas, nombres, rutas y código. Las etiquetas en el editor permiten ajustar color, tamaño, peso, separación y posición. El selector de iconos ofrece categorías, búsqueda difusa en chino e inglés, carga por páginas y recientes sincronizables mediante VS Code. La IA conserva el icono predeterminado ante cualquier ambigüedad.

## 5. Marcadores automáticos TODO, FIXME y BUG

No se trata de una búsqueda textual. VS Code debe registrar para el lenguaje tanto una grammar de resaltado como reglas oficiales de comentarios, y la directiva debe aparecer al principio de un comentario real. Nombres de SVG, metadatos JSON, cadenas, prosa, Plain Text o archivos sin resaltado no cuentan. El escaneo encuentra como máximo 2.000 archivos, omite los no abiertos de más de 2 MiB, limita cada script a 5.000 marcadores automáticos y cada configuración a 10.000 nodos.

## 6. Movimientos y recuperación

La identidad combina ID del script, ruta relativa, rasgos de contenido, diario de traslados y estado de ausencia. Esto cubre renombrados de VS Code, movimientos externos, carpetas completas, scripts sueltos y secuencias de borrar y volver a crear sin evento rename. Solo se vuelve a enlazar cuando existe un candidato único y fiable. Para las líneas se comparan ancla, contexto, estructura y distancia; si faltan pruebas, el nodo queda inválido en vez de saltar a una línea equivocada.

## 7. Importación, exportación y administración

Puedes importar la configuración de un script o una carpeta completa de workspace. La exportación ofrece JSON reimportable, texto jerárquico, Markdown, HTML y CSV. La exportación por lotes recorre la carpeta actual, procesa solo scripts con marcadores y crea un resultado por archivo fuente. El administrador muestra configuraciones, diseño actual, registros antiguos, migraciones, copias en conflicto y restos temporales; los campos muestran el valor completo al pasar el puntero y solo se pueden limpiar tipos autorizados. Los scopes vacíos se eliminan cuando ya no los protege el historial de deshacer／rehacer.

## 8. Asistencia de IA

Configura `Codebookmark.AI: Address`, `API Key` y el modelo. Address acepta Resource Endpoint, API Base URL, Chat Completions, Responses, Anthropic Messages, Gemini `generateContent` u Ollama; tras una prueba correcta se guarda la dirección que realmente funcionó. Los servicios remotos deben usar HTTPS. La IA puede generar para el archivo actual o los scripts sin marcadores del workspace, y añadir, regenerar o mejorar etiquetas donde ya existan datos. El menú oculta automáticamente las opciones sin sentido.

Toda respuesta se valida por estructura JSON, línea, ancla literal, cantidad, profundidad, propiedad de ID y lista de iconos. El código y los nombres son datos, no instrucciones. La IA se desactiva en workspaces no confiables; cancelación, timeout, cambios durante el análisis o límites excedidos impiden aplicar resultados parciales.

## 9. Deshacer, rehacer y conflictos

Crear, borrar, renombrar, arrastrar, ordenar, cambiar contenedores o iconos, aplicar IA, importar y operar en lote producen registros atómicos. El historial se separa por scope. Las escrituras pasan por una cola por archivo, detectan cambios externos y sustituyen de forma atómica. Un traslado del almacenamiento copia y verifica antes de cambiar, y solo entonces limpia los archivos migrados del destino anterior.

## 10. Ajustes principales

`globalStoragePath` define el almacenamiento; `defaultIcon`, `showLineNumber` y `showLabelInEditor` controlan la presentación; `codeMarkers.enabled` activa marcadores automáticos. La IA usa `AI.address`, `AI.APIKey`, `AI.model` y `AI.assignIcons`.

# Guía para desarrolladores

## 1. Estructura y activación

`src/` contiene TypeScript, `scripts/` las herramientas de compilación, verificación, integración y publicación, `tests/` las pruebas unitarias, contractuales y de Extension Host, y `resources/` los activos. `package.json`, `out/` y `package.nls*.json` son generados; `BasePackage.ts` y `Commands.ts` son la fuente del manifiesto. `extension.ts` inicializa localización, configuración, repositorio, Provider, órdenes y suscriptores. La lógica de visibilidad usa Context Keys estables, nunca traducciones.

## 2. Modelo, persistencia y archivos

`Bookmark`, `BookmarkSet` y los codecs definen identidades y jerarquías. Cada script conserva su propia configuración y `_workspace_layout.json` solo representa el diseño entre archivos. `PersistenceSchema` y las migraciones validan los datos. `BookmarkRepository`, `ScriptRelocationJournal` y los suscriptores resuelven movimientos. Las escrituras se serializan, comparan la versión leída y reemplazan mediante archivo temporal.

## 3. Seguimiento, deshacer y seguridad

El motor acepta únicamente un candidato de posición único y suficientemente sólido. El deshacer usa instantáneas completas; una operación entre archivos incluye todas las configuraciones y el diseño afectados. `AIService` se ocupa de direcciones y transporte, los schemas de respuestas no confiables y el catálogo de la autorización semántica de iconos. Los marcadores automáticos solo se escanean tras comprobar grammar y reglas de comentario. Los Webview usan nonce, CSP estricto y mensajes estructurados.

## 4. Compilación, pruebas y publicación

El proyecto usa Node.js 24. `npm run verify` ejecuta compilación, ESLint, pruebas unitarias y contractuales y todos los verificadores; `npm run test:integration` reutiliza el VS Code instalado en entornos aislados para 13 idiomas y el fallback inglés; `npm run check:release` añade auditoría y listado del VSIX.

Solo se publican etiquetas anotadas pertenecientes a `main`. GitHub Actions usa credenciales OIDC efímeras, publica Marketplace, compara el hash del VSIX remoto y crea un GitHub Release con VSIX, CycloneDX SBOM y `SHA256SUMS`. Consulta la [guía de publicación](https://github.com/realSilasYang/CodeBookmark/blob/main/docs/release/RELEASING.en.md).

# Historial de estrellas

[![Star History Chart](https://api.star-history.com/svg?repos=realSilasYang/CodeBookmark&type=Date)](https://star-history.com/#realSilasYang/CodeBookmark&Date)
