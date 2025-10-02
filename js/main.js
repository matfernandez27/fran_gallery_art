// js/main.js

// Inicialización de Supabase usando config.js
// Se asume que config.js ya definió window.supabaseUrl y window.supabaseAnonKey
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
// Usamos la inicialización global
const client = supabase.createClient(supabaseUrl, supabaseAnonKey); 

let allWorks = []; 
let displayedWorks = []; 
let isEditing = false;
let sortableInstance = null;
let carouselIntervalId = null;

// Parámetros de Paginación y Carga Diferida
const PAGE_SIZE = 8; 
let currentPage = 0;
let hasMore = true; 

// Elementos del DOM
const galleryContainer = document.getElementById("gallery-container");
const status = document.getElementById("status");
const loadingOverlay = document.getElementById("loading-overlay");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const alertDiv = document.getElementById('alert'); 
const loadMoreAnchor = document.getElementById('load-more-anchor'); 

// Elementos de Filtro
const searchInput = document.getElementById("search");
const filterYear = document.getElementById("filter-year");
const filterCategory = document.getElementById("filter-category");
const filterSeries = document.getElementById("filter-series");

// Elementos de Control de Administrador
const adminControls = document.getElementById("admin-controls");
const editToggleButton = document.getElementById("edit-toggle");
const saveOrderButton = document.getElementById("save-order-button");

// Elementos de interacción dinámica
const whatsappButton = document.getElementById('whatsapp-btn');
const mainFooter = document.getElementById('main-footer');
const gallerySection = document.getElementById('gallery-section');


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    if (!alertDiv) {
        console.warn(`Alerta no mostrada (Falta #alert en el DOM): ${message}`);
        return;
    }
    // Lógica completa de showAlert...
}

function renderWork(obra, index) {
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${obra.ruta_imagen}`;
    
    return `
        <div id="obra-${obra.id}" class="work-item relative bg-bg-card shadow-lg rounded-sm overflow-hidden group hover:shadow-xl transition-shadow duration-300 transform hover:-translate-y-1" 
             data-id="${obra.id}" data-order="${obra.orden}" data-year="${obra.anio}" data-category="${obra.categoria}" data-series="${obra.serie}"
             onclick="openModal(${obra.id})">
            <img src="${imageUrl}" alt="${obra.titulo}" class="w-full h-64 object-cover transition-opacity duration-500 group-hover:opacity-90" loading="lazy">
            <div class="absolute inset-0 bg-black bg-opacity-30 flex flex-col justify-end p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <h3 class="text-white text-lg font-semibold">${obra.titulo}</h3>
                <p class="text-gray-200 text-sm">${obra.tecnica} (${obra.anio})</p>
            </div>
            ${isEditing ? `<div class="absolute top-2 right-2 bg-red-500 text-white p-1 text-xs rounded-full cursor-pointer z-10" onclick="event.stopPropagation(); deleteWork(${obra.id})">X</div>` : ''}
        </div>
    `;
}

async function openModal(id) {
    const obra = allWorks.find(w => w.id === id) || displayedWorks.find(w => w.id === id);
    if (!obra) return;
    
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${obra.ruta_imagen}`;

    modalContent.innerHTML = `
        <div class="md:flex md:space-x-8">
            <div class="md:w-1/2">
                <img src="${imageUrl}" alt="${obra.titulo}" class="w-full h-auto object-contain rounded-sm shadow-lg">
            </div>
            <div class="md:w-1/2 pt-4 md:pt-0">
                <h3 class="text-3xl font-bold text-text-dark mb-2">${obra.titulo}</h3>
                <p class="text-pantone-magenta font-medium mb-4">${obra.serie}</p>
                <p class="text-text-muted mb-1">**Técnica:** ${obra.tecnica}</p>
                <p class="text-text-muted mb-1">**Dimensiones:** ${obra.dimensiones}</p>
                <p class="text-text-muted mb-1">**Año:** ${obra.anio}</p>
                <p class="text-text-muted mb-1">**Categoría:** ${obra.categoria}</p>
                
                <div class="mt-6 text-text-dark">
                    **Descripción:**
                    <p class="mt-2 text-sm leading-relaxed">${obra.descripcion || 'Sin descripción disponible.'}</p>
                </div>

                <div class="mt-8 text-center">
                    <a href="https://wa.me/[NUMERO_DE_WHATSAPP]?text=Hola,%20estoy%20interesado/a%20en%20la%20obra:%20${encodeURIComponent(obra.titulo)}" 
                       target="_blank" 
                       class="inline-flex items-center bg-whatsapp text-white font-bold py-3 px-6 rounded-sm hover:bg-opacity-90 transition duration-300 shadow-md">
                        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24"></svg>
                        Consultar Disponibilidad
                    </a>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = 'auto';
}

// --- LÓGICA DE CARGA DIFERIDA Y PAGINACIÓN ---

async function fetchWorksPage(offset) {
    const from = offset;
    const to = offset + PAGE_SIZE - 1;
    
    loadingOverlay.classList.remove('hidden');

    try {
        const { data, error } = await client
            .from('obras')
            .select('*')
            .order('orden', { ascending: true })
            .range(from, to);

        if (error) throw error;
        
        if (!isFiltering()) {
            allWorks = [...allWorks, ...data];
        }

        hasMore = data.length === PAGE_SIZE;
        currentPage++;
        
        return data;

    } catch (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar la galería.", 'error');
        return [];
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

function appendWorks(works) {
    const html = works.map((obra, index) => renderWork(obra, index)).join('');
    galleryContainer.insertAdjacentHTML('beforeend', html);
    displayedWorks = [...displayedWorks, ...works];
    
    if (hasMore && !isFiltering() && loadMoreAnchor) {
        observer.observe(loadMoreAnchor);
    } else if (loadMoreAnchor) {
        observer.unobserve(loadMoreAnchor);
    }
}

async function initialLoadGallery() {
    allWorks = [];
    displayedWorks = [];
    currentPage = 0;
    hasMore = true;
    galleryContainer.innerHTML = ''; 
    
    if (status) status.classList.remove('hidden');

    const initialWorks = await fetchWorksPage(0);
    appendWorks(initialWorks);
    
    if (status) status.classList.add('hidden');
    
    populateFilterOptions();
}

// --- INTERSECTION OBSERVER PARA SCROLL INFINITO ---
if (loadMoreAnchor) {
    var observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFiltering()) {
            
            observer.unobserve(loadMoreAnchor);

            const nextWorks = await fetchWorksPage(currentPage * PAGE_SIZE);
            
            if (nextWorks.length > 0) {
                appendWorks(nextWorks);
            } else {
                hasMore = false; 
            }
        }
    }, {
        rootMargin: '100px',
        threshold: 0.1
    });
}


// --- LÓGICA DE FILTROS ---

function isFiltering() {
    return searchInput && (searchInput.value || filterYear.value || filterCategory.value || filterSeries.value);
}

async function applyFilters() {
    if (!isFiltering()) {
        await initialLoadGallery();
        return;
    }
    
    if (allWorks.length === 0 || allWorks.length < displayedWorks.length) {
         const remainingWorks = await fetchWorksPage(allWorks.length);
         allWorks = [...allWorks, ...remainingWorks];
    }
    
    const searchText = searchInput.value.toLowerCase();
    const selectedYear = filterYear.value;
    const selectedCategory = filterCategory.value;
    const selectedSeries = filterSeries.value;

    const filtered = allWorks.filter(obra => {
        const titleMatch = obra.titulo.toLowerCase().includes(searchText);
        const yearMatch = selectedYear ? obra.anio == selectedYear : true;
        const categoryMatch = selectedCategory ? obra.categoria === selectedCategory : true;
        const seriesMatch = selectedSeries ? obra.serie === selectedSeries : true;
        return titleMatch && yearMatch && categoryMatch && seriesMatch;
    });

    galleryContainer.innerHTML = filtered.map(obra => renderWork(obra)).join('');
    
    if (loadMoreAnchor && observer) {
        observer.unobserve(loadMoreAnchor);
    }
}

async function populateFilterOptions() {
    const allYears = new Set();
    const allCategories = new Set();
    const allSeries = new Set();

    allWorks.forEach(obra => {
        if (obra.anio) allYears.add(obra.anio);
        if (obra.categoria) allCategories.add(obra.categoria);
        if (obra.serie) allSeries.add(obra.serie);
    });

    if (filterYear) filterYear.innerHTML = '<option value="">Año</option>' + Array.from(allYears).sort((a, b) => b - a).map(year => `<option value="${year}">${year}</option>`).join('');

    if (filterCategory) filterCategory.innerHTML = '<option value="">Categoría</option>' + Array.from(allCategories).sort().map(cat => `<option value="${cat}">${cat}</option>`).join('');

    if (filterSeries) filterSeries.innerHTML = '<option value="">Serie</option>' + Array.from(allSeries).sort().map(ser => `<option value="${ser}">${ser}</option>`).join('');
}


// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    if(mainFooter) mainFooter.classList.add('translate-y-full');
    if(whatsappButton) whatsappButton.classList.remove('show');
    
    await initialLoadGallery(); 

    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    
    // Si tienes una función checkAdminStatus, llámala
    if (typeof checkAdminStatus === 'function') {
        checkAdminStatus();
    }
});


// --- LISTENERS DE FILTROS ---
if (searchInput) searchInput.addEventListener('input', applyFilters);
if (filterYear) filterYear.addEventListener('change', applyFilters);
if (filterCategory) filterCategory.addEventListener('change', applyFilters);
if (filterSeries) filterSeries.addEventListener('change', applyFilters);

// Listener de scroll para footer y WhatsApp
const firstSection = document.querySelector('section#carousel-header'); 
window.addEventListener('scroll', () => {
    if (!firstSection) return;
    
    const firstSectionHeight = firstSection.offsetHeight;
    
    if (window.scrollY > firstSectionHeight - 100) { 
        if (mainFooter) mainFooter.classList.remove('translate-y-full');
    } else {
        if (mainFooter) mainFooter.classList.add('translate-y-full');
    }

    const gallerySectionTop = gallerySection ? gallerySection.offsetTop : firstSectionHeight;
    if (window.scrollY > gallerySectionTop - window.innerHeight / 2) { 
        if (whatsappButton) whatsappButton.classList.add('show');
    } else {
        if (whatsappButton) whatsappButton.classList.remove('show');
    }
});