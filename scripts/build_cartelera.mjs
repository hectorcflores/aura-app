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
  const { html, status, ct, origen } = await htmlDeCartelera(sede, fechaIso);
  const res = { status, headers: { get: () => ct } };   // para el diagnóstico de abajo

  // cheerio concatena el texto de nodos hermanos sin separador, así que
  // "<td>Sala 4</td><td>16:00</td>" se leería "Sala 416:00" — perdiendo la sala
  // y el primer horario. Un espacio antes de cada cierre de etiqueta lo evita.
  const $ = load(html.replace(/<\//g, " </"));

  const peliculas = [];
  const vistas = new Set();

  const registrar = (bloque, filmId, hrefFicha = null) => {
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
      urlCineteca: hrefFicha ? new URL(hrefFicha, SHELL).href : SHELL,
      sede: sede.id,
      fecha: fechaIso,
    });
  };

  // Cada película enlaza a su ficha. Subimos por los ancestros hasta el bloque
  // que ya contiene la ficha completa y los horarios.
  $('a[href*="detallePelicula.php"]').each((_, a) => {
    const href = $(a).attr("href") || "";
    const filmId = href.match(/FilmId=([^&]+)/i)?.[1];
    let nodo = $(a);
    for (let i = 0; i < 6 && nodo.length; i++) {
      const texto = nodo.text();
      if (/Dir\.?:/i.test(texto) && /\d{1,2}:\d{2}/.test(texto) && texto.length < 2000) {
        registrar(texto, filmId, href);
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
  if (!peliculas.length && diagnostico) {
    const texto = $("body").text().replace(/\s+/g, " ").trim();
    log("  ── diagnóstico de la respuesta ──");
    log(`  HTTP ${res.status} · ${res.headers.get("content-type")} · ${html.length} bytes`);
    log(`  <title>: ${$("title").text().trim() || "(vacío)"}`);
    log(`  enlaces: ${$("a").length} · con detallePelicula: ${(html.match(/detallePelicula/g) || []).length}`);
    log(`  ocurrencias de "Dir.:": ${(html.match(/Dir\.?:/gi) || []).length} · horas HH:MM: ${(html.match(/\b\d{1,2}:\d{2}\b/g) || []).length}`);
    log(`  texto (primeros 900): ${texto.slice(0, 900)}`);

    // El selector "ver por día": si lleva un parámetro de fecha, sirve para pedir otro día.
    const dias = [];
    $("a").each((_, a) => {
      const t = $(a).text().trim(), h = $(a).attr("href") || "";
      if (/^\d{2}$/.test(t) && h) dias.push(`${t}→${h}`);
    });
    log(`  selector de día: ${dias.slice(0, 4).join("  ") || "(sin enlaces con href)"}`);

    // La ficha no depende de la hora: validamos sinopsis/tráiler con el primer enlace que haya.
    const primerLink = $('a[href*="detallePelicula.php"]').first();
    const hrefFicha = primerLink.attr("href");
    const fid = hrefFicha?.match(/FilmId=([^&]+)/i)?.[1];
    if (fid) {
      await detalleCineteca({
        titulo: primerLink.text().replace(/\s+/g, " ").trim().slice(0, 60) || `FilmId ${fid}`,
        filmId: fid,
        urlCineteca: new URL(hrefFicha, SHELL).href,
      }, true);
    }

    // Sonda: ¿qué sede y cuántos horarios devuelve cada cinemaId ahora mismo?
    for (const id of ["001", "002", "003"]) {
      const r = await traer(`https://www.cinetecanacional.net/sedes/cartelera.php?cinemaId=${id}`);
      const h = r ? await r.text() : "";
      const sede = h.match(/CINETECA NACIONAL\s+(MÉXICO|CHAPULTEPEC|DE LAS ARTES)/i)?.[1] || "?";
      log(`  sonda cinemaId=${id}: sede=${sede} · horas=${(h.match(/\b\d{1,2}:\d{2}\b/g) || []).length}`
        + ` · "Dir.:"=${(h.match(/Dir\.?:/gi) || []).length} · detallePelicula=${(h.match(/detallePelicula/g) || []).length}`);
    }
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
async function detalleCineteca(p, diagnostico = false) {
  const vacio = { sinopsis: null, youtube: null };
  if (!p.filmId) return vacio;
  const r = await traer(p.urlCineteca);
  if (!r) return vacio;
  const html = await r.text();
  const $ = load(html.replace(/<\//g, " </"));

  const bloques = [];
  $("p, div, td, span, li").each((_, el) => {
    // Solo el texto directo del nodo, para no arrastrar contenedores enteros.
    const propio = $(el).contents().filter((_, n) => n.type === "text").text().replace(/\s+/g, " ").trim();
    if (propio.length >= 120 && !/Dir\.?:/i.test(propio) && !/\b\d{1,2}:\d{2}\b/.test(propio)) {
      bloques.push({ tag: el.tagName, texto: propio });
    }
  });
  bloques.sort((a, b) => b.texto.length - a.texto.length);
  const sinopsis = bloques[0]?.texto || null;
  const youtube = youtubeDe(html);

  if (diagnostico) {
    log(`  ── ficha Cineteca de "${p.titulo}" ──`);
    log(`  ${html.length} bytes · youtube=${youtube || "no"} · candidatos a sinopsis=${bloques.length}`);
    bloques.slice(0, 3).forEach(b => log(`    <${b.tag}> ${b.texto.length}c: ${b.texto.slice(0, 90)}…`));
  }
  return { sinopsis, youtube };
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

async function enriquecer(p) {
  const salida = {
    ...p,
    sinopsis: null, sinopsisFuente: null, trailer: null, trailerFuente: null,
    critica: null, criticaFuente: null, publico: null, publicoFuente: null,
    resenas: [], urlImdb: null,
  };

  // Lo que dice la propia Cineteca va primero; TMDB rellena lo que falte.
  const ficha = await detalleCineteca(p, enriquecer.primera);
  enriquecer.primera = false;
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

  // 1) Funciones crudas de cada sede en cada fecha.
  const funciones = [];
  for (const fecha of FECHAS) {
    for (const sede of SEDES) {
      const esReferencia = fecha === HOY_CDMX && sede.id === SEDE.id;
      const crudas = await scrapeCartelera(sede, fecha, esReferencia);
      log(`  ${sede.corto.padEnd(11)} ${fecha}: ${crudas.length} película(s)`);
      funciones.push(...crudas);
      await dormir(150);
    }
  }
  if (!funciones.length) throw new Error("Cero películas en todas las sedes y fechas: la estructura del sitio probablemente cambió.");

  // 2) Cada película única se enriquece una sola vez.
  const unicas = new Map();
  for (const f of funciones) if (!unicas.has(claveDe(f))) unicas.set(claveDe(f), f);
  log(`→ ${funciones.length} funciones · ${unicas.size} películas únicas`);

  const peliculas = {};
  enriquecer.primera = true;
  for (const [clave, p] of unicas) {
    const { sede, fecha, sala, horarios, ...ficha } = await enriquecer(p);
    peliculas[clave] = ficha;
    await dormir(120);
  }

  // 3) Fechas con al menos una función en alguna sede.
  const fechas = FECHAS.filter(f => funciones.some(x => x.fecha === f));

  const ahora = new Date();
  const salida = {
    generadoEn: ahora.toISOString(),
    hoy: HOY_CDMX,
    sedes: SEDES.map(({ id, nombre, corto }) => ({ id, nombre, corto })),
    fechas,
    peliculas,
    funciones: funciones.map(f => ({ sede: f.sede, fecha: f.fecha, pelicula: claveDe(f), sala: f.sala, horarios: f.horarios })),
  };

  const vals = Object.values(peliculas);
  log(`  ${vals.filter(p => p.critica != null).length}/${vals.length} con score de crítica, `
    + `${vals.filter(p => p.publico != null).length} con público, `
    + `${vals.filter(p => p.resenas.length).length} con reseñas, `
    + `${vals.filter(p => p.sinopsis).length} con sinopsis, `
    + `${vals.filter(p => p.trailer).length} con tráiler · fechas: ${fechas.join(", ")}`);

  if (DRY) { log(JSON.stringify(salida, null, 2).slice(0, 4000)); return; }
  await mkdir(dirname(SALIDA), { recursive: true });
  await writeFile(SALIDA, JSON.stringify(salida, null, 2) + "\n");
  log(`✓ ${SALIDA}`);
}

main().catch(e => { console.error("✗", e.message); process.exit(1); });
