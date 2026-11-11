# Artículos, hilos propios e imágenes de los guardados

El tweet guardado es la entrada, no necesariamente el contenido a investigar.

- Si remite a un artículo o blog, incluido un artículo de X, lee su cuerpo completo y conserva una copia privada del texto con URL y autor. El tweet, título, entradilla, perfil o una fuente genérica no lo sustituyen.
- Puedes seguir las respuestas que forman el hilo del mismo autor cuando contienen la información anunciada. Comprueba `author_id` frente al post original, conserva orden y URLs; no mezcles respuestas de terceros ni abras una investigación de toda la conversación.
- Conserva las imágenes pertinentes como archivos reales PNG/JPEG/GIF/WebP o PDF privado, además de revisarlas visualmente con las herramientas disponibles. Prefiere originales; si solo hay capturas o PDF, identifica qué cubren y qué queda fuera. Un enlace, `media_key`, texto alternativo u OCR no son una copia de la imagen. No uses `read_file` para interpretar binarios.
- Guarda estos archivos bajo `fuentes/<id>/` dentro de guardados-x, con URL de procedencia y SHA-256. El controlador admite archivos de hasta 10 MiB cada uno. No cambies una extensión para convertir un archivo. Verifica que no hayas descargado una página de login/error.
- Para un artículo: conserva el cuerpo y las imágenes centrales. Para un hilo: conserva las partes pertinentes del mismo autor y sus imágenes. Si una imagen es central y no puede recuperarse o revisarse, no cierres como COMPLETA. Explica lo que falta sin inventar el contenido.
- Antes de consultar la red, revisa `fuentes/<id>/manifest.json` si existe: enumera respuestas originales, artículos con partes pequeñas, hilos propios e imágenes conservadas. Lee esas copias; archivarlas no significa que ya estén investigadas. Conserva la atribución de cualquier trabajo anterior.
- Para contenido público de X puedes usar el espejo independiente FxEmbed/FxTwitter: `https://api.fxtwitter.com/2/status/<id>` recupera el post/artículo y `https://api.fxtwitter.com/2/thread/<id>` el hilo. La respuesta debe indicar `code: 200`; verifica ID y autor frente al post archivado. No necesita cookies, claves ni instalar nada. No subas contexto privado al espejo ni le atribuyas carácter oficial.
- El cuerpo del artículo está en `article.content.blocks`, con enlaces, código e imágenes también en `entityMap`/`media_entities`; puede estar en un post citado. Conserva el JSON original y un texto legible sin omitir bloques ni entidades. Si un hilo incluye terceros, exclúyelos y no lo presentes como continuo: comprueba autor ID y enlaces de respuesta entre partes. Para imágenes usa los bytes originales de las URLs multimedia recibidas, no el JSON del espejo como sustituto.
- Reutiliza primero respuestas y archivos existentes. Las lecturas públicas de X quedan dentro del encargo, pero no repitas la consulta de guardados ni amplíes herramientas, credenciales o gasto sin autorización. Si el espejo no ofrece el cuerpo o las partes necesarias, declara esa carencia; un HTTP 403, login o barrera de pago no autoriza a sortear controles.
- Este criterio alcanza las fichas pendientes y las futuras. Mantén las fuentes anteriores y su historial; reabrir para revisar el material no significa haberlo recuperado.

## Prioridad de la recomendación

En cada informe nuevo o revisado, conserva las cinco líneas y usa `Recomendación: <prioridad> — <proyecto o necesidad>: <aporte concreto, acción y motivo>`. Elige una sola etiqueta por su utilidad para Gabi:

- **ALTA**: aporte concreto que merece atención ahora para uno de sus proyectos o necesidades.
- **MEDIA**: útil, pero requiere adaptación o encaja más adelante.
- **BAJA**: interés informativo, sin una aplicación clara.
- **SIN APLICACIÓN ACTUAL**: no encontramos nada aprovechable para sus necesidades actuales.

Valora lo rescatable, no el post entero: una sola idea útil puede merecer ALTA sin recomendar las demás ni adoptar todo el framework. Nombra esa idea y su aplicación; no fuerces un aporte si no lo hay. No inventes proyectos ni encaje. Si la evidencia no permite valorar todavía, declara «pendiente de valorar» y qué falta, sin asignar una prioridad ficticia ni confundirlo con BAJA o SIN APLICACIÓN ACTUAL.

La prioridad es independiente de COMPLETA/PARCIAL/BLOQUEADA: terminar la investigación no implica recomendarla, y faltar información no demuestra falta de utilidad. No autoriza instalaciones, pruebas ni cambios. Las fichas históricas conservan sus recomendaciones hasta una revisión real; presentar u organizar páginas no autoriza reclasificarlas. No añadas campos de prioridad al JSON del controlador ni más líneas al resumen. Ejemplo: `Recomendación: ALTA — DEV-PI: rescatar la recuperación de tareas; no adoptar el framework completo.`

## Resultado del controlador

Conserva los campos `id`, `assignment`, `estado`, `motivo`, `pendiente` y `fuentes` ya requeridos, y añade:

```json
{
  "original": {
    "tipo": "articulo",
    "url": "https://fuente-real-del-contenido",
    "cobertura": "completa"
  },
  "imagenes": {
    "estado": "archivadas",
    "archivos": [
      {
        "ruta": "fuentes/ID/imagen-01.png",
        "url": "https://procedencia-real",
        "sha256": "SHA256_DEL_ARCHIVO_REAL"
      }
    ]
  }
}
```

`original.tipo`: `post`, `articulo` o `hilo`. En un hilo añade `autor_id`, igual al `author_id` del post guardado. `original.cobertura`: `completa`, `parcial` o `inaccesible`. `imagenes.estado`: `no_aplica` (no hay imágenes pertinentes), `archivadas` o `faltan`; `archivos` enumera únicamente copias existentes, incluso si faltan otras. Describe en la evidencia qué imágenes revisaste, la cobertura de capturas/PDF y lo que falta.

COMPLETA requiere contenido original completo, ninguna cuestión central pendiente e imágenes pertinentes conservadas y revisadas. La comprobación de rutas, cabeceras y hashes acredita archivos, no que el modelo haya entendido su contenido. No conviertas una barrera en un cierre ficticio.
