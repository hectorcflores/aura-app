// Refresh the self-contained page from its editable CSS, JS and logo sources.
import {readFile,writeFile} from 'node:fs/promises';
const path='app/index.html';
let html=await readFile(path,'utf8');
const css=await readFile('app/style.css','utf8'),js=await readFile('app/app.js','utf8');
html=html.replace(/<style>[\s\S]*?<\/style>/,()=>'<style>'+css+'</style>');
html=html.replace(/<script>[\s\S]*?<\/script>/,()=>'<script>'+js+'</script>');
await writeFile(path,html);
