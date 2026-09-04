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

// Las tres sedes de la Cineteca, con el cinemaId que usa el sitio.
const SEDES = [
  { id: "003", nombre: "Xoco",                  corto: "Xoco" },
  { id: "001", nombre: "Chapultepec",           corto: "Chapultepec" },
  { id: "002", nombre: "Cineteca de las Artes", corto: "Las Artes" },
];
const SEDE = SEDES[0];                       // la de referencia para leer el cascarón
const SHELL = "https://www.cinetecanacional.net/cartelera.php?cinemaId=003";
SEDE.url = SHELL;

// Fechas en hora de la Ciudad de México: hoy y los seis días siguientes (lo que
// ofrece el selector del sitio). Las que no tengan funciones en ninguna sede se
// descartan al final.
const fmtCDMX = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });
const HOY_CDMX = fmtCDMX.format(new Date());
const FECHAS = Array.from({ length: 7 }, (_, i) => fmtCDMX.format(new Date(Date.now() + i * 864e5)));

const TMDB_KEY = process.env.TMDB_API_KEY?.trim();
const OMDB_KEY = process.env.OMDB_API_KEY?.trim();
const UA = "aura-app (+https://github.com/hectorcflores/aura-app)";

const log = (...a) => console.log(...a);
const dormir = ms => new Promise(r => setTimeout(r, ms));

/**
 * fetch con reintentos y timeout: las APIs fallan de vez en cuando y un run
 * diario no debe morir por eso; y una petición que nunca responde no debe
 * colgar el build entero (sin timeout, fetch espera indefinidamente).
 */
async function traer(url, { intentos = 3, timeoutMs = 15000, ...opts } = {}) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(timeoutMs),
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

/**
 * cartelera.php es un cascarón: al cargar, su JS hace POST a data/cartelera.php
 * con vista/fecha/cinema/eventId y pinta el `html` de la respuesta. Le pedimos
 * eso mismo, con los valores que el propio cascarón trae por defecto, salvo la
 * sede y la fecha, que fijamos nosotros.
 */
const ENDPOINT = "https://www.cinetecanacional.net/data/cartelera.php";

/** Valores por defecto que el cascarón manda en su POST (vista, formato de fecha, eventId). */
let DEFAULTS = null;
async function defaultsDelSitio() {
  if (DEFAULTS) return DEFAULTS;
  const shell = await traer(SHELL);
  if (!shell) throw new Error(`No se pudo leer la cartelera: ${SHELL}`);
  const $s = load(await shell.text());
  const fechaSitio = ($s("#fecha").val() ?? "").toString().trim();
  // Respetar el formato de fecha que el sitio usa por defecto.
  const formato = /^\d{2}\/\d{2}\/\d{4}$/.test(fechaSitio) ? "DD/MM/YYYY"
                : /^\d{2}-\d{2}-\d{4}$/.test(fechaSitio)  ? "DD-MM-YYYY"
                : "YYYY-MM-DD";
  DEFAULTS = { vista: ($s("#vista").val() ?? "").toString(), eventId: ($s("#eventId").val() ?? "").toString(), formato, fechaSitio };
  log(`  cascarón: vista="${DEFAULTS.vista}" fecha="${fechaSitio}" (${formato}) eventId="${DEFAULTS.eventId}"`);
  return DEFAULTS;
}
const fechaComoElSitio = (iso, formato) => {
  const [y, m, d] = iso.split("-");
  return formato === "DD/MM/YYYY" ? `${d}/${m}/${y}` : formato === "DD-MM-YYYY" ? `${d}-${m}-${y}` : iso;
};

/** El html de la cartelera de una sede en una fecha, vía el endpoint AJAX del sitio. */
async function htmlDeCartelera(sede, fechaIso) {
  const d = await defaultsDelSitio();
  const campos = { vista: d.vista, fecha: fechaComoElSitio(fechaIso, d.formato), cinema: sede.id, eventId: d.eventId };
  const r = await traer(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": SHELL,
    },
    body: new URLSearchParams(campos).toString(),
  });
  if (!r) return { html: "", status: 0, ct: "", origen: "data/cartelera.php" };
  const cuerpo = await r.text();
  let html;
  try { html = JSON.parse(cuerpo)?.html ?? ""; } catch { html = cuerpo; }
  return { html, status: r.status, ct: r.headers.get("content-type"), origen: "data/cartelera.php" };
}

async function scrapeCartelera(sede, fechaIso, diagnostico = false) {
  const { html, status, ct } = await htmlDeCartelera(sede, fechaIso);
  const res = { status, headers: { get: () => ct } };   // para el diagnóstico de abajo
  const $ = load(html.replace(/<\//g, " </"));
  const peliculas = [];
  const vistas = new Set();

  // Rejilla de pósters: cada tarjeta lleva onclick=location.href="detallePelicula.php?FilmId=…&cinemas=…"
  $('[onclick*="detallePelicula.php"]').each((_, el) => {
    const filmId = ($(el).attr("onclick") || "").match(/FilmId=([A-Za-z0-9]+)/i)?.[1];
    if (!filmId || vistas.has(filmId)) return;
    const titulo = $(el).find(".font-weight-bold").first().text().replace(/\s+/g, " ").trim();
    const fichaTxt = $(el).find(".small").first().text().replace(/\s+/g, " ").trim();
    const ficha = parseFicha(`${titulo} ${fichaTxt}`) || (titulo ? { titulo, tituloOriginal: null, director: null, pais: null, ano: null, duracion: null } : null);
    if (!ficha) return;
    vistas.add(filmId);
    peliculas.push({
      ...ficha, filmId,
      poster: $(el).find("img").first().attr("src") || null,
      urlCineteca: `https://www.cinetecanacional.net/detallePelicula.php?FilmId=${filmId}&cinemas=${sede.id}`,
      sede: sede.id, fecha: fechaIso,
      sala: null, horarios: [],                 // llegan desde la ficha
    });
  });

  // Respaldo: el formato de filas con horarios en línea (la vista de servidor de /sedes/).
  if (!peliculas.length) {
    const registrar = (bloque, filmId, hrefFicha = null) => {
      const texto = bloque.replace(/\s+/g, " ").trim();
      const ficha = parseFicha(texto); if (!ficha) return;
      const clave = filmId || ficha.titulo.toLowerCase(); if (vistas.has(clave)) return;
      const horarios = horariosDe(texto); if (!horarios.length) return;
      vistas.add(clave);
      peliculas.push({ ...ficha, filmId: filmId || null, poster: null,
        urlCineteca: hrefFicha ? new URL(hrefFicha, SHELL).href : SHELL,
        sede: sede.id, fecha: fechaIso, sala: salaDe(texto), horarios });
    };
    $('a[href*="detallePelicula.php"]').each((_, a) => {
      const href = $(a).attr("href") || "", filmId = href.match(/FilmId=([^&]+)/i)?.[1];
      let nodo = $(a);
      for (let i = 0; i < 6 && nodo.length; i++) {
        const t = nodo.text();
        if (/Dir\.?:/i.test(t) && /\d{1,2}:\d{2}/.test(t) && t.length < 2000) { registrar(t, filmId, href); return; }
        nodo = nodo.parent();
      }
    });
    if (!peliculas.length) $("tr, li, article").each((_, el) => {
      const t = $(el).text(); if (/Dir\.?:/i.test(t) && t.length < 2000) registrar(t, null);
    });
  }

  if (!peliculas.length && diagnostico) {
    const texto = $("body").text().replace(/\s+/g, " ").trim();
    log("  ── diagnóstico de la respuesta ──");
    log(`  HTTP ${res.status} · ${res.headers.get("content-type")} · ${html.length} bytes`);
    log(`  tarjetas onclick: ${$('[onclick*="detallePelicula.php"]').length} · enlaces: ${$("a").length} · "Dir.:": ${(html.match(/Dir\.?:/gi) || []).length}`);
    log(`  texto (primeros 600): ${texto.slice(0, 600)}`);
  }
  return peliculas;
}

// ------------------------------------------------------------ enriquecido

/** ID de YouTube en cualquier forma de URL (embed, watch, youtu.be). */
const youtubeDe = html =>
  html.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] || null;

/**
 * La ficha de cada película en la Cineteca trae la sinopsis y, casi siempre,
 * el tráiler. No conocemos su estructura de antemano, así que la sinopsis es
 * "el bloque de texto propio más largo que no sea la línea de ficha".
 */
const MESES = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8,
  septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12 };
const DIAS = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi;

/** Fechas (ISO) mencionadas en un texto: "2026-09-03", "3 de septiembre", "Jueves 03". */
function fechasEn(texto, fechaBase) {
  const out = new Set();
  for (const m of texto.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of texto.matchAll(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)/gi)) {
    const mes = MESES[m[2].toLowerCase()]; if (!mes) continue;
    let y = Number(fechaBase.slice(0, 4));
    if (mes < Number(fechaBase.slice(5, 7)) - 6) y++;               // vuelta de año
    out.add(`${y}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  if (!out.size) {
    // "Jueves 03": mismo mes que la base, o el siguiente si el día ya pasó.
    for (const m of texto.matchAll(/\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\b/gi)) {
      const d = Number(m[1]), base = new Date(fechaBase + "T12:00:00Z");
      const cand = new Date(base); cand.setUTCDate(d);
      if (cand < base) cand.setUTCMonth(cand.getUTCMonth() + 1);
      out.add(cand.toISOString().slice(0, 10));
    }
  }
  return [...out];
}

/**
 * Horarios de la ficha agrupados por sede y fecha. La ficha lista las funciones
 * de TODAS las sedes: cada hora va dentro de un enlace al sistema de boletos
 * (visSelectTickets.aspx?cinemacode=003&txtSessionId=…), y ese `cinemacode` es
 * la sede. Para la fecha subimos por los ancestros hasta el más pequeño que
 * mencione exactamente una; si ninguno la menciona, la hora queda bajo
 * `fechaBase`. Una hora sin enlace de boletos se atribuye a `sedeBase` (la sede
 * desde cuya rejilla llegamos a la ficha) y se cuenta en `sueltas`.
 * Devuelve { porSedeFecha: Map "sede|fecha" → {horarios,salas}, sueltas }.
 */
const sedeDelEnlace = href => (href || "").match(/cinemacode=(\d{3})/i)?.[1] || null;

function funcionesDeFicha($, fechaBase, sedeBase) {
  const porSedeFecha = new Map();
  let sueltas = 0;
  const anota = (sede, fecha, texto) => {
    const k = `${sede}|${fecha}`;
    const r = porSedeFecha.get(k) || { horarios: new Set(), salas: new Set() };
    horariosDe(texto).forEach(h => r.horarios.add(h));
    const sala = salaDe(texto); if (sala) r.salas.add(sala);
    porSedeFecha.set(k, r);
  };
  $("*").each((_, el) => {
    const propio = $(el).contents().filter((_, n) => n.type === "text").text();
    if (!/\b\d{1,2}:\d{2}\b/.test(propio)) return;
    const enlace = $(el).closest("a[href*='cinemacode=']");
    let sede = sedeDelEnlace(enlace.attr("href"));
    if (!sede) { sede = sedeBase; sueltas++; }
    let nodo = $(el), fecha = null;
    for (let i = 0; i < 8 && nodo.length; i++) {
      const fs = fechasEn(nodo.text(), fechaBase);
      if (fs.length === 1) { fecha = fs[0]; anota(sede, fecha, nodo.text()); break; }
      if (fs.length > 1) break;                                     // ya abarca varios días
      nodo = nodo.parent();
    }
    if (!fecha) anota(sede, fechaBase, propio);
  });
  return { porSedeFecha, sueltas };
}

/**
 * La ficha de cada película trae sinopsis, tráiler y los horarios por fecha.
 * La sala NO aparece en las páginas públicas del sitio (ni en la rejilla ni en
 * la ficha; solo la vería el sistema de boletos), así que `sala` queda en null
 * y la app oculta el campo. La sinopsis es "el bloque de texto propio más largo
 * que no sea la ficha".
 */
async function detalleCineteca(p, diagnostico = false) {
  const vacio = { sinopsis: null, youtube: null, porSedeFecha: new Map(), sueltas: 0 };
  if (!p.urlCineteca || !/detallePelicula/.test(p.urlCineteca)) return vacio;
  const r = await traer(p.urlCineteca);
  if (!r) return vacio;
  const html = await r.text();
  const $ = load(html.replace(/<\//g, " </"));

  const bloques = [];
  $("p, div, td, span, li").each((_, el) => {
    const propio = $(el).contents().filter((_, n) => n.type === "text").text().replace(/\s+/g, " ").trim();
    if (propio.length >= 120 && !/Dir\.?:/i.test(propio) && !/\b\d{1,2}:\d{2}\b/.test(propio)) {
      bloques.push({ tag: el.tagName, texto: propio });
    }
  });
  bloques.sort((a, b) => b.texto.length - a.texto.length);
  const sinopsis = bloques[0]?.texto || null;
  const youtube = youtubeDe(html);
  const { porSedeFecha, sueltas } = funcionesDeFicha($, p.fecha, p.sede);

  if (diagnostico) {
    log(`  ── ficha Cineteca de "${p.titulo}" (${p.urlCineteca}) ──`);
    log(`  ${html.length} bytes · youtube=${youtube || "no"} · candidatos a sinopsis=${bloques.length}`);
    bloques.slice(0, 2).forEach(b => log(`    <${b.tag}> ${b.texto.length}c: ${b.texto.slice(0, 90)}…`));
    const horas = html.match(/\b\d{1,2}:\d{2}\b/g) || [];
    log(`  horas en la ficha: ${horas.length} · sin enlace de boletos: ${sueltas} · por sede|fecha: ${[...porSedeFecha].map(([k, r]) => `${k}→${[...r.horarios].join(",")}${r.salas.size ? " (" + [...r.salas].join("/") + ")" : ""}`).join("  ") || "(ninguna)"}`);
    const i = html.search(/\b\d{1,2}:\d{2}\b/);
    if (i >= 0) log(`  html crudo alrededor de la primera hora:\n${html.slice(Math.max(0, i - 700), i + 500)}`);
  }
  return { sinopsis, youtube, porSedeFecha, sueltas };
}

/** Tráiler oficial en TMDB, en español si existe. */
async function trailerTmdb(tmdbId) {
  for (const lang of ["es-MX", "es", "en-US"]) {
    const r = await json(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_KEY}&language=${lang}`);
    const yt = (r?.results || []).filter(v => v.site === "YouTube" && v.key);
    const v = yt.find(v => v.type === "Trailer") || yt.find(v => v.type === "Teaser");
    if (v) return v.key;
  }
  return null;
}

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

async function enriquecer(p, ficha) {
  const salida = {
    ...p,
    sinopsis: null, sinopsisFuente: null, trailer: null, trailerFuente: null,
    critica: null, criticaFuente: null, publico: null, publicoFuente: null,
    resenas: [], urlImdb: null,
  };

  // Lo que dice la propia Cineteca va primero; TMDB rellena lo que falte.
  if (ficha.sinopsis) { salida.sinopsis = ficha.sinopsis; salida.sinopsisFuente = "Cineteca Nacional"; }
  if (ficha.youtube)  { salida.trailer = ficha.youtube;   salida.trailerFuente = "Cineteca Nacional"; }

  if (!TMDB_KEY) return salida;

  const hit = await buscarEnTmdb(p);
  if (!hit) { log(`  · sin match en TMDB: ${p.titulo}`); return salida; }

  const detalle = await json(`https://api.themoviedb.org/3/movie/${hit.id}?api_key=${TMDB_KEY}&language=es-MX`);
  if (!salida.sinopsis && detalle?.overview?.trim()) {
    salida.sinopsis = detalle.overview.trim(); salida.sinopsisFuente = "TMDB";
  }
  if (!salida.trailer) {
    const key = await trailerTmdb(hit.id);
    if (key) { salida.trailer = key; salida.trailerFuente = "TMDB"; }
  }
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

const claveDe = p => p.filmId || `${p.titulo}|${p.ano || ""}`.toLowerCase();

async function main() {
  if (!TMDB_KEY) log("! Falta TMDB_API_KEY — la cartelera saldrá sin scores ni reseñas.");
  else if (!OMDB_KEY) log("! Falta OMDB_API_KEY — sin Rotten Tomatoes; el público vendrá de TMDB.");

  // 1) Tarjetas de cada sede en cada fecha (aún sin horarios).
  const tarjetas = [];
  for (const fecha of FECHAS) {
    for (const sede of SEDES) {
      const esReferencia = fecha === HOY_CDMX && sede.id === SEDE.id;
      const t = await scrapeCartelera(sede, fecha, esReferencia);
      log(`  ${sede.corto.padEnd(11)} ${fecha}: ${t.length} película(s)`);
      tarjetas.push(...t);
      await dormir(120);
    }
  }
  if (!tarjetas.length) throw new Error("Cero películas en todas las sedes y fechas: la estructura del sitio probablemente cambió.");

  // 2) Una ficha por película: trae los horarios de todas las sedes por fecha,
  //    más sinopsis y tráiler.
  const fichas = new Map();          // clave de película → { porSedeFecha, sueltas, sinopsis, youtube }
  let primera = true, sueltas = 0;
  for (const t of tarjetas) {
    const k = claveDe(t);
    if (fichas.has(k)) continue;
    const f = await detalleCineteca(t, primera); primera = false;
    fichas.set(k, f);
    sueltas += f.sueltas;
    await dormir(100);
  }
  if (sueltas) log(`  · ${sueltas} hora(s) sin enlace de boletos, atribuidas a la sede de la rejilla`);

  // 3) Funciones: la tarjeta (sede, fecha) toma los horarios de esa sede y fecha en la ficha.
  //    Si la ficha no marca fechas, sus horarios se aplican a la fecha de la tarjeta.
  const funciones = [];
  let sinHorario = 0;
  for (const t of tarjetas) {
    const r = fichas.get(claveDe(t))?.porSedeFecha.get(`${t.sede}|${t.fecha}`);
    const horarios = r ? [...r.horarios].sort() : t.horarios;
    const sala = r && r.salas.size ? [...r.salas].join(" · ") : t.sala;
    if (!horarios.length) sinHorario++;
    funciones.push({ sede: t.sede, fecha: t.fecha, pelicula: claveDe(t), sala, horarios });
  }
  if (sinHorario) log(`  · ${sinHorario} tarjeta(s) sin horarios para su sede y fecha`);

  // 4) Cada película única se enriquece una sola vez.
  const unicas = new Map();
  for (const t of tarjetas) if (!unicas.has(claveDe(t))) unicas.set(claveDe(t), t);
  log(`→ ${tarjetas.length} tarjetas · ${fichas.size} fichas · ${unicas.size} películas únicas`);

  const peliculas = {};
  for (const [clave, t] of unicas) {
    const { sede, fecha, sala, horarios, ...ficha } = await enriquecer(t, fichas.get(clave) || { sinopsis: null, youtube: null });
    peliculas[clave] = ficha;
    await dormir(120);
  }

  const fechas = FECHAS.filter(f => funciones.some(x => x.fecha === f));
  const salida = {
    generadoEn: new Date().toISOString(),
    hoy: HOY_CDMX,
    sedes: SEDES.map(({ id, nombre, corto }) => ({ id, nombre, corto })),
    fechas, peliculas, funciones,
  };

  const vals = Object.values(peliculas);
  log(`  ${vals.filter(p => p.publico != null).length}/${vals.length} con público, `
    + `${vals.filter(p => p.resenas.length).length} con reseñas, `
    + `${vals.filter(p => p.sinopsis).length} con sinopsis, `
    + `${vals.filter(p => p.trailer).length} con tráiler, `
    + `${vals.filter(p => p.poster).length} con póster · ${funciones.filter(f => f.horarios.length).length}/${funciones.length} funciones con horario · fechas: ${fechas.join(", ")}`);

  if (DRY) { log(JSON.stringify(salida, null, 2).slice(0, 3000)); return; }
  await mkdir(dirname(SALIDA), { recursive: true });
  await writeFile(SALIDA, JSON.stringify(salida, null, 2) + "\n");
  log(`✓ ${SALIDA}`);
}

main().catch(e => { console.error("✗", e.message); process.exit(1); });
