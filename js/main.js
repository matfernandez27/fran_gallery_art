// js/main.js

// Inicialización de Supabase usando config.js
// Asegúrate de que config.js exista en la raíz con window.supabaseUrl y window.supabaseAnonKey
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

let productos = [];
let carouselIntervalId = null;

const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const alertDiv = document.getElementById('alert');

// Elementos de Filtro
const searchInput = document.getElementById("search");
const filterYear = document.getElementById("filter-year");
const filterCategory = document.getElementById("filter-category");
const filterSeries = document.getElementById("filter-series");

// Elementos de interacción dinámica
const whatsappButton = document.getElementById('whatsapp-btn');
const mainFooter = document.getElementById('main-footer');
const gallerySection = document.getElementById('gallery-section');


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    // Implementación simple de alerta (opcional: copiar la versión de admin.js)
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function openModal(obra) {
    modalContent.innerHTML = '';
    
    // Contenedor principal del modal
    const modalBody = document.createElement('div');
    modalBody.className = 'p-6 lg:p-8 flex flex-col lg:flex-row gap-6 lg:gap-8';

    // 1. Contenedor de Imagen
    const imageContainer = document.createElement('div');
    imageContainer.className = 'w-full lg:w-1/2 relative';
    
    const firstImage = obra.imagenes && obra.imagenes.length > 0 ? obra.imagenes[0] : null;
    if (firstImage) {
        const img = document.createElement('img');
        img.src = firstImage.url;
        img.alt = obra.titulo;
        img.className = 'w-full h-auto rounded-lg shadow-xl';
        imageContainer.appendChild(img);
    }
    
    // 2. Contenedor de Información
    const infoContainer = document.createElement('div');
    infoContainer.className = 'w-full lg:w-1/2 space-y-4';
    
    infoContainer.innerHTML = `
        <h2 class="text-3xl font-light text-text-dark">${obra.titulo}</h2>
        <p class="text-text-muted text-lg font-medium">${obra.anio} | ${obra.categoria || 'Sin Categoría'}</p>
        <p class="text-text-normal leading-relaxed">${obra.descripcion}</p>
    `;
    
    // Bloque de Precio y Disponibilidad
    const saleInfo = document.createElement('div');
    saleInfo.className = 'pt-4 border-t border-border-light space-y-2';

    // Precio
    if (obra.show_price && obra.price) {
        const formattedPrice = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'USD', 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(obra.price);

        saleInfo.innerHTML += `<p class="text-2xl font-bold text-pantone-magenta">Precio: ${formattedPrice}</p>`;
    } else {
        saleInfo.innerHTML += `<p class="text-xl font-semibold text-pantone-magenta">Precio: Consultar</p>`;
    }
    
    // Disponibilidad
    if (obra.is_available) {
        saleInfo.innerHTML += `<p class="text-lg text-green-600 font-medium">Estado: Disponible</p>`;
    } else {
        saleInfo.innerHTML += `<p class="text-lg text-red-500 font-medium">Estado: Vendida / No disponible</p>`;
    }

    infoContainer.appendChild(saleInfo);
    
    // Botón de contacto (WhatsApp)
    const whatsappNumber = 'TU_NUMERO_DE_WHATSAPP'; // ¡REEMPLAZA ESTO!
    infoContainer.innerHTML += `
        <a href="https://wa.me/${whatsappNumber}?text=Hola,%20estoy%20interesado/a%20en%20la%20obra:%20${encodeURIComponent(obra.titulo)}" 
           target="_blank" 
           class="mt-6 inline-block w-full text-center py-3 px-6 bg-pantone-magenta text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition duration-300">
           Consultar / Comprar
        </a>
    `;

    modalBody.appendChild(imageContainer);
    modalBody.appendChild(infoContainer);
    modalContent.appendChild(modalBody);

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeModal(event) {
    if (event && event.target !== modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    modalContent.innerHTML = '';
}


// --- LÓGICA DE GALERÍA Y DATOS ---

async function loadProducts() {
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    
    // Traer los productos ordenados por el campo 'orden'
    const { data, error } = await client
        .from('productos')
        .select('*')
        .order('orden', { ascending: true }); 

    if (loadingOverlay) loadingOverlay.classList.add('hidden');

    if (error) {
        console.error("Error al cargar productos:", error);
        return;
    }

    productos = data;
    renderGallery(productos);
    populateFilters(productos);
}

// Genera el HTML para una sola tarjeta
function createCardElement(obra) {
    const card = document.createElement('div');
    card.className = 'group relative overflow-hidden bg-bg-card rounded-lg shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer';
    card.onclick = () => openModal(obra);

    // Contenedor de la imagen
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'w-full h-80 overflow-hidden';

    const img = document.createElement('img');
    const imageUrl = obra.imagenes && obra.imagenes.length > 0 ? obra.imagenes[0].url : 'placeholder.png'; 
    img.src = imageUrl;
    img.alt = obra.titulo;
    img.className = 'w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 zoom-image';
    
    imageWrapper.appendChild(img);

    // Contenedor de texto
    const cardBody = document.createElement('div');
    cardBody.className = 'p-4 space-y-1';

    // Título y detalles
    cardBody.innerHTML = `
        <h3 class="text-xl font-semibold text-text-dark truncate">${obra.titulo}</h3>
        <p class="text-sm text-text-muted">${obra.categoria || 'Sin Categoría'}</p>
    `;

    // --- BLOQUE DE PRECIO Y DISPONIBILIDAD (ACTUALIZADO) ---
    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex items-center justify-between mt-2 text-sm pt-2 border-t border-border-light';

    // Estado (Disponible / Vendida)
    const availabilitySpan = document.createElement('span');
    if (obra.is_available) {
        availabilitySpan.textContent = 'Disponible';
        availabilitySpan.className = 'text-green-600 font-semibold';
    } else {
        availabilitySpan.textContent = 'Vendida';
        availabilitySpan.className = 'text-red-500 font-medium';
    }

    // Precio
    const priceSpan = document.createElement('span');
    if (obra.show_price && obra.price) {
        // Formatear precio (Ej: $1,200)
        const formattedPrice = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'USD', 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(obra.price);

        priceSpan.textContent = formattedPrice;
        priceSpan.className = 'text-text-dark font-bold text-lg';

    } else {
        priceSpan.textContent = 'Consultar';
        priceSpan.className = 'text-pantone-magenta font-semibold hover:underline';
    }

    statusDiv.appendChild(availabilitySpan);
    statusDiv.appendChild(priceSpan);
    // -----------------------------------------------------

    cardBody.appendChild(statusDiv);
    
    card.appendChild(imageWrapper);
    card.appendChild(cardBody);
    
    return card;
}

function renderGallery(productsToRender) {
    if (galleryContainer) galleryContainer.innerHTML = '';
    
    if (productsToRender.length === 0) {
        galleryContainer.innerHTML = '<p class="col-span-full text-center text-xl text-text-muted p-10">No se encontraron obras con los filtros seleccionados.</p>';
        return;
    }

    productsToRender.forEach(obra => {
        galleryContainer.appendChild(createCardElement(obra));
    });
}


// --- LÓGICA DE FILTRADO ---

// Función para obtener valores únicos para los filtros (categoría, serie, año)
function populateFilters(products) {
    const categories = new Set();
    const series = new Set();
    const years = new Set();

    products.forEach(p => {
        if (p.categoria) categories.add(p.categoria);
        if (p.serie) series.add(p.serie);
        if (p.anio) years.add(p.anio);
    });

    // Función auxiliar para llenar un <select>
    const fillSelect = (selectElement, values) => {
        if (!selectElement) return;
        selectElement.innerHTML = '<option value="">Todos</option>';
        Array.from(values).sort((a, b) => b - a).forEach(value => { // Ordenar años de más nuevo a más viejo
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            selectElement.appendChild(option);
        });
    };

    fillSelect(filterCategory, categories);
    fillSelect(filterSeries, series);
    fillSelect(filterYear, years);
}

// Función principal de filtrado
function filterGallery() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedYear = filterYear.value;
    const selectedCategory = filterCategory.value.toLowerCase();
    const selectedSeries = filterSeries.value.toLowerCase();

    const filtered = productos.filter(obra => {
        // 1. Filtro de Búsqueda de Texto
        const searchableText = [
            obra.titulo, 
            obra.descripcion, 
            obra.categoria, 
            obra.serie, 
            String(obra.anio) 
        ].join(' ').toLowerCase();
        
        const matchesSearch = !searchTerm || searchableText.includes(searchTerm);

        // 2. Filtro por Año
        const matchesYear = !selectedYear || String(obra.anio) === selectedYear;

        // 3. Filtro por Categoría
        const matchesCategory = !selectedCategory || (obra.categoria && obra.categoria.toLowerCase() === selectedCategory);
        
        // 4. Filtro por Serie
        const matchesSeries = !selectedSeries || (obra.serie && obra.serie.toLowerCase() === selectedSeries);

        return matchesSearch && matchesYear && matchesCategory && matchesSeries;
    });

    renderGallery(filtered);
}


// --- LÓGICA DE ZOOM (CÓDIGO EXISTENTE) ---
function zoomImage(event, container) {
    const img = container.querySelector('.zoom-image');
    if (!img) return;

    const { left, top, width, height } = container.getBoundingClientRect();
    const x = event.clientX - left;
    const y = event.clientY - top;

    const xPercent = (x / width) * 100;
    const yPercent = (y / height) * 100;
    const zoomScale = 2.5; 
    img.style.transformOrigin = `${xPercent}% ${yPercent}%`;
    img.style.transform = `scale(${zoomScale})`;
}

function resetZoom(container) {
    const img = container.querySelector('.zoom-image');
    if (img) {
        img.style.transform = null; 
        img.style.transformOrigin = 'center center';
    }
}


// --- EVENT LISTENERS ---

// Escuchas para los filtros
if (searchInput) searchInput.addEventListener('input', filterGallery);
if (filterYear) filterYear.addEventListener('change', filterGallery);
if (filterCategory) filterCategory.addEventListener('change', filterGallery);
if (filterSeries) filterSeries.addEventListener('change', filterGallery);

// Escuchas del Scroll
const firstSection = document.querySelector('section#carousel-header'); 

window.addEventListener('scroll', () => {
    if (!firstSection) return;
    
    const firstSectionHeight = firstSection.offsetHeight;
    
    // Control del footer
    if (window.scrollY > firstSectionHeight - 100) { 
        if (mainFooter) mainFooter.classList.remove('translate-y-full');
    } else {
        if (mainFooter) mainFooter.classList.add('translate-y-full');
    }

    // Control del botón de WhatsApp
    const gallerySectionTop = gallerySection ? gallerySection.offsetTop : firstSectionHeight;
    if (window.scrollY > gallerySectionTop - window.innerHeight / 2) { 
        if (whatsappButton) whatsappButton.classList.add('show');
    } else {
        if (whatsappButton) whatsappButton.classList.remove('show');
    }
});

// Inicialización
function initGallery() {
    loadProducts();
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicialización del estado visual
    if (mainFooter) mainFooter.classList.add('translate-y-full');
    if (whatsappButton) whatsappButton.classList.remove('show');
    
    // Carga inicial de datos
    initGallery(); 
});