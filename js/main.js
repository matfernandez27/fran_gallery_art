// js/main.js

// Inicialización de Supabase usando config.js
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
// Usamos la inicialización global
const client = supabase.createClient(supabaseUrl, supabaseAnonKey); 

let allWorks = []; // Almacena TODAS las obras para filtros/edición
let displayedWorks = []; // Obras actualmente mostradas en el DOM

// Parámetros de Paginación y Carga
const PAGE_SIZE = 8; // Carga 8 obras por página
let currentPage = 0;
let hasMore = true; // Indica si hay más obras por cargar

let isEditing = false;
let sortableInstance = null;
let carouselIntervalId = null;

// Elementos del DOM
const galleryContainer = document.getElementById("gallery-container");
const status = document.getElementById("status");
const loadingOverlay = document.getElementById("loading-overlay");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const alertDiv = document.getElementById('alert');
const loadMoreButton = document.getElementById('load-more-button'); // Nuevo botón de carga

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


// --- FUNCIONES DE UTILIDAD (Se mantienen igual) ---

function showAlert(message, type = 'success') {
    // ... lógica de showAlert (como en tu versión original) ...
    if (!alertDiv) {
        console.warn(`Alerta no mostrada (Falta #alert en el DOM): ${message}`);
        return;
    }
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-indigo-100', 'text-indigo-700', 'opacity-0');
    
    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'info') {
         alertDiv.classList.add('bg-indigo-100', 'text-indigo-700');
    }
    
    setTimeout(() => alertDiv.classList.add('opacity-0'), 4500);
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

// Renderiza OBRAS en el contenedor, usando el array displayedWorks
function renderGallery(works, append = false) {
    if (!append) {
        galleryContainer.innerHTML = '';
        displayedWorks = [];
    }

    const htmlContent = works.map((obra, index) => {
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
    }).join('');

    galleryContainer.insertAdjacentHTML('beforeend', htmlContent);
    displayedWorks = [...displayedWorks, ...works]; // Agrega las nuevas obras al array de obras mostradas
    
    // Si no hay obras
    if (displayedWorks.length === 0) {
        if (status) {
            status.textContent = "No se encontraron obras que coincidan con el filtro.";
            status.classList.remove('hidden');
        }
    } else {
        if (status) status.classList.add('hidden');
    }
}


async function openModal(id) {
    // Buscar en allWorks (o displayedWorks, asumimos que allWorks se carga en su totalidad al inicio para los filtros)
    const obra = allWorks.find(w => w.id === id) || displayedWorks.find(w => w.id === id); 
    if (!obra) return;
    
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${obra.ruta_imagen}`;

    // ... lógica para construir el modalContent ...
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

// --- LÓGICA DE CARGA DE GALERÍA (PAGINADA) ---

// Carga todas las obras (solo para filtros y administración)
async function fetchAllWorks() {
    try {
        const { data, error } = await client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true });

        if (error) throw error;
        allWorks = data;
        populateFilterOptions();
    } catch (error) {
        console.error("Error al cargar todas las obras (para filtros):", error);
    }
}


// Carga la siguiente página de obras
async function fetchNextPage() {
    if (!hasMore || isEditing) return; // Detiene la carga si no hay más o si se está editando

    loadingOverlay.classList.remove('hidden');
    loadMoreButton.classList.add('hidden'); // Oculta el botón mientras carga
    status.textContent = "Cargando obras...";
    status.classList.remove('hidden');


    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1; // Rango de 8 obras (0-7, 8-15, etc.)

    try {
        let query = client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true })
            .range(from, to); // Aplicar paginación

        const { data, error } = await query;

        if (error) throw error;

        const newWorks = data;
        renderGallery(newWorks, true); // Renderiza y APENDEA al contenido existente

        // Comprueba si el número de obras devueltas es menor que el tamaño de la página
        if (newWorks.length < PAGE_SIZE) {
            hasMore = false;
            status.textContent = "Se han cargado todas las obras.";
            loadMoreButton.classList.add('hidden');
        } else {
            hasMore = true;
            status.classList.add('hidden'); // Oculta "Cargando obras..."
            loadMoreButton.classList.remove('hidden'); // Muestra el botón para cargar más
        }
        
        currentPage++; // Avanza a la siguiente página

    } catch (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar la galería. Intenta recargar.", 'error');
        status.textContent = "Error al cargar la galería. Intenta recargar.";
        loadMoreButton.classList.add('hidden');

    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// Inicia la carga de la galería (solo la primera página)
function initialLoadGallery() {
    currentPage = 0; // Reinicia la página
    hasMore = true; // Reinicia el indicador
    galleryContainer.innerHTML = ''; // Limpia la galería
    displayedWorks = []; // Limpia las obras mostradas
    fetchNextPage(); // Carga la primera página
}

// --- LÓGICA DE FILTROS ---

// Para la paginación, la función de filtros necesita que TODAS las obras estén en allWorks.
function applyFilters() {
    
    // Ocultar paginación y mensaje de carga mientras se aplica el filtro
    loadMoreButton.classList.add('hidden');
    status.classList.add('hidden');
    
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

    // Se renderizan todas las obras filtradas de golpe, no paginadas.
    renderGallery(filtered, false); 
}

function populateFilterOptions() {
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

// --- LÓGICA DE ADMIN (Se mantiene similar, pero usando displayedWorks/allWorks) ---

function checkAdminStatus() {
    // Si estás logueado, muestra los controles de administrador
    client.auth.getUser().then(({ data: { user } }) => {
        if (user) {
            adminControls.classList.remove('hidden');
        }
    });
}

function toggleEditMode() {
    isEditing = !isEditing;
    editToggleButton.textContent = isEditing ? 'Salir de Edición' : 'Modo Edición';
    saveOrderButton.classList.toggle('hidden', !isEditing);
    
    // Al entrar/salir de edición, volvemos a renderizar
    if (isEditing) {
        // En modo edición, cargamos TODAS las obras de golpe para reordenarlas
        renderGallery(allWorks, false); 
        loadMoreButton.classList.add('hidden'); // Ocultar botón de carga en modo edición
        setupSortable();
    } else {
        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
        // Al salir de edición, volvemos al modo de paginación
        initialLoadGallery();
    }
}

function setupSortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    sortableInstance = new Sortable(galleryContainer, {
        animation: 150,
        group: 'shared',
        draggable: '.work-item',
        onEnd: function (evt) {
            saveOrder();
        }
    });
}

async function saveOrder() {
    if (!sortableInstance) return;

    const items = sortableInstance.toArray();
    const updates = items.map((id, index) => ({
        id: parseInt(id),
        orden: index + 1
    }));
    
    try {
        const { error } = await client
            .from('productos') // CLAVE: Se usa la tabla 'productos'
            .upsert(updates);

        if (error) throw error;
        showAlert("Orden de obras guardado exitosamente!", 'success');
        await fetchAllWorks(); // Recarga TODAS las obras para mantener el array allWorks actualizado
        renderGallery(allWorks, false); // Vuelve a renderizar la lista completa ordenada

    } catch (error) {
        console.error("Error al guardar orden:", error);
        showAlert("Error al guardar el orden.", 'error');
    }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    // Ocultar footer y botón de WhatsApp al inicio
    if(mainFooter) mainFooter.classList.add('translate-y-full');
    if(whatsappButton) whatsappButton.classList.remove('show');
    
    // Carga todas las obras para que los filtros funcionen
    await fetchAllWorks();
    
    // Inicia la carga paginada de la galería (8 obras)
    initialLoadGallery();
    
    if (typeof checkAdminStatus === 'function') {
        checkAdminStatus();
    }
});


if (loadMoreButton) loadMoreButton.addEventListener('click', fetchNextPage);
if (searchInput) searchInput.addEventListener('input', applyFilters);
if (filterYear) filterYear.addEventListener('change', applyFilters);
if (filterCategory) filterCategory.addEventListener('change', applyFilters);
if (filterSeries) filterSeries.addEventListener('change', applyFilters);

if (editToggleButton) editToggleButton.addEventListener('click', toggleEditMode);
if (saveOrderButton) saveOrderButton.addEventListener('click', saveOrder);


const firstSection = document.querySelector('section#carousel-header'); 
window.addEventListener('scroll', () => {
    // ... lógica de scroll para el footer y el botón de WhatsApp (Se mantiene igual) ...
    if (!firstSection) return;
    
    const firstSectionHeight = firstSection.offsetHeight;
    
    // Mostrar footer al hacer scroll fuera de la primera sección
    if (window.scrollY > firstSectionHeight - 100) { 
        if (mainFooter) mainFooter.classList.remove('translate-y-full');
    } else {
        if (mainFooter) mainFooter.classList.add('translate-y-full');
    }

    // Mostrar botón de WhatsApp al llegar a la galería
    const gallerySectionTop = gallerySection ? gallerySection.offsetTop : firstSectionHeight;
    if (window.scrollY > gallerySectionTop - window.innerHeight / 2) { 
        if (whatsappButton) whatsappButton.classList.add('show');
    } else {
        if (whatsappButton) whatsappButton.classList.remove('show');
    }
});