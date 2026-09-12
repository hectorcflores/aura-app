import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Ejecutar las funciones reales de la página, sin copiar su lógica al test.
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('function notaActualizacion('), html.indexOf('/* cache:"no-store"'));
const TODAY = '2026-09-12';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-09-12T14:00:00Z'])); }
}
function page(search = '') {
  const context = vm.createContext({
    Date: FixedDate, Intl, URLSearchParams, location: { search }, nota: '', sub: {},
    conDatos: d => d?.funciones?.length && d?.sedes?.length && d?.fechas?.length,
    ORDENES: ['calificacion', 'horario'], pintaControles() {}, pinta() {},
    vacio(title, detail) { context.empty = { title, detail }; },
  });
  vm.runInContext(source, context);
  return context;
}
function data() {
  return { generadoEn: '2026-09-11T17:47:21Z', fechas: ['2026-09-11', TODAY],
    hoy: '2026-09-11', sedes: [{ id: '003' }], funciones: [{}], peliculas: {} };
}
test('JSON antiguo recibido correctamente avisa y selecciona hoy, no ayer', () => {
  const c = page('?fecha=2026-09-11'); const d = data(); c.arranca(d);
  assert.match(c.nota, /Sin actualizar hoy/);
  assert.equal(c.fecha, TODAY); assert.equal(d.hoy, TODAY);
  assert.deepEqual(d.fechas, [TODAY]);
});
test('la frescura se compara en CDMX, incluso al cruzar medianoche UTC', () => {
  const c = page();
  assert.match(c.notaActualizacion('2026-09-12T01:00:00Z', TODAY), /Sin actualizar hoy/);
  assert.equal(c.notaActualizacion('2026-09-12T12:00:00Z', TODAY), '');
});
test('una fecha de actualización ausente o inválida no aparenta datos actuales', () => {
  const c = page();
  for (const value of [null, '', 'incorrecta']) assert.match(c.notaActualizacion(value, TODAY), /No se pudo verificar/);
});
test('una cartelera completamente vencida no vuelve a mostrar fechas pasadas', () => {
  const c = page(); const d = data(); d.fechas = ['2026-09-11']; c.arranca(d);
  assert.match(c.empty.title, /venció/); assert.equal(c.fecha, undefined);
});
test('el aviso de copia local se conserva junto con la antigüedad', () => {
  const c = page(); c.nota = 'cartelera guardada'; c.arranca(data());
  assert.match(c.nota, /cartelera guardada/); assert.match(c.nota, /Sin actualizar hoy/);
});
