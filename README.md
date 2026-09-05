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
       2. Por película: TMDB (match + imdb_id + reseñas)
       3. Baja el dataset de calificaciones de IMDb y cruza por imdb_id
       4. Escribe app/data/cartelera.json y lo commitea si cambió
GitHub Pages
  └─ app/index.html — lee ese JSON y lo pinta
```

La Cineteca publica cada película como
`Título (Título original, Dir.: Nombre, País, Año, Dur.: N min.)`, y de ahí sale la ficha.
Como los títulos vienen en español, el match pasa primero por TMDB para conseguir el
`imdb_id`; con ese id se busca la calificación en el dataset de IMDb, sin ambigüedad
de títulos.

## Configuración

Un secret en **Settings → Secrets and variables → Actions**:

| Secret | De dónde | Para qué |
|---|---|---|
| `TMDB_API_KEY` | [themoviedb.org](https://www.themoviedb.org/settings/api) — gratis | Match de película, `imdb_id` y reseñas |

Las calificaciones de IMDb salen del [dataset no comercial](https://datasets.imdbws.com/)
(`title.ratings.tsv.gz`): sin registro ni key, se baja entero en cada corrida (~9 MB,
~2 s) y no se cachea. Su licencia es de uso personal y no comercial y exige el texto de
atribución que aparece al pie de la app. Sin `TMDB_API_KEY` el Action **no falla**:
publica la cartelera sin scores ni reseñas, porque saber qué hay hoy en Xoco ya sirve.
Si la descarga de IMDb falla, tampoco: el público sale solo de TMDB y el log lo dice.

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

- **El público es una sola cifra en escala de 10**, y cifra, fuente y número de votos
  vienen siempre de la misma fuente: IMDb si tiene 5 votos o más; si no, TMDB si tiene
  3 o más; si no, `—`. La fuente y los votos se indican bajo el score. Buena parte de lo
  que programa la Cineteca (festival, cine mexicano reciente) casi nadie lo califica en
  TMDB; IMDb cubre bastante más, pero seguirá habiendo películas sin cifra. No es un error.
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
