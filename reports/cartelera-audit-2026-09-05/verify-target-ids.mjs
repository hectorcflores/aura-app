import {createReadStream,writeFileSync,statSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
const dir=process.argv[2], out=process.argv[3];
const ids=new Set(['tt36455629','tt34058294','tt40711134','tt1865291','tt2233951','tt29002950','tt39054556','tt37537636','tt40196240','tt37950235','tt38733725']);
const records={};const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const queries=new Set(['a place in the city','norma tambien','deshilando luz','el viaje de marta']);
async function* lines(file){yield* createInterface({input:createReadStream(`${dir}/${file}.tsv.gz`).pipe(createGunzip()),crlfDelay:Infinity});}
for await (const l of lines('title.basics')){const c=l.split('\t');if(ids.has(c[0])||c[1]==='movie'&&[c[2],c[3]].some(t=>queries.has(norm(t))))records[c[0]]={id:c[0],type:c[1],title:c[2],original:c[3],year:c[5],minutes:c[7]};}
console.log('basics',Object.keys(records).length);
const nids=new Set();for await(const l of lines('title.crew')){const [id,ds]=l.split('\t');if(records[id]){records[id].directors=ds.split(',');ds.split(',').forEach(x=>nids.add(x));}}
const names={};for await(const l of lines('name.basics')){const [id,n]=l.split('\t');if(nids.has(id))names[id]=n;}
for (const r of Object.values(records))r.directors=r.directors.map(id=>({id,name:names[id]}));
for await(const l of lines('title.ratings')){const [id,r,v]=l.split('\t');if(records[id])records[id].rating={value:Number(r),votes:Number(v)};}
const sizes=Object.fromEntries(['title.basics','title.crew','title.akas','name.basics','title.ratings'].map(n=>[n,statSync(`${dir}/${n}.tsv.gz`).size]));writeFileSync(out,JSON.stringify({sizes,records},null,2)+'\n');console.log(JSON.stringify({sizes,records},null,2));
