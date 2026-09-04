# Aura

La cartelera de la **Cineteca Nacional** — las tres sedes, de hoy a una semana — con
sinopsis, tráiler, score del público y reseñas de cada película. Arranca en Xoco y hoy.

Es una app estática más del ecosistema de [hectorcflores.github.io](https://hectorcflores.github.io):
un solo archivo HTML, sin build, sin framework, sin servidor. Un GitHub Action arma la
cartelera cada mañana y la commitea como JSON; la página solo lo lee.

**En vivo:** https://hectorcflores.github.io/aura-app/app/

## Cómo funciona

```
GitHub Action (06:37 CDMX, diario)
  └─ scripts/build_cartelera.mjs
       1. Pide al endpoint AJAX del sitio (data/cartelera.php) cada sede × cada día
          de la semana; cada película única se enriquece una sola vez
       2. Por película: TMDB (match + imdb_id) → OMDb (Rotten Tomatoes, IMDb)
                                               → TMDB reviews (extractos)
       3. Escribe app/data/cartelera.json y lo commitea si cambió
GitHub Pages
  └─ app/index.html — lee ese JSON y lo pinta
```

La Cineteca publica cada película como
`Título (Título original, Dir.: Nombre, País, Año, Dur.: N min.)`, y de ahí sale la ficha.
Como los títulos vienen en español y OMDb indexa por título original, el match pasa
primero por TMDB para conseguir el `imdb_id`.

## Configuración

Dos secrets en **Settings → Secrets and variables → Actions**:

| Secret | De dónde | Para qué |
|---|---|---|
| `TMDB_API_KEY` | [themoviedb.org](https://www.themoviedb.org/settings/api) — gratis | Match de película, `imdb_id` y reseñas |
| `OMDB_API_KEY` *(opcional)* | [omdbapi.com](https://www.omdbapi.com/apikey.aspx) — gratis | Rotten Tomatoes y rating de IMDb |

Con solo `TMDB_API_KEY` la app muestra un score (el promedio de votos de TMDB) y las
reseñas; la columna de crítica no aparece. Si se agrega `OMDB_API_KEY`, aparece sola
con el porcentaje de Rotten Tomatoes. Sin ninguna de las dos el Action **no falla**:
publica la cartelera sin scores ni reseñas, porque saber qué hay hoy en Xoco ya sirve.

Además hay que activar **Settings → Pages → Source: `main` / root**.

## Desarrollo

```bash
npm install
npm run dry     # imprime el JSON sin escribir nada
npm run build   # escribe app/data/cartelera.json
```

Para ver la app: `npx serve app` (o cualquier servidor estático — `fetch` no funciona
con `file://`).

## Notas de datos

- **Sin Rotten Tomatoes es normal.** Buena parte de lo que programa la Cineteca
  (retrospectivas, cine mexicano) no está en RT. Esas películas muestran `—`; si tampoco
  hay Metacritic, la celda queda vacía y ya. No es un error.
- **El público sale de IMDb** cuando OMDb lo tiene; si no, del `vote_average` de TMDB,
  y la fuente se indica bajo los scores.
- **Las reseñas son de TMDB**, escritas por sus usuarios, recortadas a un extracto y
  atribuidas a su autor.
- **La sinopsis y el tráiler salen de la ficha de la Cineteca** (`detallePelicula.php`);
  si esa página no los trae, entran el resumen y el tráiler oficial de TMDB. El tráiler
  se reproduce incrustado y en silencio, sin salir de la app.
- **El scraper depende del HTML de la Cineteca.** Si el sitio cambia de estructura, el
  Action falla ruidosamente ("Cero películas") en vez de publicar una cartelera vacía.

## Estructura

```
app/index.html            la app entera
app/data/cartelera.json   lo que escribe el Action
scripts/build_cartelera.mjs
prototypes/               las variaciones de diseño que se exploraron;
                          ia-5-detalle-ELEGIDO.html es la que se construyó
```
