// js/main.js — Galería pública
import { db, auth } from "../src/firebaseConfig.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { SITE } from "./config.js";
import {
    esc, norm, clean, capitalize, formatPrice, whatsappLink, imageUrls,
    installImageFallback, sortWorks, withTimeout, PLACEHOLDER_IMG,
} from "./utils.js";

// ---------------------------------------------------------------- Estado
const state = {
    works: [],          // todo el catálogo (ya ordenado)
    filtered: [],       // resultado de aplicar búsqueda + filtros
    page: 1,
    totalPages: 1,
    query: "",
    category: "",       // clave normalizada
    series: "",         // clave normalizada
    onlyAvailable: false,
    loaded: false,
    // Modo administrador (solo se activa si hay una sesión con permiso "admin")
    isAdmin: false,
    reorder: false,
    hidePrices: localStorage.getItem("fran_hide_prices") === "1",
};

// ---------------------------------------------------------------- Elementos
const $ = (id) => document.getElementById(id);
const els = {
    gallery: $("gallery-container"),
    pagination: $("pagination-controls"),
    prev: $("prev-page"),
    next: $("next-page"),
    pageInfo: $("page-info"),
    search: $("search"),
    chips: $("category-chips"),
    series: $("filter-series"),
    available: $("only-available"),
    clear: $("clear-filters"),
    count: $("results-count"),
    filtersBlock: $("filters-block"),
    track: $("carousel-track"),
    carouselPrev: $("carousel-prev"),
    carouselNext: $("carousel-next"),
    dots: $("carousel-dots"),
    modal: $("modal"),
    modalContent: $("modal-content"),
    toast: $("toast"),
    toTop: $("to-top"),
};

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- Avisos breves
let toastTimer;
function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 3200);
}

// ---------------------------------------------------------------- Carga de datos
function skeletonCards(n = 8) {
    return Array.from({ length: n }, () => `
        <div aria-hidden="true">
            <div class="aspect-[4/5] skeleton mb-4"></div>
            <div class="h-4 w-3/4 skeleton mb-2"></div>
            <div class="h-3 w-1/2 skeleton"></div>
        </div>`).join("");
}

function showLoadError() {
    els.gallery.setAttribute("aria-busy", "false");
    els.gallery.innerHTML = `
        <div class="col-span-full text-center py-16" role="alert">
            <p class="text-ink font-display text-xl mb-2">No pudimos cargar las obras</p>
            <p class="text-muted text-sm mb-6">Revisá tu conexión e intentá de nuevo.</p>
            <button id="retry-load" type="button" class="bg-ink text-white px-6 py-2.5 rounded-sm text-sm hover:bg-black transition-colors">Reintentar</button>
        </div>`;
    $("retry-load")?.addEventListener("click", () => loadWorks());
    els.pagination.classList.add("hidden");
    els.count.textContent = "";
    els.track.parentElement?.classList.add("hidden");
}

async function loadWorks() {
    els.gallery.setAttribute("aria-busy", "true");
    els.gallery.innerHTML = skeletonCards();
    try {
        const snap = await withTimeout(getDocs(collection(db, SITE.collection)), 20000, "Firestore no respondió");
        state.works = sortWorks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        state.loaded = true;
        readUrlState();
        populateFilters();
        initCarousel();
        applyFilters(state.page);
        syncModalWithHash();
    } catch (error) {
        console.error("Error al cargar la galería:", error);
        showLoadError();
    }
}

// ---------------------------------------------------------------- Estado en la URL (enlaces con filtros)
function readUrlState() {
    const p = new URLSearchParams(location.search);
    state.query = p.get("q") || "";
    state.category = norm(p.get("cat") || "");
    state.series = norm(p.get("serie") || "");
    state.onlyAvailable = p.get("disp") === "1";
    state.page = Math.max(1, Number.parseInt(p.get("p"), 10) || 1);
}

function writeUrlState() {
    const p = new URLSearchParams();
    if (clean(state.query)) p.set("q", clean(state.query));
    if (state.category) p.set("cat", state.category);
    if (state.series) p.set("serie", state.series);
    if (state.onlyAvailable) p.set("disp", "1");
    if (state.page > 1) p.set("p", String(state.page));
    const qs = p.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
}

// ---------------------------------------------------------------- Filtros
function uniqueOptions(field) {
    const map = new Map();
    for (const w of state.works) {
        const label = clean(w[field]);
        if (!label) continue;
        const key = norm(label);
        const entry = map.get(key) || { label: capitalize(label), count: 0 };
        entry.count++;
        map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, "es"));
}

function renderChips() {
    const chip = "px-4 py-1.5 rounded-full border text-sm transition-colors border-line bg-white text-ink hover:border-muted aria-pressed:bg-ink aria-pressed:text-white aria-pressed:border-ink";
    const options = uniqueOptions("categoria");
    els.chips.classList.toggle("hidden", options.length < 2);
    els.chips.innerHTML =
        `<button type="button" data-cat="" aria-pressed="${state.category === ""}" class="${chip}">Todas <span class="opacity-60">${state.works.length}</span></button>` +
        options.map(([key, o]) => `<button type="button" data-cat="${esc(key)}" aria-pressed="${state.category === key}" class="${chip}">${esc(o.label)} <span class="opacity-60">${o.count}</span></button>`).join("");
}

function populateFilters() {
    const seriesOptions = uniqueOptions("serie");
    if (!seriesOptions.some(([k]) => k === state.series)) state.series = "";
    if (!uniqueOptions("categoria").some(([k]) => k === state.category)) state.category = "";
    els.series.innerHTML = `<option value="">Todas las series</option>` +
        seriesOptions.map(([key, o]) => `<option value="${esc(key)}">${esc(o.label)}</option>`).join("");
    els.series.value = state.series;
    els.search.value = state.query;
    els.available.checked = state.onlyAvailable;
    renderChips();
}

function matchesQuery(obra, tokens) {
    if (!tokens.length) return true;
    const haystack = norm([obra.titulo, obra.categoria, obra.serie, obra.tecnica, obra.anio].join(" "));
    return tokens.every((t) => haystack.includes(t));
}

function applyFilters(page = 1) {
    const tokens = norm(state.query).split(/\s+/).filter(Boolean);
    state.filtered = state.works.filter((w) =>
        matchesQuery(w, tokens) &&
        (!state.category || norm(w.categoria) === state.category) &&
        (!state.series || norm(w.serie) === state.series) &&
        (!state.onlyAvailable || w.is_available !== false));

    state.totalPages = state.reorder ? 1 : Math.max(1, Math.ceil(state.filtered.length / SITE.pageSize));
    state.page = Math.min(Math.max(1, page), state.totalPages);

    const active = Boolean(tokens.length || state.category || state.series || state.onlyAvailable);
    els.clear.classList.toggle("hidden", !active);
    renderChips();
    renderGallery();
    renderCount(active);
    renderPagination();
    writeUrlState();
}

function renderCount(active) {
    const total = state.works.length;
    const n = state.filtered.length;
    if (!total) { els.count.textContent = ""; return; }
    if (state.reorder) { els.count.textContent = "Arrastrá las obras para cambiar el orden. Las primeras aparecen antes en el sitio."; return; }
    els.count.textContent = active
        ? `${n} ${n === 1 ? "obra encontrada" : "obras encontradas"} de ${total}`
        : `${total} ${total === 1 ? "obra" : "obras"}`;
}

function clearFilters() {
    state.query = ""; state.category = ""; state.series = ""; state.onlyAvailable = false;
    els.search.value = ""; els.series.value = ""; els.available.checked = false;
    applyFilters(1);
}

// ---------------------------------------------------------------- Galería
function statusBadge(obra) {
    const available = obra.is_available !== false;
    return available
        ? `<span class="inline-flex items-center gap-1.5 text-xs text-ok font-medium"><span class="w-1.5 h-1.5 rounded-full bg-ok"></span>Disponible</span>`
        : `<span class="inline-flex items-center gap-1.5 text-xs text-muted"><span class="w-1.5 h-1.5 rounded-full bg-muted/60"></span>Privada</span>`;
}

function visiblePrice(obra) {
    return obra.show_price && obra.price && !state.hidePrices ? formatPrice(obra.price, obra.currency) : "";
}

/** Controles que solo ve el administrador sobre cada tarjeta. */
function adminCardControls(obra) {
    if (state.reorder) {
        return `<span class="card-drag admin-drag-card absolute top-2 left-2 z-10 bg-ink/85 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 select-none" title="Arrastrar para ordenar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16"/></svg>Arrastrar</span>`;
    }
    return `<a href="./admin.html?edit=${encodeURIComponent(obra.id)}" class="absolute top-2 right-2 z-10 bg-white/95 text-ink text-xs font-medium px-3 py-1.5 rounded-full shadow hover:bg-white" aria-label="Editar ${esc(clean(obra.titulo))}">✎ Editar</a>`;
}

function cardHTML(obra, index) {
    const [first, ...rest] = imageUrls(obra);
    const title = clean(obra.titulo) || "Sin título";
    const subtitle = [capitalize(obra.categoria), obra.anio].filter(Boolean).join(" · ") || "Obra";
    const price = visiblePrice(obra);
    const photos = rest.length + (first ? 1 : 0);
    const openAttr = state.reorder ? 'tabindex="-1"' : `data-open="${esc(obra.id)}"`;
    return `
        <article class="fade-in relative" data-id="${esc(obra.id)}">
            ${state.isAdmin ? adminCardControls(obra) : ""}
            <button type="button" ${openAttr} class="group block w-full text-left ${state.reorder ? "cursor-default" : ""}" aria-label="Ver detalle de ${esc(title)}">
                <div class="aspect-[4/5] overflow-hidden bg-line/60 relative mb-4">
                    <img src="${esc(first || PLACEHOLDER_IMG)}" data-fallbacks="${esc(JSON.stringify(rest))}"
                         alt="${esc(title)}" width="400" height="500" loading="${index < 4 ? "eager" : "lazy"}" decoding="async"
                         class="img-fade w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out">
                    ${photos > 1 ? `<span class="absolute bottom-2 right-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full backdrop-blur-sm">${photos} fotos</span>` : ""}
                </div>
                <h3 class="font-display text-base sm:text-lg text-ink leading-snug truncate group-hover:text-accent transition-colors">${esc(title)}</h3>
                <p class="text-[11px] sm:text-xs text-muted tracking-widest uppercase mt-1">${esc(subtitle)}</p>
                <div class="flex justify-between items-center gap-2 mt-3 pt-3 border-t border-line">
                    ${statusBadge(obra)}
                    ${price ? `<span class="text-ink font-medium text-sm">${esc(price)}</span>` : ""}
                </div>
            </button>
        </article>`;
}

function renderGallery() {
    els.gallery.setAttribute("aria-busy", "false");
    const start = state.reorder ? 0 : (state.page - 1) * SITE.pageSize;
    const pageWorks = state.reorder ? state.filtered : state.filtered.slice(start, start + SITE.pageSize);

    if (!pageWorks.length) {
        els.gallery.innerHTML = `
            <div class="col-span-full text-center py-16">
                <p class="text-ink font-display text-xl mb-2">No se encontraron obras</p>
                <p class="text-muted text-sm mb-6">Probá con otra búsqueda o quitá los filtros.</p>
                <button type="button" data-clear class="text-accent hover:text-accent-dark underline underline-offset-4 text-sm">Limpiar filtros</button>
            </div>`;
        return;
    }
    els.gallery.innerHTML = pageWorks.map(cardHTML).join("");
    els.gallery.querySelectorAll("article").forEach((card, i) => { card.style.animationDelay = `${Math.min(i, 11) * 35}ms`; });
    // Las imágenes que ya estaban en caché no disparan "load" a tiempo
    els.gallery.querySelectorAll("img.img-fade").forEach((img) => { if (img.complete) img.classList.add("is-loaded"); });
}

function renderPagination() {
    const show = state.totalPages > 1 && !state.reorder;
    els.pagination.classList.toggle("hidden", !show);
    if (!show) return;
    els.pageInfo.textContent = `Página ${state.page} de ${state.totalPages}`;
    els.prev.disabled = state.page === 1;
    els.next.disabled = state.page === state.totalPages;
}

function goToPage(page) {
    applyFilters(page);
    document.getElementById("gallery-section").scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth" });
}

// ---------------------------------------------------------------- Carrusel
const carousel = { index: 0, count: 0, timer: null, picks: [] };

function slideHTML(obra, i, total) {
    const [first, ...rest] = imageUrls(obra);
    const title = clean(obra.titulo) || "Sin título";
    const subtitle = [capitalize(obra.serie), obra.anio].filter(Boolean).join(" — ");
    return `
        <div class="w-full h-full flex-shrink-0 relative" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${total}">
            <img src="${esc(first)}" data-fallbacks="${esc(JSON.stringify(rest))}" alt="${esc(title)}"
                 loading="${i === 0 ? "eager" : "lazy"}" decoding="async" class="w-full h-full object-cover opacity-90">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex flex-col justify-end p-6 md:p-16 pb-12 md:pb-16">
                ${subtitle ? `<p class="text-white/80 text-xs tracking-widest uppercase mb-2">${esc(subtitle)}</p>` : ""}
                <h2 class="text-3xl md:text-5xl font-display text-white mb-5 leading-tight drop-shadow-md">${esc(title)}</h2>
                <button type="button" data-open="${esc(obra.id)}" class="w-max bg-white/95 text-ink px-7 py-2.5 text-sm font-medium hover:bg-white transition-colors rounded-sm">Ver obra</button>
            </div>
        </div>`;
}

function initCarousel() {
    stopAutoplay();
    carousel.picks = state.works.filter((w) => imageUrls(w).length).slice(0, SITE.heroSlides);
    carousel.count = carousel.picks.length;
    const section = els.track.parentElement;
    if (!carousel.count) { section.classList.add("hidden"); return; }
    section.classList.remove("hidden");

    els.track.innerHTML = carousel.picks.map((w, i) => slideHTML(w, i, carousel.count)).join("");
    els.dots.innerHTML = carousel.picks.map((w, i) =>
        `<button type="button" role="tab" data-slide="${i}" aria-label="Ir a la obra ${i + 1}" class="w-2.5 h-2.5 rounded-full bg-white/50 aria-selected:bg-white aria-selected:scale-125 transition-all"></button>`).join("");

    const multiple = carousel.count > 1;
    els.carouselPrev.classList.toggle("hidden", !multiple);
    els.carouselNext.classList.toggle("hidden", !multiple);
    els.dots.classList.toggle("hidden", !multiple);
    carousel.index = 0;
    updateCarousel();
    if (multiple) startAutoplay();
}

function updateCarousel() {
    els.track.style.transform = `translateX(-${carousel.index * 100}%)`;
    [...els.track.children].forEach((slide, i) => {
        const active = i === carousel.index;
        slide.toggleAttribute("inert", !active);
        slide.setAttribute("aria-hidden", String(!active));
    });
    els.dots.querySelectorAll("[data-slide]").forEach((dot, i) => dot.setAttribute("aria-selected", String(i === carousel.index)));
}

function moveSlide(step, { userInitiated = false } = {}) {
    if (carousel.count < 2) return;
    carousel.index = (carousel.index + step + carousel.count) % carousel.count;
    updateCarousel();
    if (userInitiated) startAutoplay();
}

function startAutoplay() {
    stopAutoplay();
    if (REDUCED_MOTION || carousel.count < 2) return;
    carousel.timer = setInterval(() => moveSlide(1), 6000);
}
function stopAutoplay() { clearInterval(carousel.timer); carousel.timer = null; }

function setupCarouselEvents() {
    els.carouselPrev.addEventListener("click", () => moveSlide(-1, { userInitiated: true }));
    els.carouselNext.addEventListener("click", () => moveSlide(1, { userInitiated: true }));
    els.dots.addEventListener("click", (e) => {
        const dot = e.target.closest("[data-slide]");
        if (!dot) return;
        carousel.index = Number(dot.dataset.slide);
        updateCarousel();
        startAutoplay();
    });

    const section = els.track.parentElement;
    section.addEventListener("mouseenter", stopAutoplay);
    section.addEventListener("mouseleave", startAutoplay);
    section.addEventListener("focusin", stopAutoplay);
    section.addEventListener("focusout", startAutoplay);
    document.addEventListener("visibilitychange", () => (document.hidden ? stopAutoplay() : startAutoplay()));

    // Deslizar con el dedo en pantallas táctiles
    let startX = null;
    section.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    section.addEventListener("touchend", (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) moveSlide(dx < 0 ? 1 : -1, { userInitiated: true });
    }, { passive: true });
}

// ---------------------------------------------------------------- Visor (modal)
const viewer = { obra: null, list: [], images: [], index: 0, panzoom: null, rotation: 0, lastFocus: null, swipeStart: null };

const ICON = {
    close: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    prev: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>',
    next: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>',
    rotate: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>',
    minus: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>',
    plus: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>',
    reset: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>',
    share: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zm12 7a3 3 0 100-6 3 3 0 000 6z"/></svg>',
};

const toolBtn = "bg-white border border-line text-ink p-2 rounded-sm shadow-sm hover:bg-gray-50 transition-colors";
const navBtn = "absolute top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white border border-line text-ink p-2.5 rounded-full shadow-sm z-10";

function isModalOpen() { return !els.modal.classList.contains("hidden"); }

function workUrl(obra) {
    return `${location.origin}${location.pathname}#obra/${encodeURIComponent(obra.id)}`;
}

function modalHTML(obra) {
    const title = clean(obra.titulo) || "Sin título";
    const available = obra.is_available !== false;
    const price = visiblePrice(obra);
    const meta = [capitalize(obra.serie) || "Serie general", obra.anio || "s/f"].join(" — ");
    const message = `Hola Francisco! Quería consultarte por la obra: ${title}\n${workUrl(obra)}`;
    const pos = viewer.list.findIndex((w) => w.id === obra.id);
    const hasNav = viewer.list.length > 1 && pos >= 0;
    return `
        <div class="flex md:hidden justify-between items-center px-4 py-3 border-b border-line bg-white flex-shrink-0">
            <span class="font-display font-semibold text-ink truncate pr-4">${esc(title)}</span>
            <button type="button" data-close class="text-ink p-1 -mr-1" aria-label="Cerrar">${ICON.close}</button>
        </div>
        <div class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden relative">
            <button type="button" data-close class="hidden md:block absolute top-4 right-4 z-[60] text-muted hover:text-ink transition-colors p-2 bg-white rounded-full shadow-sm" aria-label="Cerrar">${ICON.close}</button>

            <div id="zoom-container" class="w-full md:w-[65%] relative bg-paper flex items-center justify-center border-b md:border-b-0 md:border-r border-line h-[46vh] md:h-[80vh] flex-shrink-0 overflow-hidden group">
                <div id="panzoom-wrapper" class="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing">
                    <img id="zoom-image" src="${PLACEHOLDER_IMG}" alt="${esc(title)}" draggable="false" class="max-w-full max-h-full object-contain pointer-events-none p-4 md:p-8 transition-transform duration-300 ease-out">
                </div>
                <button type="button" id="img-prev" class="${navBtn} left-3" aria-label="Imagen anterior">${ICON.prev}</button>
                <button type="button" id="img-next" class="${navBtn} right-3" aria-label="Imagen siguiente">${ICON.next}</button>
                <span id="img-counter" class="absolute top-3 left-3 bg-black/55 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm" aria-live="polite"></span>
                <div id="zoom-tools" class="absolute bottom-3 right-3 flex gap-2 z-10">
                    <button type="button" id="zoom-rotate" class="${toolBtn}" title="Rotar 90°" aria-label="Rotar 90 grados">${ICON.rotate}</button>
                    <button type="button" id="zoom-out" class="${toolBtn}" title="Alejar" aria-label="Alejar">${ICON.minus}</button>
                    <button type="button" id="zoom-in" class="${toolBtn}" title="Acercar" aria-label="Acercar">${ICON.plus}</button>
                    <button type="button" id="zoom-reset" class="${toolBtn}" title="Restaurar vista" aria-label="Restaurar vista">${ICON.reset}</button>
                </div>
                <p id="zoom-hint" class="hidden md:block absolute bottom-3 left-3 text-[11px] text-muted bg-white/80 px-2 py-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity">Doble clic para acercar · ← → para cambiar de foto</p>
            </div>

            <div class="w-full md:w-[35%] flex flex-col p-6 md:p-10 bg-white overflow-y-auto min-h-0">
                <div class="mb-6 pr-8">
                    <h2 id="modal-title" class="text-3xl font-display text-ink leading-tight mb-2 tracking-tight">${esc(title)}</h2>
                    <p class="text-muted text-sm tracking-wide">${esc(meta)}</p>
                </div>
                <dl class="space-y-2 text-sm text-muted">
                    <div class="flex gap-2"><dt class="font-medium text-ink">Técnica:</dt><dd>${esc(clean(obra.tecnica) || "No especificada")}</dd></div>
                    <div class="flex gap-2"><dt class="font-medium text-ink">Medidas:</dt><dd>${esc(clean(obra.medidas) || "No especificadas")}</dd></div>
                    ${obra.categoria ? `<div class="flex gap-2"><dt class="font-medium text-ink">Categoría:</dt><dd>${esc(capitalize(obra.categoria))}</dd></div>` : ""}
                </dl>
                ${clean(obra.descripcion) ? `<p class="mt-5 text-sm leading-relaxed whitespace-pre-line text-muted">${esc(clean(obra.descripcion))}</p>` : ""}
                <div id="thumbs-block" class="mt-8 pt-6 border-t border-line hidden">
                    <p class="text-xs text-muted uppercase tracking-widest mb-3 font-medium">Otras vistas</p>
                    <div id="modal-gallery-thumbnails" class="flex flex-wrap gap-2"></div>
                </div>
                <div class="mt-auto pt-8">
                    <div class="pt-6 border-t border-line">
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-5 gap-2">
                            <span class="text-sm ${available ? "text-ok" : "text-muted"}">${available ? "Disponible para adquisición" : "Colección privada"}</span>
                            ${price ? `<span class="text-xl text-ink font-medium">${esc(price)}</span>` : ""}
                        </div>
                        <div class="flex gap-2">
                            <a href="${esc(whatsappLink(message))}" target="_blank" rel="noopener noreferrer"
                               class="flex-1 block text-center border-2 border-ink text-ink hover:bg-ink hover:text-white py-3 rounded-sm font-medium transition-colors text-sm tracking-wide">
                                Consultar por WhatsApp
                            </a>
                            <button type="button" data-share class="border-2 border-line text-ink hover:border-ink px-3.5 rounded-sm transition-colors" aria-label="Compartir esta obra" title="Compartir">${ICON.share}</button>
                        </div>
                        ${hasNav ? `
                        <div class="flex items-center justify-between mt-6 text-sm text-muted">
                            <button type="button" data-work-nav="-1" class="hover:text-ink transition-colors py-1">← Obra anterior</button>
                            <span class="text-xs">${pos + 1} de ${viewer.list.length}</span>
                            <button type="button" data-work-nav="1" class="hover:text-ink transition-colors py-1">Obra siguiente →</button>
                        </div>` : ""}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderThumbs() {
    const block = $("thumbs-block");
    const wrap = $("modal-gallery-thumbnails");
    if (!block || !wrap) return;
    block.classList.toggle("hidden", viewer.images.length < 2);
    wrap.innerHTML = viewer.images.map((url, i) => `
        <button type="button" data-thumb="${i}" aria-label="Ver imagen ${i + 1}" aria-current="${i === viewer.index}"
                class="w-14 h-14 border-2 ${i === viewer.index ? "border-accent" : "border-line"} rounded-sm overflow-hidden hover:border-muted transition-colors">
            <img src="${esc(url)}" alt="" loading="lazy" class="w-full h-full object-cover">
        </button>`).join("");
}

function showImage(i) {
    const img = $("zoom-image");
    if (!img) return;
    const n = viewer.images.length;
    viewer.index = n ? (i + n) % n : 0;
    viewer.rotation = 0;
    img.style.transform = "";
    img.dataset.failed = "";
    img.src = n ? viewer.images[viewer.index] : PLACEHOLDER_IMG;
    viewer.panzoom?.reset({ animate: false });
    if (n > 1) new Image().src = viewer.images[(viewer.index + 1) % n];   // precarga la siguiente

    const multiple = n > 1;
    $("img-prev")?.classList.toggle("hidden", !multiple);
    $("img-next")?.classList.toggle("hidden", !multiple);
    const counter = $("img-counter");
    if (counter) { counter.textContent = `${viewer.index + 1} / ${n}`; counter.classList.toggle("hidden", !multiple); }
    $("zoom-tools")?.classList.toggle("hidden", !n);
    renderThumbs();
}

/** Quita del visor una imagen que no existe más y muestra la siguiente. */
function dropImage(url) {
    const at = viewer.images.indexOf(url);
    if (at === -1) return;
    viewer.images.splice(at, 1);
    showImage(Math.min(viewer.index > at ? viewer.index - 1 : viewer.index, viewer.images.length - 1));
}

function setupViewer() {
    const wrapper = $("panzoom-wrapper");
    const container = $("zoom-container");
    viewer.panzoom = null;

    if (wrapper && container && typeof Panzoom !== "undefined") {
        const pz = Panzoom(wrapper, { maxScale: 5, minScale: 1, step: 0.3, contain: "outside" });
        viewer.panzoom = pz;
        container.addEventListener("wheel", pz.zoomWithWheel);
        $("zoom-in")?.addEventListener("click", () => pz.zoomIn());
        $("zoom-out")?.addEventListener("click", () => pz.zoomOut());
        $("zoom-reset")?.addEventListener("click", () => { pz.reset(); viewer.rotation = 0; $("zoom-image").style.transform = ""; });
        // Doble clic / doble toque: acerca al punto tocado o vuelve al tamaño normal
        container.addEventListener("dblclick", (e) => {
            if (e.target.closest("button")) return;
            if (pz.getScale() > 1.05) pz.reset();
            else pz.zoomToPoint(2.5, { clientX: e.clientX, clientY: e.clientY });
        });
    } else {
        // Sin la librería de zoom, se ocultan solo los botones de zoom (rotar y navegar siguen funcionando)
        ["zoom-in", "zoom-out", "zoom-reset"].forEach((id) => $(id)?.classList.add("hidden"));
    }

    // Deslizar horizontalmente para pasar de foto (solo cuando no hay zoom)
    container?.addEventListener("pointerdown", (e) => {
        viewer.swipeStart = e.pointerType === "touch" && !e.target.closest("button") ? { x: e.clientX, y: e.clientY } : null;
    });
    container?.addEventListener("pointerup", (e) => {
        const s = viewer.swipeStart;
        viewer.swipeStart = null;
        if (!s || (viewer.panzoom && viewer.panzoom.getScale() > 1.05)) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) > 55 && Math.abs(dy) < 70) showImage(viewer.index + (dx < 0 ? 1 : -1));
    });

    $("zoom-rotate")?.addEventListener("click", () => {
        viewer.rotation = (viewer.rotation + 90) % 360;
        $("zoom-image").style.transform = `rotate(${viewer.rotation}deg)`;
    });
    $("img-prev")?.addEventListener("click", () => showImage(viewer.index - 1));
    $("img-next")?.addEventListener("click", () => showImage(viewer.index + 1));
    $("modal-gallery-thumbnails")?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-thumb]");
        if (btn) showImage(Number(btn.dataset.thumb));
    });

    // Imágenes que no existen más: se descartan en lugar de mostrar un ícono roto
    $("zoom-image")?.addEventListener("error", (e) => {
        const url = e.target.getAttribute("src");
        if (url && url !== PLACEHOLDER_IMG) dropImage(url);
    });
    $("modal-gallery-thumbnails")?.addEventListener("error", (e) => {
        if (e.target instanceof HTMLImageElement) dropImage(e.target.getAttribute("src"));
    }, true);
}

/** Dibuja una obra en el visor. mode: "push" (abre), "replace" (cambia de obra) o "history" (viene del historial). */
function showWork(obra, mode = "push") {
    if (!obra) return;
    const hash = `#obra/${encodeURIComponent(obra.id)}`;
    if (mode === "push") history.pushState({ obra: obra.id }, "", hash);
    else if (mode === "replace") history.replaceState({ obra: obra.id }, "", hash);

    viewer.panzoom?.destroy();
    viewer.panzoom = null;
    viewer.obra = obra;
    viewer.list = state.filtered.some((w) => w.id === obra.id) ? state.filtered : state.works;
    viewer.images = imageUrls(obra);
    viewer.index = 0;
    document.title = `${clean(obra.titulo) || "Obra"} | Francisco Fernández`;

    els.modalContent.innerHTML = modalHTML(obra);
    setupViewer();
    showImage(0);
    els.modalContent.querySelector(".overflow-y-auto")?.scrollTo({ top: 0 });
}

function openModal(obra, { fromHistory = false } = {}) {
    if (!obra) return;
    viewer.lastFocus = document.activeElement;
    showWork(obra, fromHistory ? "history" : "push");
    els.modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    // Foco en el botón de cerrar que esté visible (el de escritorio o el del encabezado móvil)
    [...els.modal.querySelectorAll("[data-close]")].find((b) => b.offsetParent !== null)?.focus({ preventScroll: true });
}

function navigateWork(step) {
    const pos = viewer.list.findIndex((w) => w.id === viewer.obra?.id);
    if (pos < 0) return;
    const next = viewer.list[(pos + step + viewer.list.length) % viewer.list.length];
    showWork(next, "replace");
}

function closeModal({ fromHistory = false } = {}) {
    if (!isModalOpen()) return;
    viewer.panzoom?.destroy();
    viewer.panzoom = null;
    els.modal.classList.add("hidden");
    els.modalContent.innerHTML = "";
    document.body.style.overflow = "";
    document.title = "Obras | Francisco Fernández — Artista visual";
    viewer.lastFocus?.focus?.({ preventScroll: true });
    viewer.obra = null;

    if (!fromHistory) {
        if (history.state?.obra) history.back();
        else history.replaceState(null, "", location.pathname + location.search);
    }
}

async function shareWork() {
    const obra = viewer.obra;
    if (!obra) return;
    const data = { title: clean(obra.titulo), text: `${clean(obra.titulo)} — Francisco Fernández`, url: workUrl(obra) };
    if (navigator.share) {
        try { await navigator.share(data); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(data.url); showToast("Enlace copiado"); }
    catch { showToast(data.url); }
}

function hashWorkId() {
    const m = location.hash.match(/^#obra\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
}

function syncModalWithHash() {
    if (!state.loaded) return;
    const id = hashWorkId();
    if (id) {
        if (viewer.obra?.id === id && isModalOpen()) return;
        const obra = state.works.find((w) => w.id === id);
        if (obra) openModal(obra, { fromHistory: true });
    } else if (isModalOpen()) {
        closeModal({ fromHistory: true });
    }
}

function trapFocus(e) {
    const focusable = [...els.modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ---------------------------------------------------------------- Menú, navegación y eventos
function setupHeader() {
    const toggle = $("menu-toggle");
    const menu = $("mobile-menu");
    const setOpen = (open) => {
        menu.classList.toggle("hidden", !open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
        $("menu-icon-open").classList.toggle("hidden", open);
        $("menu-icon-close").classList.toggle("hidden", !open);
    };
    toggle.addEventListener("click", () => setOpen(menu.classList.contains("hidden")));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });

    // Resalta en el menú la sección que se está viendo
    const links = [...document.querySelectorAll(".nav-link")];
    const sections = links.map((l) => document.getElementById(l.dataset.nav)).filter(Boolean);
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                links.forEach((l) => {
                    const on = l.dataset.nav === entry.target.id;
                    l.classList.toggle("text-accent", on);
                    l.classList.toggle("border-accent", on);
                    l.classList.toggle("text-muted", !on);
                    l.classList.toggle("border-transparent", !on);
                });
            });
        }, { rootMargin: "-40% 0px -55% 0px" });
        sections.forEach((s) => observer.observe(s));
    }

    // Botón "volver arriba"
    window.addEventListener("scroll", () => {
        const show = window.scrollY > 900;
        els.toTop.classList.toggle("hidden", !show);
        els.toTop.classList.toggle("flex", show);
    }, { passive: true });
    els.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? "auto" : "smooth" }));
}

function setupEvents() {
    installImageFallback(els.gallery);
    installImageFallback(els.track);
    // Fundido de las imágenes al terminar de cargar (el evento "load" no burbujea: se usa la fase de captura)
    els.gallery.addEventListener("load", (e) => { if (e.target.classList?.contains("img-fade")) e.target.classList.add("is-loaded"); }, true);
    els.gallery.addEventListener("error", (e) => { if (e.target.classList?.contains("img-fade")) e.target.classList.add("is-loaded"); }, true);

    // Abrir una obra desde tarjetas o desde el carrusel
    document.addEventListener("click", (e) => {
        const openBtn = e.target.closest("[data-open]");
        if (openBtn) { openModal(state.works.find((w) => w.id === openBtn.dataset.open)); return; }
        if (e.target.closest("[data-clear]")) clearFilters();
    });

    // Visor: cerrar (botón, fondo oscuro, Escape, "atrás" del celular), compartir y pasar de obra
    els.modal.addEventListener("click", (e) => {
        if (e.target === els.modal || e.target.closest("[data-close]")) closeModal();
        else if (e.target.closest("[data-share]")) shareWork();
        else if (e.target.closest("[data-work-nav]")) navigateWork(Number(e.target.closest("[data-work-nav]").dataset.workNav));
    });
    document.addEventListener("keydown", (e) => {
        if (!isModalOpen()) return;
        if (e.key === "Escape") closeModal();
        else if (e.key === "ArrowLeft") showImage(viewer.index - 1);
        else if (e.key === "ArrowRight") showImage(viewer.index + 1);
        else if (e.key === "Tab") trapFocus(e);
    });
    window.addEventListener("popstate", syncModalWithHash);

    // Búsqueda y filtros (todo en memoria: respuesta inmediata)
    let timer;
    els.search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.query = els.search.value; if (state.loaded) applyFilters(1); }, 200);
    });
    els.chips.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-cat]");
        if (!chip) return;
        state.category = chip.dataset.cat;
        applyFilters(1);
    });
    els.series.addEventListener("change", () => { state.series = els.series.value; applyFilters(1); });
    els.available.addEventListener("change", () => { state.onlyAvailable = els.available.checked; applyFilters(1); });
    els.clear.addEventListener("click", clearFilters);

    els.prev.addEventListener("click", () => state.page > 1 && goToPage(state.page - 1));
    els.next.addEventListener("click", () => state.page < state.totalPages && goToPage(state.page + 1));

    setupCarouselEvents();
    setupHeader();

    const wa = $("whatsapp-contact");
    if (wa) wa.href = whatsappLink();
    const year = $("year");
    if (year) year.textContent = new Date().getFullYear();
}

// ---------------------------------------------------------------- Modo administrador (menú oculto)
// Solo existe para quien inició sesión en el panel con una cuenta administradora. Los visitantes nunca lo ven.
let adminBarModule = null;
const adminApi = {
    state, els, SITE, sortWorks, showToast, clearFilters,
    rerender: () => applyFilters(state.page),
    reloadAll: () => { initCarousel(); applyFilters(state.page); },
};

onAuthStateChanged(auth, async (user) => {
    let isAdmin = false;
    if (user) {
        try { isAdmin = (await user.getIdTokenResult()).claims.admin === true; } catch { isAdmin = false; }
    }
    if (isAdmin === state.isAdmin) return;
    state.isAdmin = isAdmin;
    try {
        adminBarModule ??= await import("./admin-bar.js");
        if (isAdmin) adminBarModule.mountAdminBar(adminApi); else adminBarModule.unmountAdminBar();
    } catch (error) {
        console.error("No se pudo cargar el menú de administrador", error);
    }
    if (state.loaded) applyFilters(state.page);
});

setupEvents();
loadWorks();
