# Diagnóstico de cobertura de Aura — snapshot del 5 de septiembre de 2026

El JSON generado a las 19:01:20.842 UTC contiene **89 entradas, 36 con nota y 53 sin nota: 40,4 % de cobertura**. Las 36 notas publicadas proceden de IMDb. Hay 45 entradas con tmdbId y 38 con imdbId (36 IDs distintos por las versiones DOB/SUB de Coyote y Ponyo). Una nota publicada está vinculada a una película equivocada.

La clasificación revisada de las 53 ausencias es **40 programas/recopilaciones y 13 largometrajes**, no 39 y 14. Los 39 se reproducen con títulos Shorts, varios títulos concatenados y/o director Varios. Animanimales agrega una recopilación más: la propia Cineteca enumera sus cortos. No hay evidencia suficiente para afirmar «ninguna base califica los 40»: lo demostrado es su estructura de programa y la falta de una nota de ese programa en Aura. La calificación de una serie o de uno de sus cortos no equivale a la del conjunto. [Ficha de Animanimales](https://www.cinetecanacional.net/detallePelicula.php?FilmId=HO00009758&cinemaId=001).

| Estado de los 53 sin nota | Entradas | Evidencia |
|---|---:|---|
| Programa reconocido por esPrograma() | 34 | El código omite la búsqueda TMDB; JSON sin IDs |
| Programa/recopilación no reconocido por esa función | 6 | 5 búsquedas sin match en el log; 1 registro anterior conservado |
| Largometraje con match TMDB, sin imdbId | 7 | Todos tienen votos=0 en TMDB |
| Largometraje con TMDB e IMDb, sin fila IMDb ratings | 2 | Oh, fortuna; Boca vieja. TMDB también tiene 0 votos |
| Largometraje sin match TMDB | 4 | El jardín de María; Un lugar en la ciudad; Hojas secas; Cuando el fuego se convierte en ceniza |
| Total | 53 | Categorías excluyentes |

La corrida original terminó correctamente: leyó 1.713.427 filas de ratings y encontró 34 de los 36 IDs únicos solicitados. Con las dos versiones duplicadas, eso produce las 36 entradas calificadas. Los dos IDs sin fila son Oh, fortuna y Boca vieja. El log no registra una caída general de IMDb ni de TMDB. [GitHub Action auditado](https://github.com/hectorcflores/aura-app/actions/runs/33985764000).

El flujo descrito inicialmente requiere un matiz: **sinopsis y tráiler vienen primero de Cineteca**; TMDB rellena faltantes y aporta reseñas e identidad. TMDB también aporta su propio promedio si tiene al menos 3 votos; IMDb lo reemplaza con al menos 5. Las nueve entradas con tmdbId y sin nota tienen exactamente 0 votos TMDB: bajar el umbral de 3 a 1 no rescata ninguna de estas nueve.

## Los 13 largometrajes, entrada por entrada

Los valores de las columnas de entrada son literales del snapshot. Las identidades y calificaciones verificadas de la última columna son resultados adicionales de esta auditoría, no datos que Aura ya publique. «Sin fila en ratings» no permite conocer cuántos votos privados o aún no publicados existen; no significa «nadie la ha votado».

| filmId y título | Año / director | TMDB / IMDb en JSON / votos | Diagnóstico y comprobación adicional |
|---|---|---|---|
| HO00008666 — Deshilando luz | 2025 / Valentina Pelayo Atilano | 1446468 / null / 0 | TMDB 1446468 aceptado, 0 votos; no hay imdbId. Sin candidato validado en el cruce por títulos. Esto no demuestra inexistencia en IMDb. |
| HO00009847 — Oh, fortuna | 2025 / Luis Ayhllón | 1762928 / tt40196240 / 0 | TMDB 1762928, 0 votos; IMDb tt40196240 sí identificado, pero sin fila en ratings. IMDb lo fecha en 2026, Cineteca en 2025. |
| HO00009561 — Resurrection | 2025 / Bi Gan | 1572413 / null / 0 | TMDB 1572413 aceptado, 0 votos y sin imdbId. IMDb tt29002950 validado por título, año y director: 7,2 / 5491 votos. TMDB también publica la ficha 878608 de Bi Gan; falta resolver por qué se eligió 1572413. |
| HO00009555 — Tus dos muertos | 2025 / Daniel Castro Zimbrón | 1365486 / null / 0 | TMDB 1365486, 0 votos y sin imdbId. IMDb tt39054556 validado: 7,8 / 40 votos. Falta el enlace entre catálogos. |
| HO00010050 — El viaje de Marta | 2026 / Daniel Muchiut | 1744536 / null / 0 | TMDB 1744536, 0 votos y sin imdbId. El homónimo de la prueba no valida la película de Daniel Muchiut de 2026. Sin identidad IMDb confirmada. |
| HO00009790 — Las ruinas nuevas | 2024 / Manuel Embalse | 1252645 / null / 0 | TMDB 1252645, 0 votos y sin imdbId. IMDb tt38733725 validado por título, año y director; sin fila en ratings. Añadir el ID no produce una nota. |
| HO00009789 — Punto de fuga | 2025 / Bani Khoshnoudi | 1147168 / null / 0 | TMDB 1147168, 0 votos y sin imdbId. El cruce literal falla; el alias externo The Vanishing Point permite validar tt36455629: 6,1 / 16 votos. |
| HO00009953 — El jardín de María | 2025 / Jade Rainho | null / null / null | Log: sin match en TMDB. El JSON solo trae el título español. Con O Jardim de Maria se valida tt34058294 (2025, Jade Rainho, 72 min); sin fila en ratings. |
| HO00009184 — Boca vieja | 2025 / Yovegami Ascona Mora | 1357891 / tt37950235 / 0 | TMDB 1357891, 0 votos; IMDb tt37950235 sí identificado, pero sin fila en ratings. |
| HO00009949 — Norma también | 2025 / Natalia Vinelli | 1533167 / null / 0 | TMDB 1533167, 0 votos y sin imdbId. Sin candidato validado en el cruce por títulos. Letterboxd sí tiene ficha y reseñas; no se midió su promedio accesible vía API. |
| HO00010029 — Un lugar en la ciudad | 2025 / Gabriel Silvestre | null / null / null | Log: sin match en TMDB. Sin candidato IMDb validado. Oxford y Cambridge documentan el alias A Place in the City; tampoco produjo coincidencia movie en title.basics de esta copia. |
| HO00009792 — Hojas secas | null / Alexandre Koberidze | null / null / null | Log: sin match en TMDB. Año null en JSON; título original Khmeli potoli sí permite validar tt37537636 (2025, Aleksandre Koberidze, 186 min): 6,6 / 342 votos. |
| HO00010033 — Cuando el fuego se convierte en ceniza | 2025 / Michaela Grill | null / null / null | Log: sin match en TMDB. Falta título original. Alias When Fire Turns to Ash confirma tt40711134 de Michaela Grill; IMDb 2026 y 95 min frente a Cineteca 2025 y 96 min. Sin fila en ratings. |

Los alias adicionales se comprobaron con las fichas de [IMDb para Punto de fuga](https://www.imdb.com/fr/title/tt36455629/), [IMDb para El jardín de María](https://www.imdb.com/pt/title/tt34058294/), [la distribuidora de When Fire Turns to Ash](https://www.sixpackfilm.com/de/catalogue/3036/) y [Oxford para A Place in the City](https://talks.ox.ac.uk/talks/id/9ed851d1-8c3b-414f-9e8d-e6120f36c215/). Los IDs identificados se cruzaron con basics, crew, name.basics y ratings; las notas de este informe son las del dataset local, no las de los índices web, que pueden tener otra fecha.

## Los 40 programas y recopilaciones, entrada por entrada

Todos tienen publico=null, votos=null y tmdbId=null. IMDb es null o campo ausente; esa diferencia está preservada en el archivo de detalle. Se conserva el título literal, incluidos errores y truncamientos del JSON.

| filmId | Título literal | Evidencia de programa / causa en el flujo |
|---|---|---|
| HO00009980 | Shorts 2026: Competencia Mexicana de Animación 4 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009967 | Shorts 2026: Competencia Mexicana de Documental 4 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009999 | Shorts 2026: Competencia Mexicana de Ficción 4 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009987 | Shorts 2026: Neomex 4 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010023 | Contra corriente/Somos/El sueño de las luciérnagas | Original: Programa 3: Fronteras. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00010022 | Os filhos do underground contra o crânioda batata | Original: Programa 2: Infancias y juventudes. El título original dice Programa y director Varios; la heurística no lo detecta. El log registra búsqueda sin match. Sin TMDB ni enlace IMDb. |
| HO00009981 | Shorts 2026: Competencia Mexicana de Animación 5 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009968 | Shorts 2026: Competencia Mexicana de Documental 5 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010000 | Shorts 2026: Competencia Mexicana de Ficción 5 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010016 | Shorts 2026: Cortitos Cine Infantil 2 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009988 | Shorts 2026: Neomex 5 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010051 | Resiliencia/Sururu blanco/Bajo el polvo, nuestra t | Original: Programa 3: Medio ambiente y desarrollo sustentable. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00010024 | En busca de riquesas (casi) olvidadas/¿Quién puede | Original: Programa 4: Identidades indígenas y afrodescendientes. El título original dice Programa y director Varios; la heurística no lo detecta. El log registra búsqueda sin match. Sin TMDB ni enlace IMDb. |
| HO00010025 | Entre surcos y memoria: Sembrando resistencia en | Original: Programa 3: Derechos. El título original dice Programa y director Varios; la heurística no lo detecta. El log registra búsqueda sin match. Sin TMDB ni enlace IMDb. |
| HO00009969 | Shorts 2026: Competencia Mexicana de Documental 6 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010001 | Shorts 2026: Competencia Mexicana de Ficción 6 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009989 | Shorts 2026: Neomex 6 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009982 | Shorts 2026: Queer Shorts 1 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010027 | El eco de la mirada/No olvidemos/La casa de Ana/¿C | Original: Programa 1: Derechos. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00010026 | Ser, no ser, ser muchas/Rojo/La identidad que hemo | Original: Programa 1: Género. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00010028 | Vientre de luna/Menino/Capitana partera/Unlearning | Original: Programa 1: Identidades indígenas y afrodescendientes. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00009970 | Shorts 2026: Competencia Mexicana de Documental 7 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010002 | Shorts 2026: Competencia Mexicana de Ficción 7 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009990 | Shorts 2026: Neomex 7 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009983 | Shorts 2026: Queer Shorts 2 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009973 | Shorts 2026: Fantascorto 4 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009991 | Shorts 2026: Funshorts Cine de Comedia 1 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009992 | Shorts 2026: Muestra Mexicana 1 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009974 | Shorts 2026: Muestra Mexicana Experimental 1 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010036 | Cuidado, niños jugando/Ojo vigilante/La hora de la | Original: Programa 1: Fronteras. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00010034 | Infancia arrebatada/Imposible: la realidad del pet | Original: Programa 1: Medio ambiente y desarrollo sustentable. El título original dice Programa y director Varios; la heurística no lo detecta. El log registra búsqueda sin match. Sin TMDB ni enlace IMDb. |
| HO00010035 | Zapocelta/La fundación/Solo es cuestión de tiempo/ | Original: Programa 2: Arte y cultura/ vida cotidiana y cambio social. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |
| HO00010003 | Shorts 2026: Ecoshorts | Prefijo Shorts; omisión por esPrograma(). |
| HO00009971 | Shorts 2026: Fantascorto 1 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009972 | Shorts 2026: Fantascorto 2 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009993 | Shorts 2026: Muestra Mexicana 2 | Prefijo Shorts; omisión por esPrograma(). |
| HO00009758 | Animanimales | Original: ANIMANIMALES. Recopilación de episodios/cortos de Julia Ocker, confirmada en la ficha Cineteca. El script busca como película y el log registra sin match; no corresponde asignar la nota de la serie al programa. |
| HO00010015 | Shorts 2026: Cortitos Cine Infantil 1 | Prefijo Shorts; omisión por esPrograma(). |
| HO00010049 | (El niño que amaba las estrellas)/Una muerte bland | Original: Programa 1: Infancias y juventudes. El título original dice Programa y director Varios; no lo detecta esPrograma(). Entrada sin match conservada de una corrida anterior; no aparece búsqueda en el log actual. |
| HO00010021 | Que volá/Cuando el cielo vuela a ser luz/Restauro/ | Original: Programa 3: Vida cotidiana y cambio social. Programa identificado por el título; esPrograma() lo excluye de la búsqueda TMDB. Sin TMDB ni enlace IMDb. No se verificó una nota del programa como unidad. |

## La nota equivocada y las limitaciones de identificación

Agnus Dei, cordero de Dios (HO00003258) declara Alejandra Sánchez Orozco, 2010 y 80 minutos. Aura publica tmdbId=171691, imdbId=tt2233951, publico=5, votos=211. El dataset identifica ese IMDb como Agnus Dei, de Agim Sopi, 2012, 111 minutos. El documental correcto es tt1865291, Agnus Dei: Cordero de Dios, de Alejandra Sánchez Orozco, 2011, 84 minutos; tiene **6,9 y 58 votos** en la copia revisada. Las diferencias menores de año/duración de Cineteca deben conservarse como discrepancias de fuente.

El log prueba que se aceptó Agnus Dei (2012). El código acepta un título exacto con prioridad -1 cuando el año no es «lejos»: incluye diferencias de hasta cuatro años e incluso año desconocido. Devuelve el candidato antes de consultar créditos. No basta con endurecer el año: títulos iguales del mismo año también pueden pertenecer a directores diferentes. La comprobación secundaria actual usa solo el último componente del nombre, lo que también puede rechazar apellidos compuestos o aceptar homónimos. La prueba anterior, por ejemplo, no valida Memorias de un cuerpo que arde porque busca Furniss y IMDb registra Antonella Sudasassi; eso no demuestra que su nota sea incorrecta.

Resurrection también necesita revisar su identidad TMDB: el JSON usa 1572413, mientras [TMDB 878608](https://www.themoviedb.org/movie/878608) identifica la película de Bi Gan de 2025. No se pudo leer la ficha 1572413 ni consultar la API con una clave local; no afirmo si es un duplicado incompleto u otra obra. El resultado publicado sí demuestra que se usó una ficha sin votos ni puente IMDb, a pesar de existir una identidad IMDb correcta con votos.

## Qué reproduce la prueba de IMDb directo

Se volvió a ejecutar la prueba anterior completa sobre los archivos gzip existentes: title.basics, title.akas, title.crew, name.basics y title.ratings. Con los títulos del JSON y sus variantes, obtiene **3 notas nuevas**: Resurrection, Tus dos muertos y Hojas secas. También corrige Agnus Dei, que ya estaba calificada. Contar esa corrección como una cuarta ausencia recuperada sería incorrecto.

La búsqueda adicional por el alias The Vanishing Point aporta la **cuarta nota nueva**, Punto de fuga. Así, cuatro rescates sí están demostrados, pero no provienen todos de la búsqueda original. El límite de «solo cuatro posibles» tampoco está demostrado: los alias incompletos y las fichas sin identidad confirmada dejan incertidumbre.

Entre los 13 largometrajes hay 4 con nota IMDb recuperable, 5 identificados en IMDb sin fila en ratings y 4 sin identidad IMDb validada en las búsquedas realizadas. Los cinco sin nota son Oh, fortuna, Boca vieja, Las ruinas nuevas, El jardín de María y Cuando el fuego se convierte en ceniza.

| Archivo comprimido examinado | Bytes | MB decimales |
|---|---:|---:|
| title.basics.tsv.gz | 226,398,745 | 226.4 |
| title.crew.tsv.gz | 82,994,166 | 83.0 |
| title.akas.tsv.gz | 512,728,960 | 512.7 |
| name.basics.tsv.gz | 309,325,624 | 309.3 |
| title.ratings.tsv.gz | 8,653,302 | 8.7 |

El conjunto suma **1.140,1 MB, aproximadamente 1,14 GB**. Solo basics+crew suman 309,4 MB; además se necesita name.basics para traducir los IDs de director a nombres (618,7 MB entre los tres). Los títulos alternativos añaden 512,7 MB. Por tanto, «~1 GB» describe el conjunto ampliado, no únicamente basics+crew. Los datos de identidad se pueden cachear y renovar por separado; no es necesario descargarlos todos a diario para actualizar las notas. El archivo actual de ratings mide solo 8,65 MB.

## Propuesta, después del diagnóstico

Recomiendo primero resolver las identidades y registrar por qué falta cada nota. La versión mínima es un pequeño mapa persistente de filmId a IDs verificados, con título original, director, fecha y evidencia. Debe corregir Agnus Dei y añadir los cuatro IMDb recuperables; el script diario sigue descargando únicamente ratings para refrescar sus promedios. La identidad de una película cambia mucho menos que su calificación: separar ambas tareas evita repetir la misma búsqueda y el mismo error cada día. Las nuevas coincidencias deben confirmar director, comparar año y duración, y dejar los casos ambiguos pendientes en lugar de escoger el primer resultado.

Eso llevaría **36/89 a 40/89 (44,9 %)** y corregiría Agnus Dei. Entre las 49 entradas de largometrajes, sería **40/49 (81,6 %)** frente a 36/49 (73,5 %). El porcentaje actual cuenta una nota incorrecta; quitarla sin reemplazarla dejaría 35. Estos porcentajes son por entrada comercial de Cineteca, no por obra única: DOB/SUB duplica dos películas. Cambiar el denominador no es recuperar datos; ambas métricas deben mantenerse visibles. Aun calificando todos los largometrajes, el máximo sería 49/89 (55,1 %) si no existen notas específicas de los programas.

Si la prioridad es **una sola integración externa de enriquecimiento**, probaría MDBList como candidato antes de migrar. Su API resuelve IDs de varios catálogos, ofrece ratings y votos, y sus fichas públicas incluyen dirección, sinopsis y tráiler. En Resurrection reúne IMDb, TMDB y Letterboxd. Es un único proveedor técnico que agrega varias fuentes originales: la interfaz debe conservar la atribución de cada nota. Su cobertura efectiva para estos 13 largometrajes, la búsqueda desde títulos de Cineteca y la disponibilidad de reseñas en API todavía deben medirse. Una ficha pública no prueba que todos sus campos se entreguen por la API. [API de MDBList](https://api.mdblist.com/), [ejemplo público de Resurrection](https://mdblist.com/movie/2tlc1-resurrection?cache=1).

| Alternativa | Qué simplifica | Límite comprobado o pendiente |
|---|---|---|
| Mantener TMDB + ratings y cachear IDs verificados | Cambio mínimo; cuatro rescates comprobados; descarga pequeña | Conserva dos proveedores y no crea votos para películas sin promedio |
| Solo TMDB | Ya cubre metadatos, créditos, vídeos y reseñas | Nueve fichas aceptadas sin nota tienen cero votos; no hay mejora drástica demostrada. El JSON sobreescribe las notas/votos TMDB al aplicar IMDb, por lo que no permite calcular cuántas de las 36 se conservarían |
| OMDb | Búsqueda por título/año o IMDb ID; posible simplificación de identificación y calificación | Cobertura de los casos reales no probada; su API documentada no sustituye los endpoints de vídeos y reseñas TMDB |
| MDBList | Agrega varias calificaciones detrás de una API | Candidato para ensayo; falta medir resolución por título, cobertura, campos y acceso efectivo. No garantiza una calificación de cada programa |
| Letterboxd directo | Tiene actividad sobre cine minoritario: Deshilando Luz y Norma también tienen reseñas | Acceso API por solicitud, con exclusiones explícitas para proyectos privados/personales y otros usos; no es una dependencia disponible por defecto |

La evidencia de opciones se consultó en [TMDB](https://developer.themoviedb.org/reference/movie-details), [OMDb](https://www.omdbapi.com/), [MDBList](https://api.mdblist.com/) y [acceso a Letterboxd](https://letterboxd.com/api-beta/). La existencia de [Deshilando Luz en Letterboxd](https://letterboxd.com/film/deshilando-luz/) y [Norma también](https://letterboxd.com/film/norma-tambien/details/) muestra actividad fuera de IMDb/TMDB, pero no establece una cobertura porcentual de una API alternativa.

El siguiente experimento debe consultar los 13 largometrajes faltantes y usar las 36 entradas calificadas como control, incluyendo los homónimos de Agnus Dei. Mediría identidades correctas, notas con votos, conservación de las notas actuales, metadatos disponibles y número de consultas. Solo sustituiría las integraciones si el candidato añade cobertura comprobada y no introduce coincidencias incorrectas ni pérdidas no aceptadas. Para comparar notas de comunidades distintas, conservaría fuente, escala y votos; no mezclaría un porcentaje de críticas favorables con una media de usuarios en un único promedio.

Para los programas, la mejora útil es mostrar «Programa de cortos — sin calificación del conjunto», su composición y duración. Puntuar automáticamente el conjunto a partir de sus piezas produciría una métrica propia, no una calificación publicada. Además, el scraper actual toma a veces la sinopsis de un solo corto; en Ser, no ser, ser muchas… guarda incluso texto de atención a boletos. Eso refuerza la necesidad de distinguir programa de película antes del enriquecimiento.

## Evidencia y límites

Se conservaron el snapshot exacto y su SHA-256, el extracto del Action, la repetición del matcher anterior, una extracción independiente de los IDs verificados y un JSON/CSV con exactamente 53 registros. provenance.json registra tamaño y hash de los cinco gzip locales. No se descargaron de nuevo; las cifras IMDb son de esa copia del 5 de septiembre y pueden diferir de las páginas web o de futuras corridas.

El JSON por sí solo no permite distinguir «sin imdb_id en respuesta», «falló la consulta de detalle» o «ficha equivocada/incompleta» en los siete casos con TMDB y sin IMDb. El log tampoco conserva respuestas ni candidatos completos. Por eso las causas que exceden esos datos se mantienen como pendientes, no como certezas inventadas. Tres entradas conservadas ni siquiera tienen el campo imdbId. Para futuros diagnósticos, cada ficha debería guardar estado de búsqueda, candidato, validación de identidad, estado HTTP y motivo de ausencia, además de separar votos TMDB de votos IMDb.

Los archivos replay-original-match.mjs y verify-target-ids.mjs documentan las dos comprobaciones. El primero reproduce deliberadamente la heurística antigua por apellido y no es una propuesta de matcher de producción. No se cambió el script productivo ni el JSON publicado.
