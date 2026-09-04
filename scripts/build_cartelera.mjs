/**
 * Construye la cartelera del día de la Cineteca Nacional (sede Xoco) y la
 * enriquece con scores y reseñas.
 *
 *   Cineteca (scraping) → TMDB (match + imdb_id + reseñas) → OMDb (Rotten Tomatoes / IMDb)
 *
 * Escribe app/data/cartelera.json. Sin API keys sigue funcionando: produce la
 * cartelera sin scores en vez de fallar, porque la cartelera sola ya es útil.
 *
 * Uso: node scripts/build_cartelera.mjs [--dry]
 */

import { load } from "cheerio";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = resolve(RAIZ, "app/data/cartelera.json");
const DRY = process.argv.includes("--dry");

const SEDE = {
  nombre: "Cineteca Nacional · Xoco",
  cinemaId: "001",
  url: "https://www.cinetecanacional.net/sedes/cartelera.php?cinemaId=001",
};

const TMDB_KEY = process.env.TMDB_API_KEY?.trim();
const OMDB_KEY = process.env.OMDB_API_KEY?.trim();
const UA = "aura-app (+https://github.com/hectorcflores/aura-app)";

const log = (...a) => console.log(...a);
const dormir = ms => new Promise(r => setTimeout(r, ms));

/** fetch con reintentos: las APIs fallan de vez en cuando y un run diario no debe morir por eso. */
async function traer(url, { intentos = 3, ...opts } = {}) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { "User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9,en;q=0.8", ...opts.headers },
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null;              // 404 y demás: no hay dato, no es un fallo
      return res;
    } catch (e) {
      ultimo = e;
      if (i < intentos) await dormir(500 * 2 ** (i - 1));
    }
  }
  log(`  ! ${url.replace(/api_key=[^&]+/, "api_key=***")} → ${ultimo?.message}`);
  return null;
}

const json = async (url, opts) => (await traer(url, opts))?.json() ?? null;

// ---------------------------------------------------------------- scraping

/**
 * La Cineteca escribe cada película como:
 *   "Título (Título original, Dir.: Nombre Apellido, País, 2024, Dur.: 118 min.)"
 * El título original y varios de los campos internos pueden faltar.
 */
export function parseFicha(texto) {
  const limpio = texto
    .replace(/^CINETECA NACIONAL\s*(MÉXICO|DE LAS ARTES|CHAPULTEPEC)?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const conParentesis = limpio.match(/^(.+?)\s*\(([^)]*Dir\.?:[^)]*)\)/i);
  if (!conParentesis) return null;

  const titulo = conParentesis[1].trim();
  const dentro = conParentesis[2];
  const campos = dentro.split(",").map(s => s.trim()).filter(Boolean);

  const sinPuntoFinal = t => t.trim().replace(/\.+$/, "").trim();
  const director = sinPuntoFinal(dentro.match(/Dir\.?:\s*([^,]+)/i)?.[1] || "") || null;
  const ano = Number(dentro.match(/\b(?:19|20)\d{2}\b/)?.[0]) || null;
  const duracion = Number(dentro.match(/Dur\.?:\s*(\d+)\s*min/i)?.[1]) || null;

  // El título original, cuando existe, es el primer campo y no lleva etiqueta.
  const primero = campos[0];
  const esEtiquetado = /^(Dir\.?:|Dur\.?:)/i.test(primero || "") || /^\d{4}$/.test(primero || "");
  const tituloOriginal = !esEtiquetado && primero && primero !== titulo ? primero : null;

  // El país es el campo entre el director y el año.
  const iDir = campos.findIndex(c => /^Dir\.?:/i.test(c));
  const iAno = campos.findIndex(c => /^(?:19|20)\d{2}$/.test(c));
  const pais = iDir >= 0 && iAno > iDir + 1
    ? sinPuntoFinal(campos.slice(iDir + 1, iAno).join(", ")) || null
    : null;

  return titulo.length > 1 ? { titulo, tituloOriginal, director, pais, ano, duracion } : null;
}

const horariosDe = t => [...new Set(t.match(/\b\d{1,2}:\d{2}\b/g) || [])].sort();
const salaDe = t => { const m = t.match(/Sala\s+([A-Z0-9]+)/i); return m ? `Sala ${m[1]}` : null; };

async function scrapeCartelera() {
  const res = await traer(SEDE.url);
  if (!res) throw new Error(`No se pudo leer la cartelera: ${SEDE.url}`);
  const html = await res.text();

  // cheerio concatena el texto de nodos hermanos sin separador, así que
  // "<td>Sala 4</td><td>16:00</td>" se leería "Sala 416:00" — perdiendo la sala
  // y el primer horario. Un espacio antes de cada cierre de etiqueta lo evita.
  const $ = load(html.replace(/<\//g, " </"));

  const peliculas = [];
  const vistas = new Set();

  const registrar = (bloque, filmId) => {
    const texto = bloque.replace(/\s+/g, " ").trim();
    const ficha = parseFicha(texto);
    if (!ficha) return;
    const clave = filmId || ficha.titulo.toLowerCase();
    if (vistas.has(clave)) return;
    const horarios = horariosDe(texto);
    if (!horarios.length) return;                 // sin funciones no va en la cartelera de hoy
    vistas.add(clave);
    peliculas.push({
      ...ficha,
      sala: salaDe(texto),
      horarios,
      filmId: filmId || null,
      urlCineteca: filmId
        ? `https://www.cinetecanacional.net/sedes/detallePelicula.php?FilmId=${filmId}&cinemaId=${SEDE.cinemaId}`
        : SEDE.url,
    });
  };

  // Cada película enlaza a su ficha. Subimos por los ancestros hasta el bloque
  // que ya contiene la ficha completa y los horarios.
  $('a[href*="detallePelicula.php"]').each((_, a) => {
    const filmId = $(a).attr("href")?.match(/FilmId=([^&]+)/i)?.[1];
    let nodo = $(a);
    for (let i = 0; i < 6 && nodo.length; i++) {
      const texto = nodo.text();
      if (/Dir\.?:/i.test(texto) && /\d{1,2}:\d{2}/.test(texto) && texto.length < 2000) {
        registrar(texto, filmId);
        return;
      }
      nodo = nodo.parent();
    }
  });

  // Respaldo por si la página deja de usar esos enlaces: filas de tabla sueltas.
  if (!peliculas.length) {
    log("  · sin enlaces a detallePelicula.php, probando filas de tabla");
    $("tr, li, article").each((_, el) => {
      const texto = $(el).text();
      if (/Dir\.?:/i.test(texto) && texto.length < 2000) registrar(texto, null);
    });
  }

  // Cero películas es el único fallo que no se puede diagnosticar desde fuera:
  // el sitio no se alcanza desde otros lados. Dejamos en el log lo que devolvió.
  if (!peliculas.length) {
    const texto = $("body").text().replace(/\s+/g, " ").trim();
    log("  ── diagnóstico de la respuesta ──");
    log(`  HTTP ${res.status} · ${res.headers.get("content-type")} · ${html.length} bytes`);
    log(`  <title>: ${$("title").text().trim() || "(vacío)"}`);
    log(`  enlaces: ${$("a").length} · con detallePelicula: ${(html.match(/detallePelicula/g) || []).length}`);
    log(`  ocurrencias de "Dir.:": ${(html.match(/Dir\.?:/gi) || []).length} · horas HH:MM: ${(html.match(/\b\d{1,2}:\d{2}\b/g) || []).length}`);
    log(`  texto (primeros 900): ${texto.slice(0, 900)}`);
  }

  return peliculas;
}

// ------------------------------------------------------------ enriquecido

async function buscarEnTmdb({ titulo, tituloOriginal, ano }) {
  for (const q of [tituloOriginal, titulo].filter(Boolean)) {
    for (const conAno of ano ? [true, false] : [false]) {
      const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}`
        + `&query=${encodeURIComponent(q)}&language=es-MX${conAno ? `&year=${ano}` : ""}`;
      const r = await json(url);
      const hit = r?.results?.[0];
      // Con año libre exigimos que el año coincida ±1, o el match es ruido.
      if (hit && (conAno || !ano || Math.abs(Number((hit.release_date || "").slice(0, 4)) - ano) <= 1)) {
        return hit;
      }
    }
  }
  return null;
}

/** Recorta una reseña a una cita legible sin cortar a mitad de palabra. */
function extracto(texto, max = 190) {
  const plano = texto.replace(/\r/g, "").replace(/[*_>#`]/g, "").replace(/\s+/g, " ").trim();
  if (plano.length <= max) return plano;
  const corte = plano.slice(0, max);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("! "), corte.lastIndexOf("? "));
  return fin > max * 0.5 ? corte.slice(0, fin + 1).trim() : corte.slice(0, corte.lastIndexOf(" ")).trim() + "…";
}

async function resenasDe(tmdbId) {
  const r = await json(`https://api.themoviedb.org/3/movie/${tmdbId}/reviews?api_key=${TMDB_KEY}`);
  return (r?.results || [])
    .filter(x => x.content?.trim().length > 60)
    .slice(0, 3)
    .map(x => ({ texto: extracto(x.content), autor: x.author, url: x.url || null }));
}

/** OMDb trae Rotten Tomatoes y Metacritic en Ratings[], e IMDb en imdbRating. */
async function scoresDe(imdbId) {
  const r = await json(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${encodeURIComponent(imdbId)}`);
  if (!r || r.Response === "False") return null;
  const de = nombre => r.Ratings?.find(x => x.Source === nombre)?.Value;

  const rt = de("Rotten Tomatoes")?.match(/(\d+)%/)?.[1];
  const mc = de("Metacritic")?.match(/(\d+)\/100/)?.[1];
  const imdb = Number(r.imdbRating);

  return {
    critica: rt ? Number(rt) : mc ? Number(mc) : null,
    criticaFuente: rt ? "Rotten Tomatoes" : mc ? "Metacritic" : null,
    publico: Number.isFinite(imdb) ? imdb : null,
    publicoFuente: Number.isFinite(imdb) ? "IMDb" : null,
  };
}

async function enriquecer(p) {
  const salida = {
    ...p,
    critica: null, criticaFuente: null, publico: null, publicoFuente: null,
    resenas: [], urlImdb: null,
  };
  if (!TMDB_KEY) return salida;

  const hit = await buscarEnTmdb(p);
  if (!hit) { log(`  · sin match en TMDB: ${p.titulo}`); return salida; }

  const detalle = await json(`https://api.themoviedb.org/3/movie/${hit.id}?api_key=${TMDB_KEY}&language=es-MX`);
  salida.resenas = await resenasDe(hit.id);
  if (!salida.tituloOriginal && detalle?.original_title !== p.titulo) {
    salida.tituloOriginal = detalle?.original_title || null;
  }
  // Mucho de lo que programa la Cineteca tiene pocos votos; con 10 ya es un promedio y no una anécdota.
  salida.publico = hit.vote_count >= 10 ? Number(hit.vote_average?.toFixed(1)) : null;
  salida.publicoFuente = salida.publico != null ? "TMDB" : null;

  const imdbId = detalle?.imdb_id;
  if (imdbId) {
    salida.urlImdb = `https://www.imdb.com/title/${imdbId}/`;
    if (OMDB_KEY) {
      const s = await scoresDe(imdbId);
      if (s) {
        salida.critica = s.critica;
        salida.criticaFuente = s.criticaFuente;
        if (s.publico != null) { salida.publico = s.publico; salida.publicoFuente = s.publicoFuente; }
      }
    }
  }
  return salida;
}

// -------------------------------------------------------------------- main

const FECHA_LARGA = new Intl.DateTimeFormat("es-MX", {
  weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City",
});
const mayus = s => (s.charAt(0).toUpperCase() + s.slice(1)).replace(",", "");

async function main() {
  if (!TMDB_KEY) log("! Falta TMDB_API_KEY — la cartelera saldrá sin scores ni reseñas.");
  else if (!OMDB_KEY) log("! Falta OMDB_API_KEY — sin Rotten Tomatoes; el público vendrá de TMDB.");

  log(`→ Leyendo ${SEDE.url}`);
  const crudas = await scrapeCartelera();
  log(`  ${crudas.length} película(s) en cartelera`);
  if (!crudas.length) throw new Error("Cero películas: la estructura del sitio probablemente cambió.");

  const peliculas = [];
  for (const p of crudas) {
    peliculas.push(await enriquecer(p));
    await dormir(120);                            // cortesía con TMDB/OMDb
  }

  const ahora = new Date();
  const salida = {
    sede: SEDE.nombre,
    fecha: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(ahora),
    fechaTexto: mayus(FECHA_LARGA.format(ahora)),
    generadoEn: ahora.toISOString(),
    fuente: SEDE.url,
    peliculas,
  };

  const conCritica = peliculas.filter(p => p.critica != null).length;
  log(`  ${conCritica}/${peliculas.length} con score de crítica, `
    + `${peliculas.filter(p => p.resenas.length).length} con reseñas`);

  if (DRY) { log(JSON.stringify(salida, null, 2)); return; }
  await mkdir(dirname(SALIDA), { recursive: true });
  await writeFile(SALIDA, JSON.stringify(salida, null, 2) + "\n");
  log(`✓ ${SALIDA}`);
}

main().catch(e => { console.error("✗", e.message); process.exit(1); });
