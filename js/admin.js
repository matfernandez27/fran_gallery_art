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
    setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { SITE } from "./config.js";
import { esc, norm, clean, capitalize, imageUrls, installImageFallback, sortWorks, PLACEHOLDER_IMG } from "./utils.js";

// ---------------------------------------------------------------- Constantes
const PAGE_SIZE = 25;
const MAX_IMAGE_SIDE = 2400;       // px (lado mayor) al optimizar imágenes
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const LIMITS = { titulo: 120, descripcion: 5000, tecnica: 200, medidas: 100, categoria: 60, serie: 60 };

// ---------------------------------------------------------------- Estado
const state = {
    all: [],                // todas las obras (ordenadas)
    page: 1,
    query: "",
    editing: null,          // obra en edición (o null si es nueva)
    formImages: [],         // imágenes ya guardadas en la obra: { key, path, url, name, rotation, broken }
    pendingFiles: [],       // archivos nuevos elegidos: { key, file, preview }
    removed: [],            // imágenes quitadas (se borran del servidor al guardar)
    formDirty: false,
    orderDirty: false,
    brokenByWork: new Map(),// id -> cantidad de imágenes rotas (resultado de "Revisar imágenes")
    saving: false,
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
    currentImages: $("current-images-list"), pendingImages: $("pending-images-list"), fileInput: $("imagenes"),
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

// Cierre de sesión automático por inactividad
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
    return `
        <div class="work-row flex items-center gap-3 bg-white border border-line rounded-sm p-3" data-id="${esc(obra.id)}">
            <button type="button" class="drag-handle p-2 text-muted hover:text-ink flex-shrink-0 ${state.query ? "opacity-30 pointer-events-none" : ""}" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <img src="${esc(first || PLACEHOLDER_IMG)}" data-fallbacks="${esc(JSON.stringify(rest))}" alt="" loading="lazy" width="64" height="64" class="w-16 h-16 object-cover rounded-sm bg-line flex-shrink-0">
            <div class="flex-grow min-w-0">
                <h3 class="font-medium truncate">${esc(title)}</h3>
                <p class="text-xs text-muted">${esc([capitalize(obra.categoria), obra.serie && capitalize(obra.serie), obra.anio].filter(Boolean).join(" · ") || "—")}</p>
                <p class="text-xs mt-1 flex flex-wrap gap-x-3">
                    <span class="${available ? "text-ok" : "text-muted"}">${available ? "Disponible" : "Privada"}</span>
                    <span class="text-muted">${imageUrls(obra).length} ${imageUrls(obra).length === 1 ? "imagen" : "imágenes"}</span>
                    ${broken ? `<span class="text-red-700 font-medium">⚠ ${broken} ${broken === 1 ? "imagen rota" : "imágenes rotas"}</span>` : ""}
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

// ---------------------------------------------------------------- Orden
async function commitOrder(idsInNewOrder) {
    const byId = new Map(state.all.map((w) => [w.id, w]));
    const changes = idsInNewOrder.map((id, index) => ({ id, index })).filter(({ id, index }) => byId.get(id).orden !== index);
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

// ---------------------------------------------------------------- Formulario: imágenes
const tileBtn = "absolute w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center";

function renderFormImages() {
    els.currentImages.innerHTML = state.formImages.length ? state.formImages.map((img, i) => `
        <div class="img-tile relative w-24 h-24 border ${img.broken ? "border-red-500 ring-2 ring-red-200" : "border-line"} rounded-sm overflow-hidden bg-white" data-key="${esc(img.key)}">
            <img src="${esc(img.url)}" alt="" class="w-full h-full object-cover" data-rotation="${img.rotation}">
            ${i === 0 ? `<span class="absolute bottom-0 inset-x-0 bg-accent text-white text-[10px] text-center py-0.5">Portada</span>` : ""}
            ${img.broken ? `<span class="absolute inset-0 bg-red-50/90 text-red-700 text-[11px] text-center flex items-center justify-center p-1">Ya no existe</span>` : ""}
            ${img.rotation ? `<span class="absolute bottom-0 left-0 bg-amber-500 text-white text-[10px] px-1">${img.rotation}°</span>` : ""}
            <button type="button" data-img-action="remove" class="${tileBtn} top-1 right-1" aria-label="Quitar imagen" title="Quitar">✕</button>
            ${img.broken ? "" : `<button type="button" data-img-action="rotate" class="${tileBtn} top-1 left-1" aria-label="Rotar 90 grados" title="Rotar 90°">⟳</button>`}
        </div>`).join("")
        : `<p class="text-sm text-muted self-center">Esta obra todavía no tiene imágenes.</p>`;

    // Aplicar la rotación de vista previa (por CSSOM: la CSP no permite style="" en el HTML)
    els.currentImages.querySelectorAll("img[data-rotation]").forEach((el) => { el.style.transform = `rotate(${el.dataset.rotation}deg)`; });
    els.brokenNote.classList.toggle("hidden", !state.formImages.some((i) => i.broken));
}

function renderPending() {
    els.pendingImages.innerHTML = state.pendingFiles.map((p) => `
        <div class="relative w-24 h-24 border border-accent/40 rounded-sm overflow-hidden bg-white" data-key="${esc(p.key)}">
            <img src="${esc(p.preview)}" alt="" class="w-full h-full object-cover">
            <span class="absolute bottom-0 inset-x-0 bg-accent/90 text-white text-[10px] text-center py-0.5">Nueva</span>
            <button type="button" data-pending-remove class="${tileBtn} top-1 right-1" aria-label="Quitar" title="Quitar">✕</button>
        </div>`).join("");
}

let imagesSortable;
function setupImagesSortable() {
    imagesSortable?.destroy();
    imagesSortable = null;
    if (typeof Sortable === "undefined") return;
    imagesSortable = Sortable.create(els.currentImages, {
        animation: 150, ghostClass: "sortable-ghost", draggable: ".img-tile",
        onEnd: () => {
            const order = [...els.currentImages.querySelectorAll(".img-tile")].map((t) => t.dataset.key);
            state.formImages.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
            state.formDirty = true;
            renderFormImages();
        },
    });
}

function addFiles(fileList) {
    const accepted = [];
    for (const file of fileList) {
        if (!file.type.startsWith("image/")) { showAlert(`"${file.name}" no es una imagen.`, "error"); continue; }
        if (file.size > MAX_SOURCE_BYTES) { showAlert(`"${file.name}" pesa más de 30 MB.`, "error"); continue; }
        accepted.push({ key: newKey(), file, preview: URL.createObjectURL(file) });
    }
    state.pendingFiles.push(...accepted);
    if (accepted.length) state.formDirty = true;
    renderPending();
}

function clearPending() {
    state.pendingFiles.forEach((p) => URL.revokeObjectURL(p.preview));
    state.pendingFiles = [];
    els.fileInput.value = "";
    renderPending();
}

// ---------------------------------------------------------------- Procesamiento de imágenes (en el navegador)
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
    state.editing = null;
    state.formImages = [];
    state.removed = [];
    state.formDirty = false;
    clearPending();
    renderFormImages();
}

function openNew() {
    resetForm();
    els.formTitle.textContent = "Agregar nueva obra";
    setupImagesSortable();
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
    state.formImages = (Array.isArray(obra.imagenes) ? obra.imagenes : [])
        .filter((i) => i && i.url)
        .map((i) => ({ key: newKey(), path: i.path || "", url: i.url, name: i.name || "", rotation: 0, broken: false }));
    renderFormImages();
    setupImagesSortable();
    showForm();
}

function readForm() {
    const fd = new FormData(els.form);
    const text = (k) => clean(fd.get(k));
    const data = {
        titulo: text("titulo"), descripcion: text("descripcion") || null, tecnica: text("tecnica"), medidas: text("medidas"),
        categoria: text("categoria"), serie: text("serie"), currency: fd.get("currency") === "USD" ? "USD" : "ARS",
        is_available: $("is_available").checked, show_price: $("show_price").checked,
        anio: text("anio") === "" ? null : Number.parseInt(text("anio"), 10),
        price: text("price") === "" ? null : Number(text("price")),
    };
    const errors = [];
    if (!data.titulo) errors.push("El título es obligatorio.");
    for (const [field, max] of Object.entries(LIMITS)) if (data[field] && data[field].length > max) errors.push(`"${field}" supera los ${max} caracteres.`);
    if (data.anio !== null && !(Number.isInteger(data.anio) && data.anio >= 1900 && data.anio <= 2100)) errors.push("El año debe estar entre 1900 y 2100.");
    if (data.price !== null && !(Number.isFinite(data.price) && data.price >= 0)) errors.push("El precio debe ser un número positivo.");
    return { data, errors };
}

async function handleSubmit(event) {
    event.preventDefault();
    if (state.saving) return;
    const { data, errors } = readForm();
    if (errors.length) { showAlert(errors[0], "error"); return; }

    state.saving = true;
    els.submit.disabled = true;
    const uploaded = [];       // para limpiar si algo falla
    try {
        const isEdit = Boolean(state.editing);
        const docRef = isEdit ? doc(db, SITE.collection, state.editing.id) : doc(collection(db, SITE.collection));
        const totalSteps = state.pendingFiles.length + state.formImages.filter((i) => i.rotation).length;
        let step = 0;
        const progress = () => { els.submit.textContent = totalSteps ? `Subiendo imagen ${++step} de ${totalSteps}…` : "Guardando…"; };
        els.submit.textContent = "Guardando…";

        const toDelete = state.removed.map((i) => i.path);
        const finalImages = [];
        for (const img of state.formImages) {
            if (img.broken) { toDelete.push(img.path); continue; }            // las rotas se descartan
            if (!img.rotation) { finalImages.push({ path: img.path, url: img.url, name: img.name }); continue; }
            progress();
            const blob = await (await fetch(img.url)).blob();                 // descarga, rota y vuelve a subir
            const up = await uploadBlob(await processImage(blob, img.rotation), docRef.id, uploaded.length, img.name);
            uploaded.push(up.path);
            finalImages.push(up);
            toDelete.push(img.path);
        }
        for (const p of state.pendingFiles) {
            progress();
            const up = await uploadBlob(await processImage(p.file), docRef.id, uploaded.length, p.file.name);
            uploaded.push(up.path);
            finalImages.push(up);
        }

        const payload = { ...data, imagenes: finalImages, updatedAt: serverTimestamp() };
        if (isEdit) {
            await updateDoc(docRef, payload);
        } else {
            const minOrden = state.all.reduce((m, w) => Math.min(m, Number.isFinite(w.orden) ? w.orden : 0), 0);
            await setDoc(docRef, { ...payload, orden: minOrden - 1, createdAt: serverTimestamp() });   // las nuevas van primero
        }
        await deleteStored(toDelete);

        showAlert(`Obra ${isEdit ? "actualizada" : "creada"}.`);
        state.formDirty = false;
        resetForm();
        state.brokenByWork.clear();
        await loadWorks();
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
    if (!confirm(`¿Eliminar "${clean(obra.titulo) || "Sin título"}" y todas sus imágenes?\n\nEsta acción no se puede deshacer.`)) return;
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

// ---------------------------------------------------------------- Revisión de imágenes rotas
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
    if (!jobs.length) { showAlert("No hay imágenes para revisar.", "info"); return; }
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
        ? `Se encontraron ${broken} imágenes rotas en ${state.brokenByWork.size} obras. Abrí cada obra marcada con ⚠ y usá "Quitar las rotas".`
        : `Las ${jobs.length} imágenes cargan correctamente.`, broken ? "error" : "success", 9000);
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
    els.fileInput.addEventListener("change", () => { addFiles([...els.fileInput.files]); els.fileInput.value = ""; });

    els.currentImages.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-img-action]");
        if (!btn) return;
        const key = btn.closest(".img-tile").dataset.key;
        const idx = state.formImages.findIndex((i) => i.key === key);
        if (idx < 0) return;
        if (btn.dataset.imgAction === "remove") { const [gone] = state.formImages.splice(idx, 1); if (gone.path) state.removed.push(gone); }
        else state.formImages[idx].rotation = (state.formImages[idx].rotation + 90) % 360;
        state.formDirty = true;
        renderFormImages();
    });
    // Imágenes que ya no existen en el servidor: se marcan en rojo en lugar de mostrar un ícono roto
    els.currentImages.addEventListener("error", (e) => {
        const tile = e.target.closest?.(".img-tile");
        const img = tile && state.formImages.find((i) => i.key === tile.dataset.key);
        if (img && !img.broken) { img.broken = true; renderFormImages(); }
    }, true);
    $("remove-broken-button").addEventListener("click", () => {
        state.formImages.filter((i) => i.broken).forEach((i) => i.path && state.removed.push(i));
        state.formImages = state.formImages.filter((i) => !i.broken);
        state.formDirty = true;
        renderFormImages();
    });
    els.pendingImages.addEventListener("click", (e) => {
        if (!e.target.closest("[data-pending-remove]")) return;
        const key = e.target.closest("[data-key]").dataset.key;
        const p = state.pendingFiles.find((x) => x.key === key);
        if (p) URL.revokeObjectURL(p.preview);
        state.pendingFiles = state.pendingFiles.filter((x) => x.key !== key);
        renderPending();
    });

    window.addEventListener("beforeunload", (e) => {
        if (state.formDirty || state.orderDirty) { e.preventDefault(); e.returnValue = ""; }
    });
}

setupEvents();
// La sesión dura mientras la pestaña esté abierta (más seguro en computadoras compartidas)
setPersistence(auth, browserSessionPersistence)
    .catch((e) => console.warn("No se pudo fijar la persistencia de sesión", e))
    .finally(() => onAuthStateChanged(auth, onUser));
