// js/main.js — Galería pública
import { db } from "../src/firebaseConfig.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
    loaded: false,
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
    category: $("filter-category"),
    series: $("filter-series"),
    clear: $("clear-filters"),
    count: $("results-count"),
    track: $("carousel-track"),
    carouselPrev: $("carousel-prev"),
    carouselNext: $("carousel-next"),
    dots: $("carousel-dots"),
    modal: $("modal"),
    modalContent: $("modal-content"),
};

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
        populateFilters();
        initCarousel();
        applyFilters(1);
        syncModalWithHash();
    } catch (error) {
        console.error("Error al cargar la galería:", error);
        showLoadError();
    }
}

// ---------------------------------------------------------------- Filtros
function uniqueOptions(field) {
    const map = new Map();
    for (const w of state.works) {
        const label = clean(w[field]);
        if (label && !map.has(norm(label))) map.set(norm(label), capitalize(label));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
}

function fillSelect(select, field, allLabel) {
    select.innerHTML = `<option value="">${esc(allLabel)}</option>` +
        uniqueOptions(field).map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");
}

function populateFilters() {
    fillSelect(els.category, "categoria", "Todas las categorías");
    fillSelect(els.series, "serie", "Todas las series");
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
        (!state.series || norm(w.serie) === state.series));

    state.totalPages = Math.max(1, Math.ceil(state.filtered.length / SITE.pageSize));
    state.page = Math.min(Math.max(1, page), state.totalPages);

    const active = Boolean(tokens.length || state.category || state.series);
    els.clear.classList.toggle("hidden", !active);
    renderGallery();
    renderCount(active);
    renderPagination();
}

function renderCount(active) {
    const total = state.works.length;
    const n = state.filtered.length;
    if (!total) { els.count.textContent = ""; return; }
    els.count.textContent = active
        ? `${n} ${n === 1 ? "obra encontrada" : "obras encontradas"} de ${total}`
        : `${total} ${total === 1 ? "obra" : "obras"}`;
}

function clearFilters() {
    state.query = ""; state.category = ""; state.series = "";
    els.search.value = ""; els.category.value = ""; els.series.value = "";
    applyFilters(1);
}

// ---------------------------------------------------------------- Galería
function statusBadge(obra) {
    const available = obra.is_available !== false;
    return available
        ? `<span class="inline-flex items-center gap-1.5 text-xs text-ok font-medium"><span class="w-1.5 h-1.5 rounded-full bg-ok"></span>Disponible</span>`
        : `<span class="inline-flex items-center gap-1.5 text-xs text-muted"><span class="w-1.5 h-1.5 rounded-full bg-muted/60"></span>Privada</span>`;
}

function cardHTML(obra, index) {
    const [first, ...rest] = imageUrls(obra);
    const title = clean(obra.titulo) || "Sin título";
    const subtitle = [capitalize(obra.categoria), obra.anio].filter(Boolean).join(" · ") || "Obra";
    const price = obra.show_price && obra.price ? formatPrice(obra.price, obra.currency) : "";
    const photos = rest.length + (first ? 1 : 0);
    return `
        <article class="fade-in" style="animation-delay:${Math.min(index, 11) * 35}ms">
            <button type="button" data-open="${esc(obra.id)}" class="group block w-full text-left" aria-label="Ver detalle de ${esc(title)}">
                <div class="aspect-[4/5] overflow-hidden bg-line/60 relative mb-4">
                    <img src="${esc(first || PLACEHOLDER_IMG)}" data-fallbacks="${esc(JSON.stringify(rest))}"
                         alt="${esc(title)}" width="400" height="500" loading="${index < 4 ? "eager" : "lazy"}" decoding="async"
                         class="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out">
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
    const start = (state.page - 1) * SITE.pageSize;
    const pageWorks = state.filtered.slice(start, start + SITE.pageSize);

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
}

function renderPagination() {
    const show = state.totalPages > 1;
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
    carousel.picks = state.works.filter((w) => imageUrls(w).length).slice(0, SITE.heroSlides);
    carousel.count = carousel.picks.length;
    const section = els.track.parentElement;
    if (!carousel.count) { section.classList.add("hidden"); return; }

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
const viewer = { obra: null, images: [], index: 0, panzoom: null, rotation: 0, lastFocus: null };

const ICON = {
    close: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    prev: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>',
    next: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>',
    rotate: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>',
    minus: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>',
    plus: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>',
    reset: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>',
};

const toolBtn = "bg-white border border-line text-ink p-2 rounded-sm shadow-sm hover:bg-gray-50 transition-colors";
const navBtn = "absolute top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white border border-line text-ink p-2.5 rounded-full shadow-sm z-10";

function isModalOpen() { return !els.modal.classList.contains("hidden"); }

function modalHTML(obra) {
    const title = clean(obra.titulo) || "Sin título";
    const available = obra.is_available !== false;
    const price = obra.show_price && obra.price ? formatPrice(obra.price, obra.currency) : "";
    const meta = [capitalize(obra.serie) || "Serie general", obra.anio || "s/f"].join(" — ");
    const message = `Hola Francisco! Quería consultarte por la obra: ${title}`;
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
            </div>

            <div class="w-full md:w-[35%] flex flex-col p-6 md:p-10 bg-white overflow-y-auto min-h-0">
                <div class="mb-6">
                    <h2 id="modal-title" class="text-3xl font-display text-ink leading-tight mb-2 tracking-tight pr-8">${esc(title)}</h2>
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
                        <a href="${esc(whatsappLink(message))}" target="_blank" rel="noopener noreferrer"
                           class="block text-center border-2 border-ink text-ink hover:bg-ink hover:text-white py-3 rounded-sm font-medium transition-colors text-sm tracking-wide">
                            Consultar por WhatsApp
                        </a>
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
    } else {
        // Sin la librería de zoom, se ocultan solo los botones de zoom (rotar y navegar siguen funcionando)
        ["zoom-in", "zoom-out", "zoom-reset"].forEach((id) => $(id)?.classList.add("hidden"));
    }

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

function openModal(obra, { fromHistory = false } = {}) {
    if (!obra) return;
    if (!fromHistory) history.pushState({ obra: obra.id }, "", `#obra/${encodeURIComponent(obra.id)}`);

    viewer.obra = obra;
    viewer.images = imageUrls(obra);
    viewer.index = 0;
    viewer.lastFocus = document.activeElement;

    els.modalContent.innerHTML = modalHTML(obra);
    els.modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    setupViewer();
    showImage(0);
    // Foco en el botón de cerrar que esté visible (el de escritorio o el del encabezado móvil)
    [...els.modal.querySelectorAll("[data-close]")].find((b) => b.offsetParent !== null)?.focus({ preventScroll: true });
}

function closeModal({ fromHistory = false } = {}) {
    if (!isModalOpen()) return;
    viewer.panzoom?.destroy();
    viewer.panzoom = null;
    els.modal.classList.add("hidden");
    els.modalContent.innerHTML = "";
    document.body.style.overflow = "";
    viewer.lastFocus?.focus?.({ preventScroll: true });
    viewer.obra = null;

    if (!fromHistory) {
        if (history.state?.obra) history.back();
        else history.replaceState(null, "", location.pathname + location.search);
    }
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
}

function setupEvents() {
    installImageFallback(els.gallery);
    installImageFallback(els.track);

    // Abrir una obra desde tarjetas o desde el carrusel
    document.addEventListener("click", (e) => {
        const openBtn = e.target.closest("[data-open]");
        if (openBtn) { openModal(state.works.find((w) => w.id === openBtn.dataset.open)); return; }
        if (e.target.closest("[data-clear]")) clearFilters();
    });

    // Cerrar el visor: botón, clic en el fondo oscuro, Escape, botón "atrás" del celular
    els.modal.addEventListener("click", (e) => {
        if (e.target === els.modal || e.target.closest("[data-close]")) closeModal();
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
    els.category.addEventListener("change", () => { state.category = els.category.value; applyFilters(1); });
    els.series.addEventListener("change", () => { state.series = els.series.value; applyFilters(1); });
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

setupEvents();
loadWorks();
