// Diagnóstico: ¿un matcher título+año+director directo contra IMDb encuentra las películas de la cartelera?
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const DIR = process.argv[2];
if (!DIR) throw new Error("Uso: node replay-original-match.mjs DIRECTORIO_DATASETS [SALIDA_JSON]");
const d = JSON.parse(readFileSync(new URL("./cartelera.snapshot.json", import.meta.url), "utf8"));
const esPrograma = p => /^shorts\s+\d{4}/i.test(p.titulo || "") || (p.titulo || "").split("/").length >= 3 || p.director === "Varios";
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " y ").replace(/[^a-z0-9]+/g, " ").trim();
const SUFIJOS = /\s+(dob|sub|doblada|subtitulada|3d|4k|dcp|35mm|16mm)\.?$/i;

const pelis = Object.values(d.peliculas).filter(p => !esPrograma(p));
// consultas normalizadas por película
for (const p of pelis) {
  const qs = new Set();
  for (const t of [p.titulo, p.tituloOriginal]) {
    if (!t) continue;
    const base = t.replace(SUFIJOS, "").trim();
    for (const parte of base.split(/\s*\/\s*/)) {
      qs.add(norm(parte));
      qs.add(norm(parte.split(/[:,]/)[0]));
      qs.add(norm(parte.replace(/\s*\([^)]*\)\s*/g, " ")));
    }
  }
  p._qs = [...qs].filter(q => q.length >= 2);
}
const idx = new Map(); // norm title → [peli]
for (const p of pelis) for (const q of p._qs) (idx.get(q) || idx.set(q, []).get(q)).push(p);

const t0 = Date.now();
const lines = async function* (f) {
  const rl = createInterface({ input: createReadStream(`${DIR}/${f}`).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const l of rl) yield l;
};
const rss = () => (process.memoryUsage().rss / 1048576).toFixed(0) + " MB";

// 1) basics
const hits = new Map(); // tconst → {tconst,type,primary,original,year,pelis:Set}
let n = 0;
for await (const l of lines("title.basics.tsv.gz")) {
  if (n++ === 0) continue;
  const c = l.split("\t");
  const [tconst, type, primary, original, , year] = c;
  if (type === "tvEpisode") continue;
  const np = norm(primary), no = norm(original);
  const cand = new Set([...(idx.get(np) || []), ...(idx.get(no) || [])]);
  if (!cand.size) continue;
  hits.set(tconst, { tconst, type, primary, original, year: Number(year) || null, runtime: c[7], pelis: cand, via: "basics" });
}
console.log(`basics: ${n.toLocaleString()} filas, ${hits.size} candidatos, ${((Date.now() - t0) / 1000).toFixed(1)}s, rss ${rss()}`);

// 2) akas (solo títulos; agrega candidatos nuevos con región)
const t1 = Date.now(); n = 0; let akasHits = 0;
const akasPend = new Map();
for await (const l of lines("title.akas.tsv.gz")) {
  if (n++ === 0) continue;
  const tab1 = l.indexOf("\t"), tab2 = l.indexOf("\t", tab1 + 1), tab3 = l.indexOf("\t", tab2 + 1);
  const title = l.slice(tab2 + 1, tab3);
  const nt = norm(title);
  const cand = idx.get(nt);
  if (!cand) continue;
  const tconst = l.slice(0, tab1), region = l.slice(tab3 + 1).split("\t")[0];
  akasHits++;
  if (hits.has(tconst)) { cand.forEach(p => hits.get(tconst).pelis.add(p)); continue; }
  const e = akasPend.get(tconst) || { tconst, pelis: new Set(), regiones: new Set(), aka: title };
  cand.forEach(p => e.pelis.add(p)); e.regiones.add(region); akasPend.set(tconst, e);
}
console.log(`akas: ${n.toLocaleString()} filas, ${akasHits} coincidencias, ${akasPend.size} tconst nuevos, ${((Date.now() - t1) / 1000).toFixed(1)}s, rss ${rss()}`);

// necesito tipo/año de los tconst nuevos de akas → segunda pasada por basics (solo lookup)
const t2 = Date.now(); n = 0;
for await (const l of lines("title.basics.tsv.gz")) {
  if (n++ === 0) continue;
  const tconst = l.slice(0, l.indexOf("\t"));
  const e = akasPend.get(tconst); if (!e) continue;
  const c = l.split("\t");
  if (c[1] === "tvEpisode") continue;
  hits.set(tconst, { ...e, type: c[1], primary: c[2], original: c[3], year: Number(c[5]) || null, runtime: c[7], via: "akas:" + [...e.regiones].join("/") });
}
console.log(`basics(2ª pasada): ${((Date.now() - t2) / 1000).toFixed(1)}s`);

// 3) crew → directores de los candidatos
const t3 = Date.now(); n = 0;
for await (const l of lines("title.crew.tsv.gz")) {
  if (n++ === 0) continue;
  const tconst = l.slice(0, l.indexOf("\t"));
  const h = hits.get(tconst); if (!h) continue;
  h.dirs = l.split("\t")[1].split(",").filter(x => x !== "\\N");
}
const nconsts = new Set([...hits.values()].flatMap(h => h.dirs || []));
console.log(`crew: ${n.toLocaleString()} filas, ${nconsts.size} nconst de directores, ${((Date.now() - t3) / 1000).toFixed(1)}s, rss ${rss()}`);

// 4) name.basics → nombres
const t4 = Date.now(); n = 0; const names = new Map();
for await (const l of lines("name.basics.tsv.gz")) {
  if (n++ === 0) continue;
  const tab = l.indexOf("\t"), nc = l.slice(0, tab);
  if (!nconsts.has(nc)) continue;
  names.set(nc, l.slice(tab + 1, l.indexOf("\t", tab + 1)));
}
console.log(`name.basics: ${n.toLocaleString()} filas, ${((Date.now() - t4) / 1000).toFixed(1)}s, rss ${rss()}`);

// 5) ratings
const t5 = Date.now(); n = 0; const ratings = new Map();
for await (const l of lines("title.ratings.tsv.gz")) {
  if (n++ === 0) continue;
  const [tc, r, v] = l.split("\t");
  if (hits.has(tc)) ratings.set(tc, { r: Number(r), v: Number(v) });
}
console.log(`ratings: ${((Date.now() - t5) / 1000).toFixed(1)}s · total ${((Date.now() - t0) / 1000).toFixed(1)}s, rss ${rss()}`);

// 6) decisión por película: título ∧ año(±2 o desconocido) ∧ director(apellido)
const apellido = d => { const w = norm(d).split(" ").filter(x => x.length > 2); return w[w.length - 1]; };
const out = [];
for (const p of pelis) {
  const cands = [...hits.values()].filter(h => h.pelis.has(p));
  const scored = cands.map(h => {
    const dirNames = (h.dirs || []).map(nc => norm(names.get(nc) || ""));
    const dirOk = p.director && p.director !== "Varios" && apellido(p.director) && dirNames.some(dn => dn.split(" ").includes(apellido(p.director)));
    const dy = p.ano && h.year ? Math.abs(h.year - p.ano) : null;
    const yearOk = dy == null ? null : dy <= 2;
    return { h, dirOk, yearOk, dirNames };
  });
  const fuertes = scored.filter(s => s.dirOk && s.yearOk !== false);
  const medios = scored.filter(s => !s.dirOk && s.yearOk === true);
  const elegido = fuertes.length === 1 ? fuertes[0] : fuertes.length > 1 ? fuertes[0] : null;
  const rt = elegido && ratings.get(elegido.h.tconst);
  out.push({
    titulo: p.titulo, ano: p.ano, director: p.director, imdbActual: p.imdbId, fuente: p.publicoFuente,
    candidatos: cands.length, fuertes: fuertes.length, medios: medios.length,
    elegido: elegido ? `${elegido.h.tconst} ${elegido.h.type} "${elegido.h.primary}" ${elegido.h.year} dir=${elegido.dirNames.join("/")} via=${elegido.h.via}` : null,
    coincideConTmdb: elegido ? (p.imdbId ? elegido.h.tconst === p.imdbId : "n/a") : (p.imdbId ? false : "n/a"),
    rating: rt ? `${rt.r} (${rt.v} votos)` : elegido ? "sin fila en ratings" : null,
    medioDetalle: medios.slice(0, 4).map(s => `${s.h.tconst} ${s.h.type} "${s.h.primary}" ${s.h.year} dir=${s.dirNames.join("/")}`),
  });
}
writeFileSync(process.argv[3] || new URL("./imdb-recheck.json", import.meta.url), JSON.stringify(out, null, 1));
for (const o of out) {
  console.log(`\n${o.fuente === "IMDb" ? "[ok-tmdb]" : "[SIN CALIF]"} ${o.titulo} (${o.ano}, ${o.director}) actual=${o.imdbActual}`);
  console.log(`   candidatos=${o.candidatos} fuertes=${o.fuertes} medios=${o.medios} · elegido: ${o.elegido || "—"} · coincideTMDB=${o.coincideConTmdb} · ${o.rating || ""}`);
  if (!o.elegido && o.medioDetalle.length) o.medioDetalle.forEach(m => console.log(`     medio: ${m}`));
}
