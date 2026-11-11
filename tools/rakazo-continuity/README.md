# Continuidad documental de Brainstorm

## Responsabilidades

- **Kelsier clasifica y coordina**. Encarga el trabajo principal a **Marsh** (seguridad/evidencia), **Dockson** (harness/agentes/contexto) o **Sazed** (modelos/runtimes/hardware). Solo investiga él si ningún especialista encaja, con motivo explícito.
- El controlador transporta esa asignación a una **rutina nativa del especialista**, no a un supuesto colaborador descrito en prosa. No cambia el trigger de runs existentes ni fabrica un contexto de usuario.
- El especialista recibe un paquete con ese post, ficha y fuentes públicas ya archivadas, no un hogar completo ni credenciales. Investiga y entrega ficha/JSON en su propio espacio.
- **Tindwyl supervisa los encargos y las entregas**, mediante recibos de ejecuciones reales y cobertura declarada. Una petición de revisión vuelve al mismo especialista y pasa otra vez por Tindwyl antes de integrar; si persiste el rechazo, se aplaza. Completar el contenido central no exige agotar todas las fuentes secundarias, pero sí declarar sus límites. El controlador solo integra una entrega válida aprobada. Su revisión de metadatos **no certifica la verdad de todas las fuentes**.
- Los modelos, identidades, herramientas y controles de aprobación se conservan. No hay framework ni ejecutor nuevo: `routine.mjs` reutiliza `routineTestTarget/createRoutineTestRun`, expansión nativa de skills y nonce ligado a propietario/bot/rutina. `RunWorkerHost` recoge los runs durables.

## Mensajes de coordinación

Las rutinas nativas publican su respuesta final en el chat incluso con `notify:false`; ese ajuste no crea un canal privado. Para no mostrar JSON técnico, `communicationPrompt` pide respuestas breves legibles: «Lo investigará Sazed: …» o «Lo investigaré yo, sin especialista adecuado: …», y Tindwyl usa «Revisión aprobada», «Corrección necesaria», «Trabajo detenido», «Conviene esperar» o «Revisión aplazada», con tema y explicación de estado/límites. No se cambia su función ni se le habilitan herramientas. En conversación normal responde con naturalidad, no con el contrato del controlador.

`routeDecision` y `teamReview` convierten esas cabeceras en decisiones internas validadas; una respuesta libre no autoriza integración ni despacho. Se admite el JSON anterior para recuperar ejecuciones ya terminadas sin repetir modelos. Las respuestas históricas no se borran ni reescriben. No es coordinación totalmente silenciosa: el chat conserva los avisos legibles. Las instrucciones y rutinas vivas de Kelsier/Tindwyl deben actualizarse con backup/CAS para retirar los antiguos «SOLO JSON»; no basta cambiar únicamente el parser.

## Flujo diario y límites

La rutina de Kelsier descubre novedades a las **06:00 Europe/Madrid**. El timer NixOS arranca el controlador a las **06:05**. Este recupera respuestas MCP persistidas: no vuelve a consultar X. Conserva el orden y excluye el histórico posterior al primer ID conocido. Descubrimientos inválidos no bloquean el backlog ya archivado.

**No hay límite numérico de fichas**, por decisión del propietario. Se mantiene una **ventana global de seis horas**, terminada como tarde a medianoche de Madrid. `days/YYYY-MM-DD.json` conserva inicio/deadline, asignación, etapas, nonces, recibos y aplazamientos; reiniciar no devuelve tiempo. `limits.rounds:null` significa sin cupo de fichas. Las ampliaciones y límites excepcionales antiguos permanecen en sus ledgers históricos, no se trasladan a un día nuevo.

**No hay timeout individual de quince minutos.** Si no aparecen eventos durante quince minutos, se pide una observación a Tindwyl, como máximo una por ejecución de coordinación/investigación. Puede recomendar esperar, aplazar o detener; el tiempo sin herramientas no prueba por sí solo un atasco. El deadline global sigue siendo obligatorio. Un bloqueo de aprobación se aplaza sin aprobarlo y permite continuar otras fichas; errores de autenticación, identidad o almacenamiento no se eluden.

El límite de ausencia de avance sigue evitando repetir indefinidamente la misma cobertura. Se da primero un turno a las fichas no intentadas antes de repetir otras. BLOQUEADA no equivale a COMPLETA y no se reintenta sin nueva fuente/autorización pertinente.

La prueba excepcional de una ficha usa **otro ledger privado**, `trial:true`, una hora global, un intento y `modelRunLimit:6`. No reinicia ni amplía el ledger diario agotado. No ejecutar pruebas reales sin autorización.

## Fuentes y aceptación

`source-policy.md` define artículo/blog central, hilo del mismo autor e imágenes/PDF conservados y revisados. Reutilizar `fuentes/<id>/manifest.json`. El espejo público FxEmbed/FxTwitter puede aportar artículos/hilos sin credenciales; comprobar identidad/continuidad y conservar la procedencia independiente. Archivar no prueba lectura. `read_file` no interpreta imágenes: requieren revisión visual.

La rutina diaria solicita `media.fields` (no `media_fields`) y expansiones en la misma consulta; eso no garantiza artículo íntegro ni bytes multimedia. El MCP sigue restringido: no ampliar endpoint/herramientas ni repetir consultas pagadas para recuperar respuestas existentes.

`readingResult` exige identidad/nonce/estado, evidencia y pendientes, `original` y `imagenes`. COMPLETA requiere original íntegro y ninguna imagen esencial pendiente. `verifyImageArchive` comprueba confinamiento real en `fuentes/<id>/`, archivos de hasta10MiB, cabecera y SHA-256. No verifica comprensión ni decodificación completa.

El investigador escribe en el paquete `ficha.md` y `resultado.json`. Tras validar ambos y la supervisión, el controlador conserva el historial de la ficha canónica aunque el especialista haya reescrito su copia, integra las imágenes declaradas y guarda el resultado con `equipo`/recibos. Actualiza solo ese estado del índice; el bot no reescribe el índice global. MD/JSON y PostgreSQL no son una transacción distribuida: tras una interrupción, inspeccionar la etapa, nonce, resultado y archivos antes de recuperar manualmente. No prometer recuperación universal tras SIGKILL.

## Operación y pruebas

Archivos de código: `supervisor.mjs`, `routine.mjs`, **`team.mjs`** y `source-policy.md`, desplegados con backup/CAS en `/data/documentary-supervisor/`. Configuración, copias, ledger y sesiones son privados (directorios700/archivos600), fuera de Git/argv. Los cambios de bots usan historial nativo y CAS. Las rutinas de equipo no añaden crons.

Servicio/timer declarativos: `corns/hosts/esbirros/esbirros/esbirros.nix`. El timeout de seguridad está **dentro del contenedor**, no solo sobre `docker exec`. Mantener un único controlador normal, sin restart automático. Cancelar solo los IDs/nonces propios mediante la cancelación nativa. No borrar un lock tras un crash sin revisar sus ejecuciones.

```bash
node --test tools/rakazo-continuity/*.test.mjs
node --check tools/rakazo-continuity/supervisor.mjs
node --check tools/rakazo-continuity/team.mjs
```

`routine.integration.mjs` se ejecuta dentro de la API: prueba las cinco rutinas, propietario, consentimiento, política, replay y rechazo de bot incorrecto, y revierte antes del commit: **cero modelos**. No sustituye la prueba real de clasificación → especialista → Tindwyl → aceptación ni la prueba del siguiente día.

## Páginas nativas por bot

`pages.mjs` presenta el archivo existente en una página privada por investigador, con filtros temporales y fichas desplegables. Se reutilizan siempre los mismos `pageId`; no es una biblioteca de favoritos/descartes ni una web adicional. `pages-policy.md` y la skill nativa compartida `paginas-privadas-por-bot` establecen la convención para bots actuales y futuros. Pam solo crea páginas cuando ayudan a una petición pertinente. Tindwyl conserva sus herramientas desactivadas y no publica.

Cada título describe el **concepto**, no el autor, el ID o el archivo. En fichas de modelos de IA empieza por el **nombre exacto del modelo**, con tamaño/variante documentados cuando importen, seguido de su utilidad o concepto. Así puede identificarse o buscarse en Hugging Face; no se inventan versiones ni enlaces. Las herramientas o métodos sin un modelo único mantienen su nombre propio. Kelsier aporta `titulo` al clasificar nuevas entregas. La organización temática de material antiguo no cambia su autoría: la procedencia histórica se muestra por separado. El estado procede del índice y no de entradas antiguas de la ficha. Las cinco líneas se reutilizan; un resumen legado de presentación se admite solo si corresponde al SHA-256 exacto de su ficha. No cambia el dictamen canónico.

La línea **Recomendación** de informes nuevos o realmente revisados incorpora **ALTA**, **MEDIA**, **BAJA** o **SIN APLICACIÓN ACTUAL**, con el proyecto/necesidad, la idea concreta rescatable y una acción justificada. Los criterios están en `source-policy.md`: se valora la utilidad para Gabi, no el post entero. La prioridad no sustituye el estado documental ni se deduce de él; si aún no puede valorarse se declara la carencia, sin inventar una etiqueta. Las fichas y páginas históricas conservan su recomendación hasta una revisión real. No se añaden campos al resultado, líneas al resumen, filtros ni reclasificaciones automáticas: `pages.mjs` conserva literalmente la recomendación existente.

El detalle Markdown y los ZIP de fuentes se enlazan como Artifacts privados mediante su almacenamiento nativo. El ZIP contiene artículo/hilo, imágenes y manifiestos cuando existen; no se publica un volumen ni se cambia la autenticación. Límites nativos:256KiB por fuente de Página y10MiB por archivo. Si se exceden, la presentación queda pendiente en vez de abrir otra arquitectura.

`config.pages.enabled:true` conecta el refresco al inicio del controlador y a las entregas **ya aceptadas**, dentro de la misma ventana global. No vuelve a investigar ni añade revisores. Las cuatro rutinas de publicación ejecutan `save_page` real; no existe API administrativa de escritura de contenido en la versión instalada. Se valida propiedad, privacidad y contenido, admitiendo únicamente la puntuación equivalente entre URLs (` · ` / ` ; `). La autorización de la carga inicial es independiente y no se traslada a los ciclos normales.

`presentations/state.json` guarda IDs, revisión, hash y recibo; `routing.json` conserva la organización inicial. Igual contenido significa cero ejecuciones y versiones nuevas. Un guardado terminado cuyo recibo quedó pendiente se reconcilia solo contra su run propietario/bot/rutina/nonce y contenido esperado. Cambios manuales incompatibles requieren revisión. Los errores se registran aparte sin repetir investigación aceptada; las versiones nativas anteriores no se borran.

Abrir o reabrir obtiene la versión almacenada; **no se promete refresco en vivo de una vista abierta**. Validar versiones, reapertura, replay sin nuevas ejecuciones, controles/modelos conservados y destinos privados de Markdown/ZIP. Comprobar los enlaces desde la propia Página, no solo la existencia de un `href`: el iframe interactivo y la vista previa son distintos; hay que enfocar el primero y conservar el gesto nativo, sin desactivar su sandbox. La comprobación del ciclo diario automático y de un móvil real es independiente de las pruebas locales.
