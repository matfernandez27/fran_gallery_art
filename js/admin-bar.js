// js/admin-bar.js — Menú oculto del administrador dentro del index.
// Solo se carga si hay una sesión con el permiso "admin" (ver main.js). Los visitantes nunca lo descargan.
import { db, auth } from "../src/firebaseConfig.js";
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let bar = null;
let api = null;
let sortable = null;

/** Carga Sortable (copia local, versión fija) solo cuando hace falta. */
function loadSortable() {
    if (window.Sortable) return Promise.resolve(window.Sortable);
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "./vendor/Sortable.min.js";
        s.onload = () => resolve(window.Sortable);
        s.onerror = () => reject(new Error("No se pudo cargar Sortable"));
        document.head.appendChild(s);
    });
}

const btn = "px-3 py-1.5 rounded-sm text-xs font-semibold tracking-wide transition-colors";

function renderBar() {
    if (!bar) return;
    const { state } = api;
    // Durante la edición del orden la barra queda fija abajo, para poder guardar sin volver a subir
    bar.className = state.reorder
        ? "bg-ink text-white fixed bottom-0 inset-x-0 z-50 shadow-2xl border-t border-white/10"
        : "bg-ink text-white relative z-50 border-b border-white/10";
    document.body.classList.toggle("pb-20", state.reorder);
    bar.innerHTML = state.reorder
        ? `<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
               <span class="text-xs text-white/80">Editando el orden: arrastrá las obras y guardá.</span>
               <span class="flex gap-2">
                   <button type="button" data-act="cancel-order" class="${btn} bg-white/10 hover:bg-white/20 text-white">Cancelar</button>
                   <button type="button" data-act="save-order" class="${btn} bg-green-600 hover:bg-green-700 text-white">Guardar orden</button>
               </span>
           </div>`
        : `<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
               <span class="text-xs text-white/80">Modo administrador <span class="hidden sm:inline">· solo vos ves esta barra</span></span>
               <span class="flex flex-wrap gap-2">
                   <a href="./admin.html" class="${btn} bg-accent hover:bg-accent-dark text-white">Panel</a>
                   <button type="button" data-act="edit-order" class="${btn} bg-white/10 hover:bg-white/20 text-white">Editar orden</button>
                   <button type="button" data-act="toggle-prices" class="${btn} bg-white/10 hover:bg-white/20 text-white">${state.hidePrices ? "Mostrar precios" : "Ocultar precios"}</button>
                   <button type="button" data-act="logout" class="${btn} bg-white/10 hover:bg-white/20 text-white">Cerrar sesión</button>
               </span>
           </div>`;
}

async function enterReorder() {
    const { state, els } = api;
    try { await loadSortable(); } catch (e) { api.showToast("No se pudo cargar el editor de orden."); return; }
    api.clearFilters();                 // se ordena el catálogo completo, sin filtros
    state.reorder = true;
    els.filtersBlock.classList.add("hidden");
    api.rerender();
    sortable = window.Sortable.create(els.gallery, {
        draggable: "article[data-id]", handle: ".card-drag", animation: 160,
        ghostClass: "sortable-ghost", delay: 120, delayOnTouchOnly: true, touchStartThreshold: 4,
    });
    renderBar();
    window.scrollTo({ top: els.gallery.getBoundingClientRect().top + window.scrollY - 140, behavior: "smooth" });
}

function leaveReorder() {
    const { state, els } = api;
    sortable?.destroy();
    sortable = null;
    state.reorder = false;
    els.filtersBlock.classList.remove("hidden");
    api.rerender();
    renderBar();
}

async function saveOrder() {
    const { state } = api;
    const ids = [...api.els.gallery.querySelectorAll("article[data-id]")].map((a) => a.dataset.id);
    const byId = new Map(state.works.map((w) => [w.id, w]));
    const changes = ids.map((id, index) => ({ id, index })).filter(({ id, index }) => byId.get(id)?.orden !== index);
    const saveBtn = bar.querySelector('[data-act="save-order"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Guardando…"; }
    try {
        for (let i = 0; i < changes.length; i += 400) {
            const batch = writeBatch(db);
            changes.slice(i, i + 400).forEach(({ id, index }) => batch.update(doc(db, api.SITE.collection, id), { orden: index }));
            await batch.commit();
        }
        changes.forEach(({ id, index }) => { byId.get(id).orden = index; });
        state.works = api.sortWorks(state.works);
        leaveReorder();
        api.reloadAll();
        api.showToast(changes.length ? "Orden guardado. Ya se ve así en el sitio." : "El orden no cambió.");
    } catch (error) {
        console.error(error);
        api.showToast("No se pudo guardar: " + (error.code === "permission-denied" ? "tu cuenta no tiene permiso (cerrá sesión y volvé a entrar)." : error.message));
        renderBar();
    }
}

function onClick(e) {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    const { state } = api;
    if (act === "edit-order") enterReorder();
    else if (act === "cancel-order") leaveReorder();
    else if (act === "save-order") saveOrder();
    else if (act === "toggle-prices") {
        state.hidePrices = !state.hidePrices;
        localStorage.setItem("fran_hide_prices", state.hidePrices ? "1" : "0");
        renderBar();
        api.rerender();
        api.showToast(state.hidePrices ? "Precios ocultos (solo en tu navegador)." : "Precios visibles.");
    } else if (act === "logout") {
        signOut(auth);
    }
}

export function mountAdminBar(apiRef) {
    if (bar) return;
    api = apiRef;
    bar = document.createElement("div");
    bar.id = "admin-bar";
    bar.addEventListener("click", onClick);
    document.body.prepend(bar);
    renderBar();
}

export function unmountAdminBar() {
    if (!bar) return;
    if (api?.state.reorder) leaveReorder();
    document.body.classList.remove("pb-20");
    bar.remove();
    bar = null;
}
