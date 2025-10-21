// js/main.js

// --- INICIALIZACIÓN Y VARIABLES GLOBALES ---
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

let productosCache = [];
let carouselIntervalId = null;
let isEditing = false;
let sortableInstance = null;
// let arePricesVisible = localStorage.getItem('pricesVisible') === null ? true : localStorage.getItem('pricesVisible') === 'true'; // Comentado

let currentPage = 0;
const PAGE_SIZE = 8;
let isLoading = false;
let allDataLoaded = false;
let currentFilters = { query: '', year: '', category: '', series: '', availability: '' };
let filterDebounceTimer;

// --- ELEMENTOS DEL DOM ---
const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const alertDiv = document.getElementById('alert');
const loadMoreTrigger = document.getElementById('load-more-trigger');
const loadMoreSpinner = loadMoreTrigger ? loadMoreTrigger.querySelector('.lds-ring') : null;
const searchInput = document.getElementById("search");
const filterYear = document.getElementById("filter-year");
const filterCategory = document.getElementById("filter-category");
const filterSeries = document.getElementById("filter-series");
const filterAvailability = document.getElementById("filter-availability");
const adminControls = document.getElementById("admin-controls");
const editToggleButton = document.getElementById("edit-toggle");
const saveOrderButton = document.getElementById("save-order-button");
// const togglePricesButton = document.getElementById("toggle-prices"); // Comentado
const whatsappButton = document.getElementById('whatsapp-btn');
const mainFooter = document.getElementById('main-footer');
const gallerySection = document.getElementById('gallery-section');

// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    if (!alertDiv) return;
    alertDiv.textContent = message;
    alertDiv.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[1001] px-6 py-3 rounded-md shadow-lg text-sm font-medium transition-opacity duration-300 opacity-0';
    if (type === 'error') alertDiv.classList.add('bg-red-100', 'text-red-700');
    else if (type === 'info') alertDiv.classList.add('bg-blue-100', 'text-blue-700');
    else alertDiv.classList.add('bg-green-100', 'text-green-700');
    alertDiv.classList.remove('hidden');
    void alertDiv.offsetWidth;
    alertDiv.classList.add('opacity-100');
    setTimeout(() => {
        alertDiv.classList.remove('opacity-100');
        setTimeout(() => alertDiv.classList.add('hidden'), 300);
    }, 5000);
}
window.showAlert = showAlert;

function formatPrice(price) {
    if (price === null || price === undefined) return 'Consultar';
    const formatted = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
    return `$${formatted}`;
}

function getPublicImageUrl(path) {
    if (!path) return 'https://via.placeholder.com/400x300?text=Sin+Imagen';
    const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
}

// --- LÓGICA DE VERIFICACIÓN DE ADMIN ---
async function checkAdminStatus() {
    try {
        const { data: { session } } = await client.auth.getSession();
        if (adminControls) adminControls.classList.toggle('hidden', !session);
    } catch (e) { console.warn("Error checking admin status:", e); }
}

// --- LÓGICA DEL CARRUSEL DE FONDO ---
const carouselContainer = document.getElementById('carousel-container');
let currentCarouselIndex = 0;

function renderCarouselItems(carouselUrls) {
    if (!carouselContainer || carouselUrls.length === 0) return;
    if (carouselIntervalId) clearInterval(carouselIntervalId);
    carouselContainer.innerHTML = carouselUrls.map((url, index) => `<div class="carousel-item ${index === 0 ? 'active' : ''}" style="background-image: url('${url}')"></div>`).join('');
    if (carouselUrls.length > 1) carouselIntervalId = setInterval(nextCarouselItem, 5000);
}

function nextCarouselItem() {
    const items = document.querySelectorAll('#carousel-container .carousel-item');
    if (items.length <= 1) return;
    items[currentCarouselIndex].classList.remove('active');
    currentCarouselIndex = (currentCarouselIndex + 1) % items.length;
    items[currentCarouselIndex].classList.add('active');
}

// --- LÓGICA DE CARGA Y RENDERIZADO DE LA GALERÍA ---
function normalize(p) {
    const images = p.imagenes || [];
    const imagesWithUrls = images.map(img => ({ ...img, url: getPublicImageUrl(img.path) }));
    return {
        id: p.id, title: p.titulo || "", technique: p.tecnica || "", size: p.medidas || "",
        year: p.anio || 0, description: p.descripcion || "", order: p.orden || 0,
        category: p.categoria || "", serie: p.serie || "", price: p.price,
        is_available: p.is_available, show_price: p.show_price, images: imagesWithUrls,
        mainImage: imagesWithUrls.length ? imagesWithUrls[0].url : "https://via.placeholder.com/400x300?text=Sin+Imagen"
    };
}

// --- appendToGallery CON COMENTARIOS ELIMINADOS ---
function appendToGallery(items) {
    if (!galleryContainer) return;
    if (items.length === 0 && currentPage === 1) {
        galleryContainer.innerHTML = '<p class="col-span-full text-center text-text-secondary">No se encontraron obras que coincidan.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(obra => {
        const card = document.createElement("div");
        card.className = "relative bg-bg-surface rounded-sm overflow-hidden shadow-md hover:shadow-lg transition duration-300 transform hover:-translate-y-1 group border border-border-default";
        card.setAttribute('data-id', obra.id);

        const availabilityText = obra.is_available ? 'Disponible' : 'Vendida';
        const availabilityClass = obra.is_available ? 'text-green-600' : 'text-red-500';

        const detailsParts = [obra.technique, obra.size].filter(Boolean);
        const detailsText = detailsParts.join(' &middot; ');

        card.innerHTML = `
            <div class="edit-controls absolute top-2 right-2 z-10 flex items-center space-x-1 bg-white/70 backdrop-blur-sm p-1 rounded-full shadow hidden">
                <a href="./admin.html?edit=${obra.id}" target="_blank" class="p-1 text-gray-500 hover:text-accent-blue" title="Editar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg></a>
                <button type="button" class="drag-handle p-1 text-gray-500 hover:text-accent-blue cursor-move" title="Ordenar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
            </div>
            <div class="card-content cursor-pointer" onclick="openModal(${obra.id})">
                <div class="aspect-[4/3] overflow-hidden flex items-center justify-center bg-gray-50">
                    <img src="${obra.mainImage}" alt="${obra.title || 'Obra de F. Fernández'}" class="w-full h-full object-contain transition duration-300 group-hover:scale-105" loading="lazy" onerror="this.onerror=null;this.src='https://via.placeholder.com/400x300?text=Error';">
                </div>
                <div class="p-4 border-t border-border-default">
                    <h3 class="text-lg font-medium text-text-main truncate mb-1">${obra.title}</h3>
                    <p class="text-xs text-text-secondary uppercase tracking-wide">
                        ${detailsText ? `${detailsText} &middot; ` : ''}<span class="text-accent-blue font-medium">${obra.year}</span>
                    </p>
                    <div class="flex justify-between items-center pt-3 mt-3 border-t border-border-default">
                        <span class="text-xs font-medium ${availabilityClass} uppercase tracking-wider">${availabilityText}</span>
                    </div>
                </div>
            </div>`;
        fragment.appendChild(card);
    });
    galleryContainer.appendChild(fragment);

    if (isEditing && galleryContainer.querySelectorAll) {
        galleryContainer.querySelectorAll('.edit-controls').forEach(el => el.classList.remove('hidden'));
    }
}


async function fetchGalleryPage() {
    currentPage++;
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    if (isLoading || allDataLoaded) { currentPage--; return; }
    isLoading = true;

    if (currentPage === 1 && loadingOverlay) loadingOverlay.classList.remove('hidden');
    else if (loadMoreSpinner) loadMoreSpinner.classList.remove('hidden');

    let query = client.from('productos').select('*', { count: 'exact' })
                      .order('orden', { ascending: true }).range(from, to);

    if (currentFilters.query) query = query.or(`titulo.ilike.%${currentFilters.query}%,descripcion.ilike.%${currentFilters.query}%,tecnica.ilike.%${currentFilters.query}%`);
    if (currentFilters.year) query = query.eq('anio', currentFilters.year);
    if (currentFilters.category) query = query.eq('categoria', currentFilters.category);
    if (currentFilters.series) query = query.eq('serie', currentFilters.series);
    if (currentFilters.availability !== "") query = query.eq('is_available', currentFilters.availability === 'true');

    try {
        const { data, error, count } = await query;
        if (error) throw error;
        const newProductos = data.map(normalize);
        productosCache.push(...newProductos);
        appendToGallery(newProductos);
        if (newProductos.length < PAGE_SIZE || (count !== null && productosCache.length >= count)) {
            allDataLoaded = true;
            if(loadMoreTrigger) loadMoreTrigger.classList.add('hidden');
        }
    } catch (error) {
        console.error("Error loading gallery:", error); showAlert("Error al cargar obras: " + error.message, 'error');
        currentPage--;
    } finally {
        isLoading = false;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        if (loadMoreSpinner) loadMoreSpinner.classList.add('hidden');
        if (allDataLoaded && loadMoreTrigger) loadMoreTrigger.classList.add('hidden');
    }
}


function setupInfiniteScroll() {
    if (!loadMoreTrigger) return;
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && !allDataLoaded) fetchGalleryPage();
    }, { rootMargin: '200px' });
    observer.observe(loadMoreTrigger);
}


function handleFilterChange() {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
        currentFilters = {
            query: searchInput.value.toLowerCase().trim(),
            year: filterYear.value, category: filterCategory.value,
            series: filterSeries.value, availability: filterAvailability.value,
        };
        currentPage = 0; allDataLoaded = false; productosCache = [];
        if (galleryContainer) galleryContainer.innerHTML = '';
        if (loadMoreTrigger) loadMoreTrigger.classList.remove('hidden');
        if (isEditing) disableSorting();
        fetchGalleryPage().then(() => { if (isEditing) enableSorting(); });
    }, 350);
}


async function fetchAndPopulateFilters() {
    try {
        const { data, error } = await client.from('productos')
            .select('anio, categoria, serie, imagenes').order('orden', { ascending: true });
        if (error) throw error;
        const allItems = data || [];
        const years = [...new Set(allItems.map(p => p.anio).filter(Boolean))].sort((a, b) => b - a);
        const categories = [...new Set(allItems.map(p => p.categoria).filter(Boolean))].sort();
        const seriesList = [...new Set(allItems.map(p => p.serie).filter(Boolean))].sort();

        if(filterYear) filterYear.innerHTML = '<option value="">Año</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        if(filterCategory) filterCategory.innerHTML = '<option value="">Categoría</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
        if(filterSeries) filterSeries.innerHTML = '<option value="">Serie</option>' + seriesList.map(s => `<option value="${s}">${s}</option>`).join('');

        const carouselUrls = allItems.filter(p => p.imagenes && p.imagenes.length > 0).slice(0, 5).map(p => getPublicImageUrl(p.imagenes[0].path));
        renderCarouselItems(carouselUrls);
    } catch (e) { console.warn("Could not load filters/carousel.", e.message); }
}


function toggleEditMode() {
    isEditing = !isEditing;
    if (editToggleButton) editToggleButton.textContent = isEditing ? 'Salir Edición' : 'Activar Edición';
    if (saveOrderButton) saveOrderButton.classList.toggle('hidden', !isEditing);
    if(galleryContainer && galleryContainer.querySelectorAll) {
        galleryContainer.querySelectorAll('.edit-controls').forEach(el => el.classList.toggle('hidden', !isEditing));
        galleryContainer.querySelectorAll('.card-content').forEach(el => el.style.cursor = isEditing ? 'default' : 'pointer');
    }
    if (isEditing) { enableSorting(); showAlert("Modo Edición activado.", 'info'); }
    else { disableSorting(); if (saveOrderButton) { saveOrderButton.classList.add('hidden'); saveOrderButton.disabled = true; }}
}
function enableSorting() {
    if (sortableInstance) disableSorting(); if (!galleryContainer) return;
    sortableInstance = new Sortable(galleryContainer, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', onUpdate: () => { if (saveOrderButton) saveOrderButton.disabled = false; }, });
}
function disableSorting() { if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; } }
async function saveOrder() {
    if (!sortableInstance || !saveOrderButton) return;
    saveOrderButton.textContent = "Guardando..."; saveOrderButton.disabled = true;
    const orderedItems = Array.from(galleryContainer.children).map((card, index) => ({ id: parseInt(card.dataset.id), orden: index }));
    try {
        for (const item of orderedItems) { const { error } = await client.from('productos').update({ orden: item.orden }).eq('id', item.id); if (error) throw error; }
        orderedItems.forEach(item => { const p = productosCache.find(prod => prod.id === item.id); if(p) p.order = item.orden; });
        productosCache.sort((a, b) => (a.order || 0) - (b.order || 0));
        showAlert("Orden guardado.", 'success');
    } catch (error) { console.error("Error saving order:", error); showAlert(`Error: ${error.message}`, 'error'); if (saveOrderButton) saveOrderButton.disabled = false;
    } finally { if (saveOrderButton) { saveOrderButton.textContent = "Guardar Orden"; saveOrderButton.disabled = true; } }
}

// --- LÓGICA DEL MODAL (CON COMENTARIOS ELIMINADOS) ---
window.openModal = (id) => {
    if (isEditing || !modal || !modalContent) return;
    const obra = productosCache.find(p => p.id === id);
    if (!obra) { console.error(`Obra ID ${id} not found.`); showAlert("Error al cargar detalles.", "error"); return; }

    const mainImageHTML = `<div id="modal-main-image-container" class="w-full aspect-[4/3] flex items-center justify-center bg-gray-100 rounded-sm overflow-hidden"><div class="image-zoom-container cursor-zoom-in w-full h-full" onmousemove="zoomImage(event, this)" onmouseleave="resetZoom(this)"><img src="${obra.mainImage}" alt="${obra.title} - Vista principal" class="zoom-image w-full h-full object-contain transition-transform duration-300"/></div></div>`;
    const thumbnailsHTML = obra.images.length > 1 ? `<div id="modal-thumbnails" class="grid grid-cols-5 gap-2 mt-4 w-full max-w-sm mx-auto">${obra.images.map((img, index) => `<div class="thumbnail-item cursor-pointer p-0.5 border-2 ${index === 0 ? 'border-accent-blue' : 'border-transparent'} rounded-sm transition-all" onclick="switchModalImage('${img.url}', this)"><img src="${img.url}" alt="Miniatura ${index + 1}" class="block w-full h-full object-cover"></div>`).join('')}</div>` : '';
    const descriptionHTML = obra.description ? `<div class="mt-6 pt-4 border-t border-border-default text-text-secondary"><h4 class="text-sm font-semibold text-text-main mb-2 uppercase tracking-wider">Descripción</h4><p class="text-sm leading-relaxed">${obra.description}</p></div>` : '';
    const priceText = obra.show_price ? formatPrice(obra.price) : 'Consultar';
    const priceClass = obra.show_price && obra.price !== null ? 'font-semibold text-text-main' : 'font-medium text-accent-blue';
    const availabilityText = obra.is_available ? 'Disponible' : 'Vendida';
    const availabilityClass = obra.is_available ? 'text-green-600' : 'text-red-500';
    const whatsappLink = `https://wa.me/5492805032663?text=Hola%2C%20estoy%20interesado%20en%20la%20obra%20%22${encodeURIComponent(obra.title)}%22%20(ID:%20${obra.id}).`;

    modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div class="image-column">${mainImageHTML}${thumbnailsHTML}</div>
            <div class="info-column">
                <h2 class="text-3xl font-display tracking-wide text-text-main mb-1">${obra.title}</h2>
                <p class="text-lg font-medium text-accent-blue mb-4">${obra.year || ''}</p>
                <div class="space-y-2 mb-5 text-sm">
                    <p><strong class="font-medium text-text-main">Técnica:</strong> ${obra.technique || 'N/A'}</p>
                    <p><strong class="font-medium text-text-main">Medidas:</strong> ${obra.size || 'N/A'}</p>
                    ${obra.serie ? `<p><strong class="font-medium text-text-main">Serie:</strong> ${obra.serie}</p>` : ''}
                    ${obra.category ? `<p><strong class="font-medium text-text-main">Categoría:</strong> ${obra.category}</p>` : ''}
                </div>
                ${descriptionHTML}
                <div class="mt-5 pt-5 border-t border-border-default space-y-2">
                    <p class="text-sm font-medium"><strong class="text-text-main">Disponibilidad:</strong> <span class="font-semibold ${availabilityClass} uppercase text-xs tracking-wider">${availabilityText}</span></p>
                    <p class="text-lg font-medium mt-1"><strong class="text-text-main text-sm font-medium">Precio:</strong> <span class="${priceClass}">${priceText}</span></p>
                </div>
                <div class="mt-6">
                    <a href="${whatsappLink}" target="_blank" class="w-full inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-whatsapp hover:opacity-90 transition duration-300 uppercase tracking-wider">
                        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 2.25c-5.497 0-9.967 4.47-9.967 9.967 0 1.77.464 3.444 1.303 4.887l-1.37 5.293 5.422-1.343c1.433.784 3.067 1.196 4.612 1.196 5.497 0 9.967-4.47 9.967-9.967s-4.47-9.967-9.967-9.967zm4.394 13.927s-.272-.14-.567-.282c-.294-.142-.44-.224-.716-.546-.275-.322-.727-.373-1.04-.373-.243 0-.41.066-.64.066-.23 0-.41-.09-.64-.403s-.84-.817-1.025-1.127c-.184-.31-.383-.69-.533-1.02-.15-.33-.016-.496.096-.688.087-.15.195-.276.294-.418.099-.142.164-.268.229-.403.064-.135.032-.268-.008-.403-.04-.135-.383-.896-.513-1.226-.13-.33-.26-.27-.403-.27-.142 0-.306-.02-.47-.02-.164 0-.44.02-.67.02s-.64-.085-.947.88c-.307.965-1.19 1.77-1.19 1.77s-.184.18-.09.344c.09.164.887 1.25 1.127 1.545.24.295.49.567.817.896 1.11 1.096 2.09 1.488 2.68 1.638.18.04.403.04.587.04.282 0 .546-.108.73-.3.26-.282.59-.513.82-.744.23-.23.414-.49.627-.67l.112-.086c.099-.085.27-.224.513-.333.243-.11.455-.175.76-.108.306.066.567.31.676.474.108.164.19.344.19.587 0 .243-.09.474-.356.705-.26.23-.424.428-.56.59l-.09.09c-.066.065-.13.13-.19.19s-.14.07-.205.108c-.065.04-.15.1-.258.127-.108.027-.216.035-.34.035z"/></svg>
                        Consultar por WhatsApp
                    </a>
                </div>
            </div>
        </div>`;

    if (modal) modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeModal = (event) => {
    if (event && event.target !== modal && !event.target.closest('button[onclick="closeModal()"]')) return;
    if(modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
};

window.switchModalImage = (imageUrl, clickedElement) => {
    const mainImage = document.querySelector('#modal-main-image-container .zoom-image');
    if (mainImage) { mainImage.src = imageUrl; resetZoom(mainImage.parentElement.parentElement); }
    const thumbnails = document.querySelectorAll('#modal-thumbnails .thumbnail-item');
    if (thumbnails) thumbnails.forEach(thumb => thumb.classList.replace('border-accent-blue', 'border-transparent'));
    if (clickedElement) clickedElement.classList.replace('border-transparent', 'border-accent-blue');
};

function zoomImage(event, container) {
    const img = container.querySelector('.zoom-image'); if (!img) return;
    const { left, top, width, height } = container.getBoundingClientRect();
    const x = ((event.clientX - left) / width) * 100; const y = ((event.clientY - top) / height) * 100;
    img.style.transformOrigin = `${x}% ${y}%`; img.style.transform = 'scale(2)'; container.style.cursor = 'zoom-out';
}

function resetZoom(container) {
    const img = container.querySelector('.zoom-image'); if (img) { img.style.transform = 'scale(1)'; img.style.transformOrigin = `center center`; container.style.cursor = 'zoom-in';}
}

// --- LISTENERS Y SCROLL BEHAVIOR ---
const firstSection = document.querySelector('section#carousel-header');
window.addEventListener('scroll', () => {
    if (!firstSection) return;
    const firstSectionHeight = firstSection.offsetHeight;
    if (mainFooter) mainFooter.classList.toggle('translate-y-full', window.scrollY <= firstSectionHeight - 100);
    const gallerySectionTop = gallerySection ? gallerySection.offsetTop : firstSectionHeight;
    if (whatsappButton) whatsappButton.classList.toggle('show', window.scrollY > gallerySectionTop - window.innerHeight / 2);
});

// Attach listeners safely
document.addEventListener('DOMContentLoaded', async () => {
    if (mainFooter) mainFooter.classList.add('translate-y-full');
    if (whatsappButton) whatsappButton.classList.remove('show');
    if (searchInput) searchInput.addEventListener('input', handleFilterChange);
    if (filterYear) filterYear.addEventListener('change', handleFilterChange);
    if (filterCategory) filterCategory.addEventListener('change', handleFilterChange);
    if (filterSeries) filterSeries.addEventListener('change', handleFilterChange);
    if (filterAvailability) filterAvailability.addEventListener('change', handleFilterChange);
    if (editToggleButton) editToggleButton.addEventListener('click', toggleEditMode);
    if (saveOrderButton) saveOrderButton.addEventListener('click', saveOrder);
    // const togglePricesBtn = document.getElementById('toggle-prices'); // Comentado
    // if (togglePricesBtn) togglePricesBtn.addEventListener('click', togglePriceVisibility); // Comentado

    currentPage = 0; allDataLoaded = false; productosCache = [];
    if (galleryContainer) galleryContainer.innerHTML = '';
    if (loadMoreTrigger) loadMoreTrigger.classList.remove('hidden');

    await fetchGalleryPage();
    setupInfiniteScroll();
    fetchAndPopulateFilters();
    checkAdminStatus();
});