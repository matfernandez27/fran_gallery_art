import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, Timestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, listAll } from 'firebase/storage';
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Obras de ejemplo con la forma de los datos reales (incluye campos heredados de la migración).
const works = [
  { id: 'obraA', data: { titulo: 'Dilemas', descripcion: null, tecnica: 'acrilico sobre lienzo', medidas: '140 x 140 cm', anio: 2025, categoria: 'pintura', serie: 'personajes', price: 800, currency: 'USD', is_available: true, show_price: true, orden: 0, imagenes: [{ path: 'obras/a.webp', url: 'https://example.com/a.webp', name: 'a.webp' }], migrado_el: Timestamp.now() } },
  { id: 'obraB', data: { titulo: 'Construccion ', descripcion: 'texto', tecnica: 'tinta', medidas: '17 x 25 cm', anio: 2023, categoria: 'dibujo', serie: '', price: null, is_available: false, show_price: false, orden: 0, imagenes: [], migrado_el: Timestamp.now(), updatedAt: Timestamp.now() } },
  { id: 'obraC', data: { titulo: 'Paisaje', descripcion: null, tecnica: 'oleo', medidas: '', anio: null, categoria: '', serie: 'Paisaje', price: 150000, is_available: true, show_price: true, orden: 7, imagenes: [], createdAt: Timestamp.now() } },
];

const env = await initializeTestEnvironment({
  projectId: 'demo-rules-test',
  firestore: { rules: fs.readFileSync(REPO + '/firestore.rules', 'utf8') },
  storage: { rules: fs.readFileSync(REPO + '/storage.rules', 'utf8') },
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const w of works) await setDoc(doc(db, 'productos', w.id), w.data);
});

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('OK  ', name); } catch (e) { fail++; console.log('FAIL', name, '—', String(e.message).split('\n')[0].slice(0, 160)); } };
const anon = env.unauthenticatedContext(), rando = env.authenticatedContext('randoUid', { email: 'rando@example.com' }), admin = env.authenticatedContext('adminUid', { admin: true }), fakeAdmin = env.authenticatedContext('fakeUid', { admin: false });
const good = { titulo: 'Obra de prueba', descripcion: null, anio: 2025, categoria: 'pintura', serie: 'urbano', tecnica: 'óleo', medidas: '10 x 10 cm', price: 1000, currency: 'ARS', is_available: true, show_price: false, orden: 3, imagenes: [], createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
const wid = works[0].id;

console.log('--- Firestore ---');
await t('anónimo PUEDE leer el catálogo', () => assertSucceeds(getDocs(collection(anon.firestore(), 'productos'))));
await t('anónimo NO puede crear', () => assertFails(setDoc(doc(anon.firestore(), 'productos/x1'), good)));
await t('anónimo NO puede editar', () => assertFails(updateDoc(doc(anon.firestore(), 'productos', wid), { titulo: 'hack' })));
await t('anónimo NO puede borrar', () => assertFails(deleteDoc(doc(anon.firestore(), 'productos', wid))));
await t('usuario registrado común NO puede crear (el agujero encontrado)', () => assertFails(setDoc(doc(rando.firestore(), 'productos/x2'), good)));
await t('usuario registrado común NO puede editar', () => assertFails(updateDoc(doc(rando.firestore(), 'productos', wid), { titulo: 'hack' })));
await t('usuario registrado común NO puede borrar', () => assertFails(deleteDoc(doc(rando.firestore(), 'productos', wid))));
await t('usuario con claim admin=false NO puede escribir', () => assertFails(setDoc(doc(fakeAdmin.firestore(), 'productos/x3'), good)));
await t('nadie puede crear una colección "admins" para darse permisos', () => assertFails(setDoc(doc(rando.firestore(), 'admins/randoUid'), { ok: true })));
await t('admin PUEDE crear una obra válida', () => assertSucceeds(setDoc(doc(admin.firestore(), 'productos/nuevaObra'), good)));
await t('admin PUEDE borrar una obra', () => assertSucceeds(deleteDoc(doc(admin.firestore(), 'productos/nuevaObra'))));
await t('admin NO puede crear obra sin título', () => assertFails(setDoc(doc(admin.firestore(), 'productos/b1'), { ...good, titulo: '' })));
await t('admin NO puede meter campos desconocidos', () => assertFails(setDoc(doc(admin.firestore(), 'productos/b2'), { ...good, evil: '<script>' })));
await t('admin NO puede poner precio negativo', () => assertFails(setDoc(doc(admin.firestore(), 'productos/b3'), { ...good, price: -5 })));
await t('admin NO puede poner moneda inválida', () => assertFails(setDoc(doc(admin.firestore(), 'productos/b4'), { ...good, currency: 'EUR' })));
await t('admin NO puede poner año absurdo', () => assertFails(setDoc(doc(admin.firestore(), 'productos/b5'), { ...good, anio: 3000 })));
await t('admin NO puede poner título gigante', () => assertFails(setDoc(doc(admin.firestore(), 'productos/b6'), { ...good, titulo: 'x'.repeat(500) })));
await t('colección no listada (otra) cerrada para todos', () => assertFails(getDoc(doc(admin.firestore(), 'secretos/a'))));
// No bloquear al admin con datos reales: actualizar el campo "orden" de las 76 obras (como hace "Guardar orden")
let okReal = 0; const badReal = [];
for (const w of works) { try { await assertSucceeds(updateDoc(doc(admin.firestore(), 'productos', w.id), { orden: 5 })); okReal++; } catch { badReal.push(w.id + ' ' + w.data.titulo); } }
await t(`admin puede actualizar obras con la forma de los datos migrados (${okReal}/${works.length})`, async () => { if (badReal.length) throw new Error('rechazadas: ' + badReal.slice(0, 5).join(' | ')); });
await t('admin puede reordenar en lote (writeBatch)', async () => { const b = writeBatch(admin.firestore()); works.slice(0, 20).forEach((w, i) => b.update(doc(admin.firestore(), 'productos', w.id), { orden: i })); await assertSucceeds(b.commit()); });
await t('admin puede editar título/precio de una obra real', () => assertSucceeds(updateDoc(doc(admin.firestore(), 'productos', wid), { titulo: 'Editado', price: 5000, updatedAt: Timestamp.now() })));

console.log('--- Storage ---');
const bytes = new Uint8Array([1, 2, 3]);
await t('anónimo NO puede subir', () => assertFails(uploadBytes(ref(anon.storage(), 'obras/a.webp'), bytes, { contentType: 'image/webp' })));
await t('usuario común NO puede subir (el agujero encontrado)', () => assertFails(uploadBytes(ref(rando.storage(), 'obras/a.webp'), bytes, { contentType: 'image/webp' })));
await t('admin PUEDE subir una imagen', () => assertSucceeds(uploadBytes(ref(admin.storage(), 'obras/a.webp'), bytes, { contentType: 'image/webp' })));
await t('admin NO puede subir un .html', () => assertFails(uploadBytes(ref(admin.storage(), 'obras/x.html'), bytes, { contentType: 'text/html' })));
await t('admin NO puede subir fuera de obras/', () => assertFails(uploadBytes(ref(admin.storage(), 'otros/a.webp'), bytes, { contentType: 'image/webp' })));
await t('admin NO puede subir archivos de más de 15 MB', () => assertFails(uploadBytes(ref(admin.storage(), 'obras/big.webp'), new Uint8Array(16 * 1024 * 1024), { contentType: 'image/webp' })));
await t('anónimo NO puede listar el bucket (antes era público)', () => assertFails(listAll(ref(anon.storage(), 'obras'))));
await t('anónimo NO puede borrar', () => assertFails(deleteObject(ref(anon.storage(), 'obras/a.webp'))));
await t('usuario común NO puede borrar', () => assertFails(deleteObject(ref(rando.storage(), 'obras/a.webp'))));
await t('admin PUEDE borrar', () => assertSucceeds(deleteObject(ref(admin.storage(), 'obras/a.webp'))));

console.log(`\nResultado: ${pass} correctas, ${fail} fallidas`);
await env.cleanup();
process.exit(fail ? 1 : 0);
