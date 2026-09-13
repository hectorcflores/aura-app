import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const app=resolve(process.argv[2]||'app');
const output=resolve(process.argv[3]||'dist/server');
const files=['index.html','app.js','style.css','logo.svg','classic/index.html','classic/trailer-player.js','classic/favicon.svg','classic/imdb-logo.svg','trailer-player.js','favicon.svg','imdb-logo.svg','data/cartelera.json'];
const fallback=Object.fromEntries(await Promise.all(files.map(async file=>[file,await readFile(resolve(app,file),'utf8')])));
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'fallback.mjs'),'export const fallback = '+JSON.stringify(fallback)+';\n');
await copyFile(new URL('./worker.mjs',import.meta.url),resolve(output,'index.js'));
