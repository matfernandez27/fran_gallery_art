// js/main.js

// Inicialización de Supabase usando config.js
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

let allWorks = []; // Almacenará TODAS las obras (necesario para filtros y admin)
let displayedWorks = []; // Obras actualmente mostradas
let isEditing = false;
let sortableInstance = null;
let carouselIntervalId = null;

// Parámetros de Paginación y Carga Diferida
const PAGE_SIZE = 8; // Número de obras a cargar por vez
let currentPage = 0;
let hasMore = true; // Indica si quedan más obras por cargar

// Elementos del DOM
const galleryContainer = document.getElementById("gallery-container");
const status = document.getElementById("status");
const loadingOverlay = document.getElementById("loading-overlay");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const alertDiv = document.getElementById('alert');
const loadMoreAnchor = document.getElementById('load-more-anchor'); // Nuevo elemento de anclaje

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


// --- FUNCIONES DE UTILIDAD (NO MODIFICADAS) ---
function showAlert(message, type = 'success') {
    // ... (Tu función showAlert)
}

function renderWork(obra, index) {
    // ... (Tu función renderWork)
    // Asegúrate que la imagen use 'loading="lazy"' si no lo hacía antes
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${obra.ruta_imagen}`;
    
    return `
        <div id="obra-${obra.id}" class="work-item relative bg-bg-card shadow-lg rounded-sm overflow-hidden group hover:shadow-xl transition-shadow duration-300 transform hover:-translate-y-1" 
             data-id="${obra.id}" data-order="${obra.orden}" data-year="${obra.anio}" data-category="${obra.categoria}" data-series="${obra.serie}"
             onclick="openModal(${obra.id})">
            <img src="${imageUrl}" alt="${obra.titulo}" class="w-full h-64 object-cover transition-opacity duration-500 group-hover:opacity-90" loading="lazy">
            </div>
    `;
}

// ... (El resto de las funciones de UX, Modal, etc. se mantienen) ...


// --- NUEVA LÓGICA DE CARGA DIFERIDA Y PAGINACIÓN ---

/**
 * Carga un nuevo bloque de obras desde Supabase.
 * @param {number} offset - El número de obras a saltar (pageSize * currentPage).
 */
async function fetchWorksPage(offset) {
    const from = offset;
    const to = offset + PAGE_SIZE - 1;
    
    // Muestra el spinner al cargar
    loadingOverlay.classList.remove('hidden');

    try {
        const { data, error } = await client
            .from('obras')
            .select('*')
            .order('orden', { ascending: true })
            .range(from, to);

        if (error) throw error;
        
        // La lista completa siempre se actualiza si no estamos filtrando
        if (!isFiltering()) {
            allWorks = [...allWorks, ...data];
        }

        // Verifica si ya no hay más obras
        hasMore = data.length === PAGE_SIZE;
        currentPage++;
        
        return data;

    } catch (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar la galería.", 'error');
        return [];
    } finally {
        // Oculta el spinner
        loadingOverlay.classList.add('hidden');
    }
}

/**
 * Renderiza las obras y las adjunta al contenedor.
 * @param {Array} works - Obras a renderizar.
 */
function appendWorks(works) {
    const html = works.map((obra, index) => renderWork(obra, index)).join('');
    galleryContainer.insertAdjacentHTML('beforeend', html);
    displayedWorks = [...displayedWorks, ...works];
    
    // Si quedan más obras y estamos al final, observamos el ancla
    if (hasMore && !isFiltering()) {
        observer.observe(loadMoreAnchor);
    } else {
        // Si no hay más obras o estamos filtrando, desconectamos el observador
        observer.unobserve(loadMoreAnchor);
    }
}

/**
 * Función principal para la carga inicial y el refresco.
 */
async function initialLoadGallery() {
    // Reiniciar paginación
    allWorks = [];
    displayedWorks = [];
    currentPage = 0;
    hasMore = true;
    galleryContainer.innerHTML = ''; // Limpiar el contenedor
    
    // Cargar la primera página
    const initialWorks = await fetchWorksPage(0);
    appendWorks(initialWorks);
    
    // Asegurarse de poblar filtros después de tener la data inicial
    populateFilterOptions();
}

// --- INTERSECTION OBSERVER PARA SCROLL INFINITO ---
const observer = new IntersectionObserver(async (entries) => {
    // Si el ancla es visible (intersecting) y hay más obras para cargar
    if (entries[0].isIntersecting && hasMore && !isFiltering()) {
        
        // Detener temporalmente el observador para evitar múltiples llamadas
        observer.unobserve(loadMoreAnchor);

        // Cargar la siguiente página
        const nextWorks = await fetchWorksPage(currentPage * PAGE_SIZE);
        
        if (nextWorks.length > 0) {
            appendWorks(nextWorks);
        } else {
            hasMore = false; // Ya no hay más obras
        }
    }
}, {
    // Cargar cuando el ancla esté a 100px del viewport
    rootMargin: '100px',
    threshold: 0.1
});


// --- LÓGICA DE FILTROS (MODIFICADA PARA USAR allWorks) ---

function isFiltering() {
    return searchInput.value || filterYear.value || filterCategory.value || filterSeries.value;
}

async function applyFilters() {
    // Si no hay filtros activos, recargamos la galería con la lógica de paginación
    if (!isFiltering()) {
        await initialLoadGallery();
        return;
    }
    
    // Si hay filtros, cargamos TODAS las obras (si no están cargadas) para poder filtrar
    // Esto asume que el número total de obras no es masivo
    if (allWorks.length === 0 || allWorks.length < displayedWorks.length) {
         // Cargar el resto de las obras para garantizar la búsqueda completa
         const remainingWorks = await fetchWorksPage(allWorks.length);
         allWorks = [...allWorks, ...remainingWorks];
    }
    
    // ... (El resto de la lógica de filtrado se mantiene igual, filtrando sobre allWorks)
    
    // Tu lógica de filtrado actual, pero usando allWorks
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
    
    // Desconectar el observador cuando se filtra, ya que se muestran todos los resultados
    observer.unobserve(loadMoreAnchor);
}

// ... (El resto de funciones auxiliares como populateFilterOptions, checkAdminStatus se mantienen) ...


// --- INICIALIZACIÓN (MODIFICADA) ---
document.addEventListener('DOMContentLoaded', async () => {
    mainFooter.classList.add('translate-y-full');
    whatsappButton.classList.remove('show');
    
    // Carga la primera página e inicia el observador si es necesario
    await initialLoadGallery(); 

    // Ocultar el estado de carga y el overlay que ya no son necesarios
    loadingOverlay.classList.add('hidden');
    status.classList.add('hidden');
    
    checkAdminStatus();
});

// ... (El resto de Listeners de Scroll y Filtros se mantienen) ...

if (searchInput) searchInput.addEventListener('input', applyFilters);
if (filterYear) filterYear.addEventListener('change', applyFilters);
if (filterCategory) filterCategory.addEventListener('change', applyFilters);
if (filterSeries) filterSeries.addEventListener('change', applyFilters);