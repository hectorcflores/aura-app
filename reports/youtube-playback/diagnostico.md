# Diagnóstico de reproducción de YouTube

Investigación local del 12 de septiembre de 2026. No se cambió el reproductor de producción durante esta investigación.

## Evidencia

Pruebas con Chrome automatizado sin sesión, desde http://127.0.0.1:8765. No representan todos los dispositivos o redes.

| Video | Resultado |
| --- | --- |
| apErqeR1IqU, Nanawa original | Ambos dominios de embed muestran Please sign in. Respuesta interna observada: LOGIN_REQUIRED. API oficial: onReady, estados -1 y 3, onError 150, estado -1; tiempo 0. |
| YSn5vWNJV5k, otra publicación | También muestra Please sign in. |
| O2uaTE3eXcg, Festival de Cine de La Habana | Respuesta interna OK, playableInEmbed=true. API oficial: onReady, estados -1, 3, 1; tiempo superior a 5 segundos. |
| KwSBhtlchD0, Lo que queda de ti | Ambos dominios reproducen sin sesión. |

La API oficial permite detectar este fallo concreto con onError 150. La causa operativa es una negativa de YouTube a reproducir esa publicación en este contexto, no falta del iframe ni el error 153 anterior. No está demostrado qué política interna produjo LOGIN_REQUIRED: no atribuir con certeza a edad, IP, bots o cookies. Cambiar dominio no resolvió Nanawa. La prueba preliminar sin autoplay solo mostró título, no reproducción confirmada; no cuenta como éxito.

## Defectos de Aura

scripts/build_cartelera.mjs conserva un único ID. Prioriza Cineteca y solo consulta videos de TMDB cuando falta ese ID. trailerTmdb devuelve el primer Trailer o Teaser del primer idioma con resultados; su comentario dice oficial, pero no filtra el atributo official. No valida disponibilidad para embed ni guarda alternativas.

app/index.html inserta iframes sin escuchar la API oficial. No distingue reproducción, autoplay bloqueado y error; no puede recuperar el fallo.

## Propuesta

1. Guardar una lista de candidatos por película, conservando el ID principal por compatibilidad. Reunir Cineteca y TMDB aunque ya exista un enlace. Deduplicar, priorizar trailers oficiales e idioma; exigir correspondencia de película antes de aceptar alternativas manuales.
2. Validación previa opcional mediante YouTube Data API (credencial en GitHub Actions): privacidad, embeddable, región y restricciones disponibles. No tratar embeddable=true como garantía de reproducción. Mantener correcciones persistentes fuera del JSON generado para que el cron no las borre.
3. Usar YouTube IFrame Player API para todos los trailers. Al abrir, mute y play; esperar PLAYING. Ante 100/101/150, probar hasta dos candidatos adicionales verificados, una sola vez cada uno. 153 indica fallo de integración: corregir identidad/referrer, no rotar videos.
4. onAutoplayBlocked: ofrecer reproducir con un toque; no descartar el video. Si hay espera prolongada sin reproducción ni error, ofrecer reintentar/otra versión, sin diagnosticar automáticamente login ni interrumpir una pausa voluntaria. No sobreponer controles al player de YouTube.
5. Al colapsar/cambiar de película, destruir el player y cancelar timers. Ignorar callbacks de selecciones anteriores. Mantener nota y votos una vez, UI actual y video en la misma ubicación.
6. Si se agotan candidatos, enlace directo a YouTube como último recurso. Registrar localmente errores y resultado; métricas agregadas de producción requieren diseñar un endpoint o servicio, la web estática no recoge esos eventos sola.

## Validación de aceptación

Reproducir el error 150 y recuperar con la alternativa Nanawa; autoplay bloqueado con reproducción manual; borrado/privado; ausencia de candidatos; fallo de red; cambios rápidos entre fichas; cierre durante carga; navegador móvil real y escritorio. Medir inicio de reproducción, recuperación y salida externa. Un chequeo en GitHub Actions no garantiza reproducción en la red del usuario.

No se puede garantizar reproducción interna para todos los visitantes manteniendo YouTube: sus restricciones y las del navegador permanecen fuera del control de Aura. Robustez significa recuperar fallos y ofrecer una salida, no prometer saltarse autenticación.

## Fuentes oficiales

https://developers.google.com/youtube/iframe_api_reference
https://developers.google.com/youtube/v3/docs/videos
https://support.google.com/youtube/answer/171780?hl=en
