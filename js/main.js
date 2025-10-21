// js/main.js

// --- INICIALIZACIÓN Y VARIABLES GLOBALES ---
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

let productosCache = []; // Caché para guardar los detalles de las obras cargadas
let carouselIntervalId = null;
let isEditing = false;
let sortableInstance = null;

// Variables para el scroll infinito
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
const loadMoreSpinner = loadMoreTrigger.querySelector('.lds-ring');

// Elementos de Filtro
const searchInput = document.getElementById("search");
const filterYear = document.getElementById("filter-year");
const filterCategory = document.getElementById("filter-category");
const filterSeries = document.getElementById("filter-series");
const filterAvailability = document.getElementById("filter-availability"); 

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
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'info') {
        alertDiv.classList.add('bg-blue-100', 'text-blue-700');
    } else {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    }
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}
window.showAlert = showAlert;

function formatPrice(price) {
    if (price === null || price === undefined) return 'Consultar';
    const formatted = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price);
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
        adminControls.classList.toggle('hidden', !session);
    } catch (e) {
        console.warn("Error checking admin status:", e);
    }
}


// --- LÓGICA DEL CARRUSEL DE FONDO ---
const carouselContainer = document.getElementById('carousel-container');
let currentCarouselIndex = 0;

function renderCarouselItems(carouselUrls) {
    if (!carouselContainer || carouselUrls.length === 0) return;
    if (carouselIntervalId) clearInterval(carouselIntervalId);
    
    carouselContainer.innerHTML = carouselUrls.map((url, index) =>
        `<div class="carousel-item ${index === 0 ? 'active' : ''}" style="background-image: url('${url}')"></div>`
    ).join('');

    if (carouselUrls.length > 1) {
        carouselIntervalId = setInterval(nextCarouselItem, 5000);
    }
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
        id: p.id,
        title: p.titulo || "",
        technique: p.tecnica || "",
        size: p.medidas || "",
        year: p.anio || 0,
        description: p.descripcion || "",
        order: p.orden || 0,
        category: p.categoria || "",
        serie: p.serie || "",
        price: p.price,
        is_available: p.is_available,
        show_price: p.show_price,
        images: imagesWithUrls,
        mainImage: imagesWithUrls.length ? imagesWithUrls[0].url : "https://via.placeholder.com/400x300?text=Sin+Imagen"
    };
}

function appendToGallery(items) {
    if (items.length === 0 && currentPage === 1) {
        galleryContainer.innerHTML = '<p class="col-span-full text-center text-text-muted">No se encontraron obras que coincidan con los filtros.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(obra => {
        const card = document.createElement("div");
        card.className = "relative bg-bg-card rounded-sm overflow-hidden shadow-lg hover:shadow-xl transition duration-500 transform hover:-translate-y-1 group border border-border-light";
        card.setAttribute('data-id', obra.id);
        
        const formattedPrice = obra.show_price ? formatPrice(obra.price) : 'Consultar';
        const priceDisplayClass = obra.show_price && obra.price !== null ? 'font-bold text-text-dark' : 'text-pantone-magenta font-semibold';
        const availabilityText = obra.is_available ? 'Disponible' : 'Vendida';
        const availabilityClass = obra.is_available ? 'text-green-600' : 'text-red-500';

        card.innerHTML = `
            <div class="edit-controls absolute top-2 right-2 z-10 flex items-center space-x-2 bg-white/80 backdrop-blur-sm p-1 rounded-full shadow-md hidden">
                <a href="./admin.html?edit=${obra.id}" target="_blank" class="edit-link text-gray-600 hover:text-indigo-600" title="Editar Obra">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                </a>
                <div class="drag-handle cursor-move text-gray-600 hover:text-indigo-600" title="Arrastrar para ordenar">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </div>
            </div>
            <div class="card-content cursor-pointer" onclick="openModal(${obra.id})">
                <div class="aspect-[4/3] overflow-hidden flex items-center justify-center bg-bg-principal"> 
                    <img src="${obra.mainImage}" alt="Obra de Francisco Fernández: ${obra.title}" 
                        class="w-full h-full object-contain transition duration-500 group-hover:scale-105"
                        loading="lazy"
                        onerror="this.onerror=null;this.src='https://via.placeholder.com/400x300?text=Error+Imagen';">
                </div>
                <div class="p-4 border-t border-border-light">
                    <h3 class="text-xl font-medium text-text-dark truncate">${obra.title}</h3>
                    <p class="text-sm text-text-muted">${obra.technique} · <span class="text-pantone-magenta font-semibold">${obra.year}</span></p>
                    <div class="flex justify-between items-center pt-2 mt-2 border-t border-border-light">
                        <span class="text-xs font-semibold ${availabilityClass}">${availabilityText}</span>
                        <span class="text-lg ${priceDisplayClass}">${formattedPrice}</span>
                    </div>
                </div>
            </div>`;
        fragment.appendChild(card);
    });
    galleryContainer.appendChild(fragment);
}

async function fetchGalleryPage() {
    if (isLoading || allDataLoaded) return;
    isLoading = true;
    if (currentPage === 0) {
        loadingOverlay.classList.remove('hidden', 'opacity-0');
    } else {
        loadMoreSpinner.classList.remove('hidden');
    }

    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = client
        .from('productos')
        .select('*', { count: 'exact' })
        .order('orden', { ascending: true })
        .range(from, to);
    
    // Aplicar filtros a la consulta de Supabase
    if (currentFilters.query) {
        query = query.or(`titulo.ilike.%${currentFilters.query}%,descripcion.ilike.%${currentFilters.query}%,tecnica.ilike.%${currentFilters.query}%`);
    }
    if (currentFilters.year) query = query.eq('anio', currentFilters.year);
    if (currentFilters.category) query = query.eq('categoria', currentFilters.category);
    if (currentFilters.series) query = query.eq('serie', currentFilters.series);
    if (currentFilters.availability !== "") {
        query = query.eq('is_available', currentFilters.availability === 'true');
    }

    try {
        const { data, error, count } = await query;
        if (error) throw error;
        
        const newProductos = data.map(normalize);
        productosCache.push(...newProductos);
        appendToGallery(newProductos);

        if (newProductos.length < PAGE_SIZE || productosCache.length === count) {
            allDataLoaded = true;
            loadMoreTrigger.classList.add('hidden');
        }
        currentPage++;

    } catch (error) {
        console.error("Error al cargar la galería:", error);
        showAlert("Error al cargar las obras: " + error.message, 'error');
    } finally {
        isLoading = false;
        loadingOverlay.classList.add('hidden', 'opacity-100');
        loadMoreSpinner.classList.add('hidden');
    }
}

function setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && !allDataLoaded) {
            fetchGalleryPage();
        }
    }, { rootMargin: '200px' }); 

    observer.observe(loadMoreTrigger);
}


// --- LÓGICA DE FILTROS ---
function handleFilterChange() {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
        currentFilters = {
            query: searchInput.value.toLowerCase().trim(),
            year: filterYear.value,
            category: filterCategory.value,
            series: filterSeries.value,
            availability: filterAvailability.value,
        };
        // Resetear todo para una nueva búsqueda
        currentPage = 0;
        allDataLoaded = false;
        productosCache = [];
        galleryContainer.innerHTML = '';
        loadMoreTrigger.classList.remove('hidden');
        
        // Si el modo edición está activo, hay que desactivarlo (y destruir la instancia)
        // antes de limpiar el HTML, para evitar errores.
        if (isEditing) {
            disableSorting();
        }
        
        fetchGalleryPage();
        
        // Si estábamos en modo edición, lo reactivamos para los nuevos items.
        // (La carga de 'fetchGalleryPage' es asíncrona, pero 'enableSorting'
        // se puede llamar síncronamente aquí, ya que 'appendToGallery'
        // habrá sido llamada dentro de 'fetchGalleryPage' antes de que esto importe)
        if (isEditing) {
            enableSorting();
        }
        
    }, 350); 
}

async function fetchAndPopulateFilters() {
    try {
        const { data, error } = await client
            .from('productos')
            .select('anio, categoria, serie, imagenes')
            .order('orden', { ascending: true });
        
        if (error) throw error;

        const allItems = data || [];
        // Llenar filtros
        const years = [...new Set(allItems.map(p => p.anio).filter(Boolean))].sort((a, b) => b - a);
        const categories = [...new Set(allItems.map(p => p.categoria).filter(Boolean))].sort();
        const seriesList = [...new Set(allItems.map(p => p.serie).filter(Boolean))].sort();

        filterYear.innerHTML = '<option value="">Año</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        filterCategory.innerHTML = '<option value="">Categoría</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
        filterSeries.innerHTML = '<option value="">Serie</option>' + seriesList.map(s => `<option value="${s}">${s}</option>`).join('');
        
        // Cargar carrusel de fondo
        const carouselUrls = allItems
            .filter(p => p.imagenes && p.imagenes.length > 0)
            .slice(0, 5)
            .map(p => getPublicImageUrl(p.imagenes[0].path));
        renderCarouselItems(carouselUrls);

    } catch (e) {
        console.warn("No se pudieron cargar las opciones de filtro o el carrusel.", e.message);
    }
}

// --- MODO EDICIÓN ---
function toggleEditMode() {
    isEditing = !isEditing;
    editToggleButton.textContent = isEditing ? 'Salir de Edición' : 'Activar Edición';
    saveOrderButton.classList.toggle('hidden', !isEditing);
    
    document.querySelectorAll('.edit-controls').forEach(el => el.classList.toggle('hidden', !isEditing));
    document.querySelectorAll('.card-content').forEach(el => el.classList.toggle('cursor-pointer', !isEditing));
    
    if (isEditing) {
        enableSorting();
        showAlert("Modo Edición activado. Ahora puedes arrastrar las obras para reordenarlas.", 'info');
    } else {
        disableSorting();
    }
}

function enableSorting() {
    if (sortableInstance) disableSorting();
    // Asegurarse de que el contenedor existe
    if (!galleryContainer) {
        console.error("No se encontró el galleryContainer para activar el ordenamiento.");
        return;
    }
    sortableInstance = new Sortable(galleryContainer, {
        animation: 150,
        handle: '.drag-handle', // El elemento que activa el arrastre
        ghostClass: 'sortable-ghost', // La clase CSS para el fantasma
        onUpdate: () => {
            saveOrderButton.disabled = false; // Activa el botón de guardar al reordenar
        },
    });
}

function disableSorting() {
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
}

// --- ESTA ES LA FUNCIÓN CORREGIDA ---
async function saveOrder() {
    if (!sortableInstance) return;
    
    saveOrderButton.textContent = "Guardando...";
    saveOrderButton.disabled = true;

    // Obtener el nuevo orden desde el DOM
    const orderedItems = Array.from(galleryContainer.children).map((card, index) => ({
        id: parseInt(card.dataset.id),
        orden: index,
    }));

    try {
        // --- INICIO DE LA CORRECCIÓN ---
        // En lugar de un 'upsert' masivo, iteramos y enviamos
        // una actualización explícita por cada item.
        // Esto evita el error de "not-null constraint"
        for (const item of orderedItems) {
            const { error } = await client
                .from('productos')
                .update({ orden: item.orden }) // Actualiza SOLO la columna 'orden'
                .eq('id', item.id);           // Donde el 'id' coincida

            if (error) {
                // Si un item falla, detenemos todo y mostramos el error
                throw error;
            }
        }
        // --- FIN DE LA CORRECCIÓN ---
        
        // Actualizar el caché local para que los filtros funcionen correctamente
        orderedItems.forEach(item => {
            const product = productosCache.find(p => p.id === item.id);
            if(product) product.order = item.orden;
        });
        productosCache.sort((a, b) => a.order - b.order);

        showAlert("¡Orden guardado exitosamente!", 'success');

    } catch (error) {
        console.error("Error al guardar el orden:", error);
        showAlert(`Error al guardar: ${error.message}`, 'error');
    } finally {
        saveOrderButton.textContent = "Guardar Orden";
        // El botón de guardar se mantiene deshabilitado hasta un nuevo cambio
        saveOrderButton.disabled = true; 
    }
}


// --- LÓGICA DEL MODAL ---
window.openModal = (id) => {
    if (isEditing) return; // No abrir modal en modo edición
    const obra = productosCache.find(p => p.id === id);
    if (!obra) return;

    // Lógica para la imagen principal y las miniaturas
    const mainImageHTML = `
        <div id="modal-main-image-container" class="w-full h-full flex items-center justify-center bg-bg-principal rounded-sm overflow-hidden">
            <div class="image-zoom-container cursor-move w-full h-full" onmousemove="zoomImage(event, this)" onmouseleave="resetZoom(this)">
                <img src="${obra.images.length > 0 ? obra.images[0].url : obra.mainImage}" alt="${obra.title} - Vista principal" class="zoom-image w-full h-full object-contain transition-transform duration-300" data-index="0" />
            </div>
        </div>`;
    
    const thumbnailsHTML = obra.images.map((img, index) => `
        <div class="thumbnail-item cursor-pointer p-1 border-2 ${index === 0 ? 'border-pantone-magenta' : 'border-transparent'} rounded-sm transition-all" 
             onclick="switchModalImage('${img.url}', this)">
            <img src="${img.url}" alt="Miniatura ${index + 1}" class="w-full h-full object-cover">
        </div>
    `).join('');

    const descriptionHTML = `
        <div class="mt-6 pt-4 border-t border-border-light text-text-muted">
            <h4 class="text-md font-semibold text-text-dark mb-2">Descripción</h4>
            <p class="font-light text-sm leading-relaxed">${obra.description || 'Sin descripción detallada.'}</p>
        </div>`;

    const priceText = obra.show_price ? formatPrice(obra.price) : 'Consultar';
    const availabilityText = obra.is_available ? 'Disponible' : 'Vendida';
    const availabilityClass = obra.is_available ? 'text-green-600' : 'text-red-500';
    const whatsappLink = `https://wa.me/54928050303?text=Hola%2C%20estoy%20interesado%20en%20la%20obra%20%22${encodeURIComponent(obra.title)}%22%20(ID:%20${obra.id}).%20Me%20gustar%C3%ADa%20consultar%20sobre%20ella.`;

    modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="image-column flex flex-col items-center">
                <div class="aspect-[4/3] w-full">
                    ${mainImageHTML}
                </div>
                ${obra.images.length > 1 ? `
                    <div id="modal-thumbnails" class="grid grid-cols-5 gap-2 mt-4 w-full max-w-sm">
                        ${thumbnailsHTML}
                    </div>
                ` : ''}
            </div>
            <div class="info-column p-4 md:p-0">
                <h2 class="text-3xl font-light text-text-dark mb-2">${obra.title}</h2>
                <p class="text-xl font-semibold text-pantone-magenta mb-4">${obra.year || 'Año N/A'}</p>
                <div class="space-y-3 mb-4 text-text-dark">
                    <p><strong>Técnica:</strong> ${obra.technique || 'N/A'}</p>
                    <p><strong>Medidas:</strong> ${obra.size || 'N/A'}</p>
                    <p><strong>Serie:</strong> ${obra.serie || 'N/A'}</p>
                    <p><strong>Categoría:</strong> ${obra.category || 'N/A'}</p>
                </div>
                ${obra.description ? descriptionHTML : ''}
                <div class="mt-4 pt-4 border-t border-border-light">
                    <p class="text-lg font-medium"><strong>Disponibilidad:</strong> <span class="font-semibold ${availabilityClass}">${availabilityText}</span></p>
                    <p class="text-lg font-medium mt-2"><strong>Precio:</strong> <span class="${obra.show_price && obra.price ? 'font-bold' : 'font-semibold text-pantone-magenta'}">${priceText}</span></p>
                </div>
                <div class="mt-6">
                    <a href="${whatsappLink}" target="_blank" class="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-500 hover:bg-green-600 transition duration-300">
                        <svg class="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 2.25c-5.497 0-9.967 4.47-9.967 9.967 0 1.77.464 3.444 1.303 4.887l-1.37 5.293 5.422-1.343c1.433.784 3.067 1.196 4.612 1.196 5.497 0 9.967-4.47 9.967-9.967s-4.47-9.967-9.967-9.967zm4.394 13.927s-.272-.14-.567-.282c-.294-.142-.44-.224-.716-.546-.275-.322-.727-.373-1.04-.373-.243 0-.41.066-.64.066-.23 0-.41-.09-.64-.403s-.84-.817-1.025-1.127c-.184-.31-.383-.69-.533-1.02-.15-.33-.016-.496.096-.688.087-.15.195-.276.294-.418.099-.142.164-.268.229-.403.064-.135.032-.268-.008-.403-.04-.135-.383-.896-.513-1.226-.13-.33-.26-.27-.403-.27-.142 0-.306-.02-.47-.02-.164 0-.44.02-.67.02s-.64-.085-.947.88c-.307.965-1.19 1.77-1.19 1.77s-.184.18-.09.344c.09.164.887 1.25 1.127 1.545.24.295.49.567.817.896 1.11 1.096 2.09 1.488 2.68 1.638.18.04.403.04.587.04.282 0 .546-.108.73-.3.26-.282.59-.513.82-.744.23-.23.414-.49.627-.67l.112-.086c.099-.085.27-.224.513-.333.243-.11.455-.175.76-.108.306.066.567.31.676.474.108.164.19.344.19.587 0 .243-.09.474-.356.705-.26.23-.424.428-.56.59l-.09.09c-.066.065-.13.13-.19.19s-.14.07-.205.108c-.065.04-.15.1-.258.127-.108.027-.216.035-.34.035z"/></svg>
                        Consultar por esta obra
                    </a>
                </div>
            </div>
        </div>`;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
};

window.closeModal = (event) => {
    if (event && event.target !== modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
};

window.switchModalImage = (imageUrl, clickedElement) => {
    const mainImage = document.querySelector('#modal-main-image-container .zoom-image');
    if (mainImage) {
        mainImage.src = imageUrl;
        resetZoom(mainImage.parentElement);
    }
    document.querySelectorAll('.thumbnail-item').forEach(thumb => {
        thumb.classList.remove('border-pantone-magenta');
        thumb.classList.add('border-transparent');
    });
    clickedElement.classList.add('border-pantone-magenta');
    clickedElement.classList.remove('border-transparent');
};

function zoomImage(event, container) {
    const img = container.querySelector('.zoom-image');
    const { left, top, width, height } = container.getBoundingClientRect();
    const x = ((event.clientX - left) / width) * 100;
    const y = ((event.clientY - top) / height) * 100;
    img.style.transformOrigin = `${x}% ${y}%`;
    img.style.transform = 'scale(2.5)';
}

function resetZoom(container) {
    const img = container.querySelector('.zoom-image');
    if (img) {
      img.style.transform = 'scale(1)';
    }
}


// --- LISTENERS Y SCROLL BEHAVIOR ---
const firstSection = document.querySelector('section#carousel-header');
window.addEventListener('scroll', () => {
    if (!firstSection) return;
    const firstSectionHeight = firstSection.offsetHeight;
    if (window.scrollY > firstSectionHeight - 100) {
        mainFooter.classList.remove('translate-y-full');
    } else {
        mainFooter.classList.add('translate-y-full');
    }

    const gallerySectionTop = gallerySection ? gallerySection.offsetTop : firstSectionHeight;
    if (window.scrollY > gallerySectionTop - window.innerHeight / 2) {
        whatsappButton.classList.add('show');
    } else {
        whatsappButton.classList.remove('show');
    }
});

// Listeners de filtros y modo edición
searchInput.addEventListener('input', handleFilterChange);
filterYear.addEventListener('change', handleFilterChange);
filterCategory.addEventListener('change', handleFilterChange);
filterSeries.addEventListener('change', handleFilterChange);
filterAvailability.addEventListener('change', handleFilterChange); 
editToggleButton.addEventListener('click', toggleEditMode);
saveOrderButton.addEventListener('click', saveOrder);


// --- INICIALIZACIÓN DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    mainFooter.classList.add('translate-y-full');
    whatsappButton.classList.remove('show');
    
    await fetchGalleryPage(); 
    setupInfiniteScroll(); 
    
    fetchAndPopulateFilters(); 
    
    checkAdminStatus(); 
});