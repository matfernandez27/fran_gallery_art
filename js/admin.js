// js/admin.js — Panel de administración
import { db, auth, storage } from "../src/firebaseConfig.js";
import {
    collection, doc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { SITE } from "./config.js";
import { esc, norm, clean, capitalize, imageUrls, installImageFallback, sortWorks, PLACEHOLDER_IMG } from "./utils.js";

// ---------------------------------------------------------------- Constantes
const PAGE_SIZE = 25;
const MAX_IMAGE_SIDE = 2400;       // px (lado mayor) al optimizar fotos
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const LIMITS = { titulo: 120, descripcion: 5000, tecnica: 200, medidas: 100, categoria: 60, serie: 60 };

// ---------------------------------------------------------------- Estado
const state = {
    all: [],                // todas las obras (ordenadas como se ven en el sitio)
    page: 1,
    query: "",
    editing: null,          // obra en edición (o null si es nueva)
    // Fotos de la obra, en el orden en que se van a guardar (la primera es la portada).
    // kind "saved": ya está en el servidor · kind "new": archivo recién elegido
    photos: [],             // { key, kind, url, path, name, file, rotation, broken }
    removed: [],            // fotos guardadas que se quitaron (se borran del servidor al guardar)
    formDirty: false,
    orderDirty: false,
    brokenByWork: new Map(),// id -> cantidad de fotos rotas (resultado de "Revisar imágenes")
    saving: false,
    editParam: new URLSearchParams(location.search).get("edit"),   // enlace "Editar" desde el index
};
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

const $ = (id) => document.getElementById(id);
const els = {
    alert: $("alert"), header: $("admin-header"), userEmail: $("user-email"),
    login: $("login-container"), loginForm: $("login-form"), loginButton: $("login-button"),
    works: $("works-container"), list: $("works-list"), count: $("works-count"),
    search: $("search-input"), orderBar: $("order-bar"), orderHint: $("order-hint"),
    saveOrder: $("save-order-button"), cancelOrder: $("cancel-order-button"),
    pagination: $("admin-pagination-controls"), prev: $("admin-prev-page"), next: $("admin-next-page"), pageInfo: $("admin-page-info"),
    formWrap: $("obra-form-container"), form: $("obra-form"), formTitle: $("form-title"), submit: $("submit-button"),
    photos: $("photos-list"), fileInput: $("imagenes"), dropzone: $("dropzone"),
    position: $("posicion"), positionMax: $("posicion-max"),
    brokenNote: $("broken-images-note"), checkImages: $("check-images-button"),
};

// ---------------------------------------------------------------- Avisos
let alertTimer;
function showAlert(message, type = "success", ms = 5000) {
    els.alert.textContent = message;
    els.alert.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[1001] px-5 py-3 rounded-sm shadow-lg text-sm font-medium w-[92%] max-w-md ${
        type === "error" ? "bg-red-50 text-red-800 border border-red-200"
        : type === "info" ? "bg-accent-soft text-accent-dark border border-accent/30"
        : "bg-green-50 text-green-800 border border-green-200"}`;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => els.alert.classList.add("hidden"), ms);
}

// ---------------------------------------------------------------- Vistas
function showLogin() {
    els.login.classList.remove("hidden");
    [els.header, els.works, els.formWrap].forEach((e) => e.classList.add("hidden"));
}
function showList() {
    els.login.classList.add("hidden");
    els.header.classList.remove("hidden");
    els.works.classList.remove("hidden");
    els.formWrap.classList.add("hidden");
    window.scrollTo({ top: 0 });
}
function showForm() {
    els.header.classList.remove("hidden");
    els.login.classList.add("hidden");
    els.works.classList.add("hidden");
    els.formWrap.classList.remove("hidden");
    window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- Autenticación
const AUTH_ERRORS = {
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/wrong-password": "Email o contraseña incorrectos.",
    "auth/user-not-found": "Email o contraseña incorrectos.",
    "auth/invalid-email": "El email no es válido.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos antes de volver a probar.",
    "auth/network-request-failed": "No hay conexión. Revisá tu internet.",
};

async function handleLogin(e) {
    e.preventDefault();
    els.loginButton.disabled = true;
    els.loginButton.textContent = "Ingresando…";
    try {
        await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
        $("password").value = "";
    } catch (error) {
        showAlert(AUTH_ERRORS[error.code] || "No se pudo iniciar sesión.", "error");
    } finally {
        els.loginButton.disabled = false;
        els.loginButton.textContent = "Ingresar";
    }
}

async function handleResetPassword() {
    const email = $("email").value.trim();
    if (!email) { showAlert("Escribí tu email arriba y volvé a tocar \"Olvidé mi contraseña\".", "info"); return; }
    try { await sendPasswordResetEmail(auth, email); } catch (error) { console.warn(error.code); }
    // Mismo mensaje exista o no la cuenta (no revelamos qué emails están registrados)
    showAlert("Si el email corresponde a una cuenta, te enviamos un enlace para restablecer la contraseña.", "info", 8000);
}

// Cierre de sesión automático por inactividad (mientras el panel está abierto)
let idleTimer;
function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!auth.currentUser) return;
    idleTimer = setTimeout(async () => {
        await signOut(auth);
        showAlert("Se cerró la sesión por inactividad.", "info", 8000);
    }, IDLE_LOGOUT_MS);
}
["pointerdown", "keydown", "scroll"].forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));

async function onUser(user) {
    if (!user) { clearTimeout(idleTimer); showLogin(); return; }
    // Solo las cuentas con el permiso "admin" pueden usar el panel (las reglas de Firebase lo exigen igualmente)
    let isAdmin = false;
    try { isAdmin = (await user.getIdTokenResult(true)).claims.admin === true; } catch (e) { console.warn(e); }
    if (!isAdmin) {
        showAlert("Esta cuenta no tiene permisos de administrador. Pedile a quien administra el sitio que te los asigne.", "error", 9000);
        await signOut(auth);
        return;
    }
    els.userEmail.textContent = user.email || "";
    showList();
    resetIdleTimer();
    await loadWorks();
    // Viene del botón "Editar" del index: abre directamente esa obra
    if (state.editParam) {
        const id = state.editParam;
        state.editParam = null;
        history.replaceState(null, "", location.pathname);
        if (state.all.some((w) => w.id === id)) openEdit(id);
        else showAlert("No se encontró esa obra (¿fue eliminada?).", "error");
    }
}

// ---------------------------------------------------------------- Carga y listado
async function loadWorks() {
    try {
        const snap = await getDocs(collection(db, SITE.collection));
        state.all = sortWorks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        state.orderDirty = false;
        els.orderBar.classList.add("hidden");
        els.orderBar.classList.remove("flex");
        fillDatalists();
        renderList();
    } catch (error) {
        console.error(error);
        els.list.innerHTML = `<p class="p-6 text-center text-red-700">No se pudieron cargar las obras (${esc(error.code || error.message)}).</p>`;
    }
}

function fillDatalists() {
    const uniq = (field) => [...new Map(state.all.filter((w) => clean(w[field])).map((w) => [norm(w[field]), clean(w[field])])).values()].sort();
    $("categorias-list").innerHTML = uniq("categoria").map((v) => `<option value="${esc(v)}">`).join("");
    $("series-list").innerHTML = uniq("serie").map((v) => `<option value="${esc(v)}">`).join("");
}

function filteredWorks() {
    const tokens = norm(state.query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return state.all;
    return state.all.filter((w) => {
        const hay = norm([w.titulo, w.categoria, w.serie, w.anio].join(" "));
        return tokens.every((t) => hay.includes(t));
    });
}

function rowHTML(obra) {
    const [first, ...rest] = imageUrls(obra);
    const title = clean(obra.titulo) || "Sin título";
    const broken = state.brokenByWork.get(obra.id);
    const available = obra.is_available !== false;
    const position = state.all.findIndex((w) => w.id === obra.id) + 1;
    return `
        <div class="work-row flex items-center gap-3 bg-white border border-line rounded-sm p-3" data-id="${esc(obra.id)}">
            <button type="button" class="drag-handle p-2 text-muted hover:text-ink flex-shrink-0 ${state.query ? "opacity-30 pointer-events-none" : ""}" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <span class="text-xs text-muted w-7 text-right flex-shrink-0" title="Posición en el sitio">#${position}</span>
            <img src="${esc(first || PLACEHOLDER_IMG)}" data-fallbacks="${esc(JSON.stringify(rest))}" alt="" loading="lazy" width="64" height="64" class="w-16 h-16 object-cover rounded-sm bg-line flex-shrink-0">
            <div class="flex-grow min-w-0">
                <h3 class="font-medium truncate">${esc(title)}</h3>
                <p class="text-xs text-muted">${esc([capitalize(obra.categoria), obra.serie && capitalize(obra.serie), obra.anio].filter(Boolean).join(" · ") || "—")}</p>
                <p class="text-xs mt-1 flex flex-wrap gap-x-3">
                    <span class="${available ? "text-ok" : "text-muted"}">${available ? "Disponible" : "Privada"}</span>
                    <span class="text-muted">${imageUrls(obra).length} ${imageUrls(obra).length === 1 ? "foto" : "fotos"}</span>
                    ${broken ? `<span class="text-red-700 font-medium">⚠ ${broken} ${broken === 1 ? "foto rota" : "fotos rotas"}</span>` : ""}
                </p>
            </div>
            <div class="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <button type="button" data-action="edit" class="btn btn-secondary">Editar</button>
                <button type="button" data-action="top" class="btn btn-secondary hidden md:inline-block" title="Mover al inicio del sitio">↑ Inicio</button>
                <button type="button" data-action="delete" class="btn btn-danger">Eliminar</button>
            </div>
        </div>`;
}

let listSortable;
function renderList() {
    const works = filteredWorks();
    const totalPages = Math.max(1, Math.ceil(works.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const slice = works.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    els.count.textContent = state.query ? `(${works.length} de ${state.all.length})` : `(${state.all.length})`;
    els.list.innerHTML = slice.length ? slice.map(rowHTML).join("")
        : `<p class="p-8 text-center text-muted">${state.all.length ? "No hay obras que coincidan con la búsqueda." : "Todavía no hay obras. Creá la primera con \"+ Nueva obra\"."}</p>`;

    els.pagination.classList.toggle("hidden", totalPages <= 1);
    els.pageInfo.textContent = `Página ${state.page} de ${totalPages}`;
    els.prev.disabled = state.page === 1;
    els.next.disabled = state.page === totalPages;
    els.orderHint.classList.toggle("hidden", Boolean(state.query));

    listSortable?.destroy();
    listSortable = null;
    if (typeof Sortable !== "undefined" && !state.query && slice.length > 1) {
        listSortable = Sortable.create(els.list, {
            handle: ".drag-handle", animation: 150, ghostClass: "sortable-ghost",
            onEnd: () => { state.orderDirty = true; els.orderBar.classList.remove("hidden"); els.orderBar.classList.add("flex"); },
        });
    }
}

function confirmDiscardOrder() {
    return !state.orderDirty || confirm("Tenés cambios de orden sin guardar. ¿Descartarlos?");
}
function goToPage(page) {
    if (!confirmDiscardOrder()) return;
    state.orderDirty = false;
    els.orderBar.classList.add("hidden"); els.orderBar.classList.remove("flex");
    state.page = page;
    renderList();
    window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- Orden de las obras
async function commitOrder(idsInNewOrder) {
    const byId = new Map(state.all.map((w) => [w.id, w]));
    const changes = idsInNewOrder.map((id, index) => ({ id, index })).filter(({ id, index }) => byId.get(id)?.orden !== index);
    for (let i = 0; i < changes.length; i += 400) {
        const batch = writeBatch(db);
        changes.slice(i, i + 400).forEach(({ id, index }) => batch.update(doc(db, SITE.collection, id), { orden: index }));
        await batch.commit();
    }
    changes.forEach(({ id, index }) => { byId.get(id).orden = index; });
    state.all = idsInNewOrder.map((id) => byId.get(id));
    return changes.length;
}

async function saveOrder() {
    els.saveOrder.disabled = true;
    try {
        const pageIds = [...els.list.querySelectorAll(".work-row")].map((r) => r.dataset.id);
        const all = state.all.map((w) => w.id);
        all.splice((state.page - 1) * PAGE_SIZE, pageIds.length, ...pageIds);
        const n = await commitOrder(all);
        state.orderDirty = false;
        els.orderBar.classList.add("hidden"); els.orderBar.classList.remove("flex");
        renderList();
        showAlert(n ? "Orden guardado. Ya se ve así en el sitio." : "El orden no cambió.");
    } catch (error) {
        console.error(error);
        showAlert("No se pudo guardar el orden: " + (error.code || error.message), "error");
    } finally {
        els.saveOrder.disabled = false;
    }
}

async function moveToTop(id) {
    try {
        const ids = [id, ...state.all.map((w) => w.id).filter((x) => x !== id)];
        await commitOrder(ids);
        state.page = 1;
        renderList();
        showAlert("La obra pasó al inicio del sitio.");
    } catch (error) {
        showAlert("No se pudo mover la obra: " + (error.code || error.message), "error");
    }
}

// ---------------------------------------------------------------- Formulario: fotos
const tileBtn = "absolute w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white text-sm flex items-center justify-center";

function photoTileHTML(p, i, total) {
    const isCover = i === 0;
    return `
        <div class="img-tile relative w-32 h-32 border ${p.broken ? "border-red-500 ring-2 ring-red-200" : isCover ? "border-accent ring-2 ring-accent/30" : "border-line"} rounded-sm overflow-hidden bg-white cursor-grab" data-key="${esc(p.key)}" data-kind="${p.kind}">
            <img src="${esc(p.url)}" alt="Foto ${i + 1}" draggable="false" class="w-full h-full object-cover" data-rotation="${p.rotation}">
            <span class="absolute top-1 left-1/2 -translate-x-1/2 bg-white/90 text-ink text-[10px] px-1.5 rounded-full">${i + 1}</span>
            ${isCover ? `<span class="absolute bottom-0 inset-x-0 bg-accent text-white text-[11px] text-center py-0.5 font-medium">★ Portada</span>`
                : `<span class="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[10px] text-center py-0.5">${p.kind === "new" ? "Nueva" : "&nbsp;"}</span>`}
            ${isCover && p.kind === "new" ? `<span class="absolute top-6 left-1 bg-accent/90 text-white text-[10px] px-1 rounded-sm">Nueva</span>` : ""}
            ${p.broken ? `<span class="absolute inset-0 bg-red-50/90 text-red-700 text-[11px] text-center flex items-center justify-center p-1">Ya no existe</span>` : ""}
            ${p.rotation ? `<span class="absolute top-6 right-1 bg-amber-500 text-white text-[10px] px-1 rounded-sm">${p.rotation}°</span>` : ""}
            <button type="button" data-img-action="remove" class="${tileBtn} top-1 right-1" aria-label="Quitar foto ${i + 1}" title="Quitar">✕</button>
            ${p.broken ? "" : `<button type="button" data-img-action="rotate" class="${tileBtn} top-1 left-1" aria-label="Rotar foto ${i + 1}" title="Rotar 90°">⟳</button>`}
            ${i > 0 ? `<button type="button" data-img-action="left" class="${tileBtn} bottom-6 left-1" aria-label="Mover a la izquierda" title="Mover a la izquierda">◀</button>` : ""}
            ${i < total - 1 ? `<button type="button" data-img-action="right" class="${tileBtn} bottom-6 right-1" aria-label="Mover a la derecha" title="Mover a la derecha">▶</button>` : ""}
            ${!isCover && !p.broken ? `<button type="button" data-img-action="cover" class="${tileBtn} bottom-6 left-1/2 -translate-x-1/2" aria-label="Elegir como portada" title="Elegir como portada">★</button>` : ""}
        </div>`;
}

function renderPhotos() {
    const n = state.photos.length;
    els.photos.innerHTML = n ? state.photos.map((p, i) => photoTileHTML(p, i, n)).join("")
        : `<p class="text-sm text-muted self-center">Esta obra todavía no tiene fotos. Agregalas abajo.</p>`;
    // Rotación de la vista previa por CSSOM (la CSP no permite style="" en el HTML)
    els.photos.querySelectorAll("img[data-rotation]").forEach((el) => { el.style.transform = `rotate(${el.dataset.rotation}deg)`; });
    els.brokenNote.classList.toggle("hidden", !state.photos.some((p) => p.broken));
}

let photosSortable;
function setupPhotosSortable() {
    photosSortable?.destroy();
    photosSortable = null;
    if (typeof Sortable === "undefined") return;
    photosSortable = Sortable.create(els.photos, {
        animation: 150, ghostClass: "sortable-ghost", draggable: ".img-tile", filter: "button",
        preventOnFilter: false, delay: 120, delayOnTouchOnly: true,
        onEnd: () => {
            const order = [...els.photos.querySelectorAll(".img-tile")].map((t) => t.dataset.key);
            state.photos.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
            state.formDirty = true;
            renderPhotos();
        },
    });
}

function movePhoto(from, to) {
    if (to < 0 || to >= state.photos.length) return;
    const [p] = state.photos.splice(from, 1);
    state.photos.splice(to, 0, p);
    state.formDirty = true;
    renderPhotos();
}

function removePhotoAt(idx) {
    const [gone] = state.photos.splice(idx, 1);
    if (gone.kind === "saved" && gone.path) state.removed.push(gone);
    if (gone.kind === "new") URL.revokeObjectURL(gone.url);
    state.formDirty = true;
    renderPhotos();
}

function addFiles(fileList) {
    let added = 0;
    for (const file of fileList) {
        if (!file.type.startsWith("image/")) { showAlert(`"${file.name}" no es una imagen.`, "error"); continue; }
        if (file.size > MAX_SOURCE_BYTES) { showAlert(`"${file.name}" pesa más de 30 MB.`, "error"); continue; }
        state.photos.push({ key: newKey(), kind: "new", url: URL.createObjectURL(file), path: "", name: file.name, file, rotation: 0, broken: false });
        added++;
    }
    if (added) { state.formDirty = true; renderPhotos(); }
}

function releaseNewPhotos() {
    state.photos.filter((p) => p.kind === "new").forEach((p) => URL.revokeObjectURL(p.url));
}

// ---------------------------------------------------------------- Procesamiento de fotos (en el navegador)
async function decode(blob) {
    try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
    catch {
        const url = URL.createObjectURL(blob);
        try {
            return await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("No se pudo leer la imagen")); i.src = url; });
        } finally { URL.revokeObjectURL(url); }
    }
}

function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => {
        if (b && b.type === "image/webp") resolve(b);
        else canvas.toBlob((j) => resolve(j), "image/jpeg", 0.88);   // navegadores sin soporte de WebP
    }, "image/webp", 0.85));
}

/** Reduce a MAX_IMAGE_SIDE, aplica rotación (0/90/180/270) y convierte a WebP. */
async function processImage(blob, rotation = 0) {
    const bmp = await decode(blob);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const swap = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
    bmp.close?.();
    const out = await canvasToBlob(canvas);
    if (!out) throw new Error("No se pudo convertir la imagen");
    return out;
}

async function uploadBlob(blob, workId, n, originalName) {
    const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
    const path = `obras/${workId}_${Date.now()}_${n}.${ext}`;
    const snap = await uploadBytes(ref(storage, path), blob, { contentType: blob.type, cacheControl: "public,max-age=31536000" });
    const url = await getDownloadURL(snap.ref);
    const name = clean(originalName).replace(/[^\w.\- ]+/g, "_").slice(0, 80) || path.split("/").pop();
    return { path, url, name };
}

async function deleteStored(paths) {
    await Promise.allSettled(paths.filter(Boolean).map((p) => deleteObject(ref(storage, p))));
}

// ---------------------------------------------------------------- Formulario: abrir / guardar
function resetForm() {
    els.form.reset();
    $("is_available").checked = true;
    releaseNewPhotos();
    state.editing = null;
    state.photos = [];
    state.removed = [];
    state.formDirty = false;
    els.fileInput.value = "";
    renderPhotos();
}

function setPosition(value, max) {
    els.position.max = String(max);
    els.position.value = String(value);
    els.positionMax.textContent = `de ${max}`;
}

function openNew() {
    resetForm();
    els.formTitle.textContent = "Agregar nueva obra";
    setPosition(1, state.all.length + 1);          // por defecto, la obra nueva va primera
    setupPhotosSortable();
    showForm();
    $("titulo").focus();
}

function openEdit(id) {
    const obra = state.all.find((w) => w.id === id);
    if (!obra) return;
    resetForm();
    state.editing = obra;
    els.formTitle.textContent = `Editar: ${clean(obra.titulo) || "Sin título"}`;
    ["titulo", "descripcion", "anio", "tecnica", "medidas", "categoria", "serie", "price"].forEach((f) => {
        const el = $(f);
        if (el) el.value = obra[f] ?? "";
    });
    $("currency").value = obra.currency || "ARS";
    $("is_available").checked = obra.is_available !== false;
    $("show_price").checked = Boolean(obra.show_price);
    setPosition(state.all.findIndex((w) => w.id === id) + 1, state.all.length);
    state.photos = (Array.isArray(obra.imagenes) ? obra.imagenes : [])
        .filter((i) => i && i.url)
        .map((i) => ({ key: newKey(), kind: "saved", url: i.url, path: i.path || "", name: i.name || "", file: null, rotation: 0, broken: false }));
    renderPhotos();
    setupPhotosSortable();
    showForm();
}

function readForm() {
    const fd = new FormData(els.form);
    const text = (k) => clean(fd.get(k));
    const max = Number(els.position.max) || state.all.length + 1;
    const data = {
        titulo: text("titulo"), descripcion: text("descripcion") || null, tecnica: text("tecnica"), medidas: text("medidas"),
        categoria: text("categoria"), serie: text("serie"), currency: fd.get("currency") === "USD" ? "USD" : "ARS",
        is_available: $("is_available").checked, show_price: $("show_price").checked,
        anio: text("anio") === "" ? null : Number.parseInt(text("anio"), 10),
        price: text("price") === "" ? null : Number(text("price")),
    };
    const rawPos = Number.parseInt(els.position.value, 10);
    const position = Number.isInteger(rawPos) ? Math.min(Math.max(rawPos, 1), max) : (state.editing ? state.all.findIndex((w) => w.id === state.editing.id) + 1 : 1);
    const errors = [];
    if (!data.titulo) errors.push("El título es obligatorio.");
    for (const [field, lim] of Object.entries(LIMITS)) if (data[field] && data[field].length > lim) errors.push(`"${field}" supera los ${lim} caracteres.`);
    if (data.anio !== null && !(Number.isInteger(data.anio) && data.anio >= 1900 && data.anio <= 2100)) errors.push("El año debe estar entre 1900 y 2100.");
    if (data.price !== null && !(Number.isFinite(data.price) && data.price >= 0)) errors.push("El precio debe ser un número positivo.");
    return { data, position, errors };
}

async function handleSubmit(event) {
    event.preventDefault();
    if (state.saving) return;
    const { data, position, errors } = readForm();
    if (errors.length) { showAlert(errors[0], "error"); return; }

    state.saving = true;
    els.submit.disabled = true;
    const uploaded = [];       // para limpiar si algo falla
    try {
        const isEdit = Boolean(state.editing);
        const docRef = isEdit ? doc(db, SITE.collection, state.editing.id) : doc(collection(db, SITE.collection));
        const totalSteps = state.photos.filter((p) => p.kind === "new" || (p.kind === "saved" && p.rotation && !p.broken)).length;
        let step = 0;
        const progress = () => { els.submit.textContent = `Subiendo foto ${++step} de ${totalSteps}…`; };
        els.submit.textContent = "Guardando…";

        const toDelete = state.removed.map((p) => p.path);
        const finalImages = [];
        // Se respeta exactamente el orden de la grilla: la primera foto es la portada
        for (const p of state.photos) {
            if (p.kind === "saved") {
                if (p.broken) { toDelete.push(p.path); continue; }              // las rotas se descartan
                if (!p.rotation) { finalImages.push({ path: p.path, url: p.url, name: p.name }); continue; }
                progress();
                const blob = await (await fetch(p.url)).blob();                  // descarga, rota y vuelve a subir
                const up = await uploadBlob(await processImage(blob, p.rotation), docRef.id, uploaded.length, p.name);
                uploaded.push(up.path);
                finalImages.push(up);
                toDelete.push(p.path);
            } else {
                progress();
                const up = await uploadBlob(await processImage(p.file, p.rotation), docRef.id, uploaded.length, p.name);
                uploaded.push(up.path);
                finalImages.push(up);
            }
        }

        const payload = { ...data, imagenes: finalImages, updatedAt: serverTimestamp() };
        if (isEdit) {
            await updateDoc(docRef, payload);
        } else {
            const minOrden = state.all.reduce((m, w) => Math.min(m, Number.isFinite(w.orden) ? w.orden : 0), 0);
            await setDoc(docRef, { ...payload, orden: minOrden - 1, createdAt: serverTimestamp() });   // las nuevas empiezan primeras
        }
        await deleteStored(toDelete);

        state.formDirty = false;
        resetForm();
        state.brokenByWork.clear();
        await loadWorks();

        // Posición elegida en el formulario (1 = primera)
        const current = state.all.findIndex((w) => w.id === docRef.id) + 1;
        let moved = false;
        if (current && position !== current) {
            const ids = state.all.map((w) => w.id).filter((id) => id !== docRef.id);
            ids.splice(position - 1, 0, docRef.id);
            await commitOrder(ids);
            moved = true;
            renderList();
        }
        showAlert(`Obra ${isEdit ? "actualizada" : "creada"}${moved ? ` y colocada en la posición ${position}` : ""}.`);
        showList();
    } catch (error) {
        console.error(error);
        await deleteStored(uploaded);                                          // no dejar archivos huérfanos
        const denied = error.code === "permission-denied" || error.code === "storage/unauthorized";
        showAlert(denied ? "Sin permiso para guardar: cerrá sesión y volvé a entrar. Si sigue, tu cuenta no es administradora." : "Error al guardar: " + (error.code || error.message), "error", 8000);
    } finally {
        state.saving = false;
        els.submit.disabled = false;
        els.submit.textContent = "Guardar obra";
    }
}

function cancelForm() {
    if (state.formDirty && !confirm("Tenés cambios sin guardar. ¿Salir sin guardar?")) return;
    state.formDirty = false;
    resetForm();
    showList();
}

// ---------------------------------------------------------------- Eliminar obra
async function deleteWork(id) {
    const obra = state.all.find((w) => w.id === id);
    if (!obra) return;
    if (!confirm(`¿Eliminar "${clean(obra.titulo) || "Sin título"}" y todas sus fotos?\n\nEsta acción no se puede deshacer.`)) return;
    try {
        await deleteDoc(doc(db, SITE.collection, id));
        await deleteStored((obra.imagenes || []).map((i) => i.path));
        state.all = state.all.filter((w) => w.id !== id);
        state.brokenByWork.delete(id);
        renderList();
        showAlert("Obra eliminada.");
    } catch (error) {
        showAlert("No se pudo eliminar: " + (error.code || error.message), "error");
    }
}

// ---------------------------------------------------------------- Revisión de fotos rotas
function probeImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        const done = (ok) => { clearTimeout(t); img.onload = img.onerror = null; resolve(ok); };
        const t = setTimeout(() => done(false), 20000);
        img.onload = () => done(true);
        img.onerror = () => done(false);
        img.src = url;
    });
}

async function checkAllImages() {
    const jobs = state.all.flatMap((w) => imageUrls(w).map((url) => ({ id: w.id, url })));
    if (!jobs.length) { showAlert("No hay fotos para revisar.", "info"); return; }
    els.checkImages.disabled = true;
    state.brokenByWork.clear();
    let done = 0, next = 0, broken = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            if (!(await probeImage(job.url))) { broken++; state.brokenByWork.set(job.id, (state.brokenByWork.get(job.id) || 0) + 1); }
            els.checkImages.textContent = `Revisando ${++done}/${jobs.length}…`;
        }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    els.checkImages.disabled = false;
    els.checkImages.textContent = "Revisar imágenes";
    renderList();
    showAlert(broken
        ? `Se encontraron ${broken} fotos rotas en ${state.brokenByWork.size} obras. Abrí cada obra marcada con ⚠ y usá "Quitar las rotas".`
        : `Las ${jobs.length} fotos cargan correctamente.`, broken ? "error" : "success", 9000);
}

// ---------------------------------------------------------------- Eventos
function setupEvents() {
    installImageFallback(els.list);
    els.loginForm.addEventListener("submit", handleLogin);
    $("reset-password").addEventListener("click", handleResetPassword);
    $("logout-button").addEventListener("click", () => signOut(auth));
    $("show-add-form-button").addEventListener("click", openNew);
    els.checkImages.addEventListener("click", checkAllImages);

    els.list.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const id = btn.closest(".work-row")?.dataset.id;
        if (btn.dataset.action === "edit") { if (confirmDiscardOrder()) openEdit(id); }
        else if (btn.dataset.action === "delete") deleteWork(id);
        else if (btn.dataset.action === "top" && confirmDiscardOrder()) moveToTop(id);
    });

    let timer;
    els.search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.query = els.search.value; state.page = 1; renderList(); }, 200);
    });
    els.prev.addEventListener("click", () => state.page > 1 && goToPage(state.page - 1));
    els.next.addEventListener("click", () => goToPage(state.page + 1));
    els.saveOrder.addEventListener("click", saveOrder);
    els.cancelOrder.addEventListener("click", () => { state.orderDirty = false; els.orderBar.classList.add("hidden"); els.orderBar.classList.remove("flex"); renderList(); });

    els.form.addEventListener("submit", handleSubmit);
    els.form.addEventListener("input", () => { state.formDirty = true; });
    $("cancel-edit-button").addEventListener("click", cancelForm);
    $("pos-first").addEventListener("click", () => { els.position.value = "1"; state.formDirty = true; });
    $("pos-last").addEventListener("click", () => { els.position.value = els.position.max; state.formDirty = true; });

    // Agregar fotos: selector de archivos o arrastrar y soltar
    els.fileInput.addEventListener("change", () => { addFiles([...els.fileInput.files]); els.fileInput.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add("border-accent", "bg-accent-soft"); }));
    ["dragleave", "drop"].forEach((ev) => els.dropzone.addEventListener(ev, () => els.dropzone.classList.remove("border-accent", "bg-accent-soft")));
    els.dropzone.addEventListener("drop", (e) => { e.preventDefault(); addFiles([...(e.dataTransfer?.files || [])]); });

    // Acciones sobre cada foto: quitar, rotar, mover, elegir portada
    els.photos.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-img-action]");
        if (!btn) return;
        const idx = state.photos.findIndex((p) => p.key === btn.closest(".img-tile").dataset.key);
        if (idx < 0) return;
        const action = btn.dataset.imgAction;
        if (action === "remove") removePhotoAt(idx);
        else if (action === "left") movePhoto(idx, idx - 1);
        else if (action === "right") movePhoto(idx, idx + 1);
        else if (action === "cover") movePhoto(idx, 0);
        else if (action === "rotate") { state.photos[idx].rotation = (state.photos[idx].rotation + 90) % 360; state.formDirty = true; renderPhotos(); }
    });
    // Fotos que ya no existen en el servidor: se marcan en rojo en lugar de mostrar un ícono roto
    els.photos.addEventListener("error", (e) => {
        const tile = e.target.closest?.(".img-tile");
        const p = tile && state.photos.find((x) => x.key === tile.dataset.key);
        if (p && p.kind === "saved" && !p.broken) { p.broken = true; renderPhotos(); }
    }, true);
    $("remove-broken-button").addEventListener("click", () => {
        state.photos.filter((p) => p.broken && p.path).forEach((p) => state.removed.push(p));
        state.photos = state.photos.filter((p) => !p.broken);
        state.formDirty = true;
        renderPhotos();
    });

    window.addEventListener("beforeunload", (e) => {
        if (state.formDirty || state.orderDirty) { e.preventDefault(); e.returnValue = ""; }
    });
}

setupEvents();
// La sesión se mantiene en este navegador hasta que cierres sesión (así el menú del index sabe que sos vos)
onAuthStateChanged(auth, onUser);
