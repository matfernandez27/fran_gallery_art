// js/main.js

// Inicialización de Supabase usando config.js
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

let productos = [];
let isEditing = false;
let sortableInstance = null;
let carouselIntervalId = null;

const galleryContainer = document.getElementById("gallery-container");
const status = document.getElementById("status");
const loadingOverlay = document.getElementById("loading-overlay");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const alertDiv = document.getElementById('alert');

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

// VARIABLES PARA SCROLL INFINITO
let page = 0;
const PAGE_SIZE = 12;
let hasMore = true;
let isLoading = false;


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden');
    alertDiv.classList.remove('bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');

    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    }
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}
window.showAlert = showAlert;

/**
 * Formatea un número como un precio con el símbolo de dólar ($), sin decimales.
 * @param {number} price El precio a formatear.
 * @returns {string} El precio formateado (ej: $1,200) o 'Consultar'.
 */
function formatPrice(price) {
    if (!price) return 'Consultar';
    // Usamos Intl.NumberFormat para formatear el número, y anteponemos '$' para forzar el símbolo simple.
    const formatted = new Intl.NumberFormat('es-AR', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    }).format(price);
    return `$${formatted}`;
}

// --- LÓGICA DE SEGURIDAD: VERIFICACIÓN DE ADMIN ---
async function checkAdminStatus() {
    try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            adminControls.classList.remove('hidden');
        } else {
            adminControls.classList.add('hidden');
        }
    } catch(e) {
         console.warn("Error checking admin status:", e);
    }
}


// --- LÓGICA DEL CARRUSEL DE FONDO (DINÁMICO) ---
const carouselContainer = document.getElementById('carousel-container');
let currentCarouselIndex = 0;

// Función auxiliar para obtener la URL pública de una imagen
function getPublicImageUrl(path) {
    if (!path) return 'https://via.placeholder.com/100x100?text=No+Image';
    const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
}

function renderCarouselItems(carouselUrls) {
    if (!carouselContainer || carouselUrls.length === 0) return;

    if (carouselIntervalId) {
        clearInterval(carouselIntervalId);
    }
    
    carouselContainer.innerHTML = carouselUrls.map((url, index) => `
        <div class="carousel-item ${index === 0 ? 'active' : ''}" style="background-image: url('${url}')"></div>
    `).join('');

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


// --- FUNCIONES CORE ---
function normalize(p) {
    const images = p.imagenes || [];
    // Transformar paths a URLs públicas
    const imagesWithUrls = images.map(img => ({
        ...img,
        url: getPublicImageUrl(img.path)
    }));

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
        price: p.price || null,
        is_available: p.is_available || false,
        show_price: p.show_price || false,
        images: imagesWithUrls,
        mainImage: (imagesWithUrls.length ? imagesWithUrls[0].url : "https://via.placeholder.com/400x300?text=Sin+Imagen")
    };
}

/**
 * Renderiza un conjunto de obras, agregándolas al contenedor de la galería.
 * @param {Array} items - Obras a renderizar.
 * @param {boolean} append - Si es true, las agrega al final; si es false, reemplaza el contenido.
 */
function renderGallery(items, append = true) {
    if (!append) {
        galleryContainer.innerHTML = '';
        productos = [];
    }

    if (items.length === 0 && productos.length === 0) {
        galleryContainer.innerHTML = '<p class="col-span-full text-center text-text-muted">No se encontraron obras que coincidan con los filtros.</p>';
        status.textContent = ''; // Limpiar mensaje de status si no hay obras
        return;
    }

    items.forEach(obra => {
        productos.push(obra); // Agregar al array principal
        const card = document.createElement("div");
        card.className = "bg-bg-card rounded-sm overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition duration-500 transform hover:-translate-y-1 group border border-border-light";
        card.setAttribute('data-id', obra.id); 
        card.setAttribute('onclick', `openModal(${obra.id})`);
        
        // --- Bloque de Tarjeta con Precio y Disponibilidad solicitados ---
        const formattedPrice = obra.show_price && obra.price
            ? formatPrice(obra.price)
            : 'Consultar';
            
        const priceDisplayClass = obra.show_price && obra.price ? 'font-bold text-text-dark' : 'text-pantone-magenta font-semibold';
        const availabilityText = obra.is_available ? 'Disponible' : 'Vendida'; // <- CORREGIDO
        const availabilityClass = obra.is_available ? 'text-green-600' : 'text-red-500';

        card.innerHTML = `
            <div class="aspect-[4/3] overflow-hidden flex items-center justify-center bg-bg-principal"> 
                <img 
                    src="${obra.mainImage}" 
                    alt="Obra de Francisco Fernández: ${obra.title}, ${obra.technique}" 
                    class="w-full h-full object-contain transition duration-500 group-hover:scale-105"
                    onerror="this.onerror=null;this.src='https://via.placeholder.com/400x300?text=Sin+Imagen';" 
                />
            </div>
            <div class="p-4 border-t border-border-light">
                <h3 class="text-xl font-medium text-text-dark truncate">${obra.title}</h3>
                <p class="text-sm text-text-muted">${obra.technique} · <span class="text-pantone-magenta font-semibold">${obra.year}</span></p>
                <div class="flex justify-between items-center pt-2 mt-2 border-t border-border-light">
                    <span class="text-xs font-semibold ${availabilityClass}">
                        ${availabilityText}
                    </span>
                    <span class="text-lg ${priceDisplayClass}">
                        ${formattedPrice}
                    </span>
                </div>
            </div>
        `;
        galleryContainer.appendChild(card);
    });

    if (isEditing) {
        enableSorting();
    }
}

/**
 * Carga el siguiente lote de obras desde Supabase.
 */
async function loadMoreWorks() {
    if (!hasMore || isLoading) return;

    isLoading = true;
    status.textContent = "Cargando obras...";
    loadingOverlay.classList.remove('hidden');

    try {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true })
            .order('anio', { ascending: false })
            .range(from, to);
        
        loadingOverlay.classList.add('hidden');
        isLoading = false;

        if (error) {
            throw new Error(`Error de Supabase: ${error.message}`);
        }
        
        const newWorks = data.map(normalize);
        renderGallery(newWorks, true); // Agregar al final
        
        if (newWorks.length < PAGE_SIZE) {
            hasMore = false;
            status.textContent = "Fin de la galería.";
        } else {
            page++;
            status.textContent = "";
        }

    } catch (error) {
        console.error("Error al cargar la galería:", error);
        status.textContent = "Error al cargar más obras.";
        loadingOverlay.classList.add('hidden');
        isLoading = false;
    }
}


/**
 * Inicializa la galería cargando los filtros y el primer lote de obras.
 */
async function initGallery() {
    // Carga inicial solo para obtener datos de filtros y carrusel
    try {
        const { data: allData, error } = await client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true })
            .order('anio', { ascending: false });

        if (error) throw error;
        
        const allWorks = allData.map(normalize);
        
        // 1. Renderizar el carrusel de fondo con las 5 primeras imágenes disponibles
        const carouselUrls = allWorks
            .filter(p => p.images.length > 0)
            .slice(0, 5)
            .map(p => p.mainImage);
        renderCarouselItems(carouselUrls);
        
        // 2. Poblar opciones de filtro
        populateFilterOptions(allWorks);

    } catch (error) {
        console.error("Error al inicializar la galería:", error);
    }
    
    // 3. Cargar el primer lote de obras (restablecer paginación)
    page = 0;
    hasMore = true;
    galleryContainer.innerHTML = '';
    productos = [];
    
    // Desactivar temporalmente el scroll infinito mientras se aplican filtros
    // La función applyFilters llamará a loadFilteredWorks, que manejará la paginación de los filtros
    
    if (searchInput.value || filterYear.value || filterCategory.value || filterSeries.value) {
        // Si hay filtros preestablecidos, cargar filtrado
        applyFilters(); 
    } else {
        // Carga inicial sin filtros
        loadMoreWorks();
    }
}

/**
 * Carga obras aplicando filtros y reiniciando la paginación.
 */
async function loadFilteredWorks() {
    isLoading = true;
    status.textContent = "Filtrando obras...";
    loadingOverlay.classList.remove('hidden');

    try {
        let query = client.from('productos')
            .select('*')
            .order('orden', { ascending: true })
            .order('anio', { ascending: false });
        
        const searchText = searchInput.value.toLowerCase().trim();
        const year = filterYear.value;
        const category = filterCategory.value;
        const series = filterSeries.value;

        // Construir la consulta con filtros (solo filtros directos)
        if (year) query = query.eq('anio', parseInt(year));
        if (category) query = query.eq('categoria', category);
        if (series) query = query.eq('serie', series);
        
        // Si hay texto de búsqueda, obtenemos todo y filtramos localmente (por ser un filtro en múltiples campos)
        if (searchText) {
            const { data, error } = await query;
            if (error) throw error;

            let filteredItems = data.map(normalize).filter(obra => 
                obra.title.toLowerCase().includes(searchText) ||
                obra.description.toLowerCase().includes(searchText) ||
                obra.technique.toLowerCase().includes(searchText)
            );
            
            // Renderiza todo lo filtrado (el scroll infinito no aplica bien con filtros de texto combinados con paginación)
            renderGallery(filteredItems, false);
            hasMore = false; // Deshabilitar scroll infinito en modo filtrado complejo
            status.textContent = filteredItems.length > 0 ? '' : 'No se encontraron obras que coincidan con los filtros.';
            
        } else {
            // Si no hay filtro de texto, usamos paginación de Supabase para los filtros simples
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            
            const { data, error } = await query.range(from, to);
            if (error) throw error;

            const newWorks = data.map(normalize);
            renderGallery(newWorks, page !== 0); 

            if (newWorks.length < PAGE_SIZE) {
                hasMore = false;
                status.textContent = "Fin de la galería.";
            } else {
                page++;
                status.textContent = "";
            }
        }
    } catch (error) {
        console.error("Error al cargar obras filtradas:", error);
        status.textContent = "Error al filtrar obras.";
    } finally {
        loadingOverlay.classList.add('hidden');
        isLoading = false;
    }
}


function applyFilters() {
    // Reiniciar paginación al aplicar nuevos filtros
    page = 0;
    hasMore = true;
    galleryContainer.innerHTML = '';
    productos = [];
    loadFilteredWorks();
}

function populateFilterOptions(allWorks) {
    const years = [...new Set(allWorks.map(p => p.year).filter(y => y))].sort((a, b) => b - a);
    const categories = [...new Set(allWorks.map(p => p.category).filter(c => c))].sort();
    const seriesList = [...new Set(allWorks.map(p => p.serie).filter(s => s))].sort();

    filterYear.innerHTML = '<option value="">Todos</option>';
    filterCategory.innerHTML = '<option value="">Todas</option>';
    filterSeries.innerHTML = '<option value="">Todas</option>';
    
    years.forEach(year => filterYear.innerHTML += `<option value="${year}">${year}</option>`);
    categories.forEach(cat => filterCategory.innerHTML += `<option value="${cat}">${cat}</option>`);
    seriesList.forEach(ser => filterSeries.innerHTML += `<option value="${ser}">${ser}</option>`);
}

// --- MODAL Y DETALLE DE OBRA ---

window.openModal = (id) => {
    const obra = productos.find(p => p.id === id);
    if (!obra) return;
    
    // Generar el carrusel de imágenes del modal
    const imageCarousel = obra.images.map((img, index) => `
        <div class="modal-carousel-item ${index === 0 ? 'active' : ''}" data-index="${index}">
            <div class="image-zoom-container cursor-move" onmousemove="zoomImage(event, this)" onmouseleave="resetZoom(this)">
                <img src="${img.url}" alt="${obra.title} - Imagen ${index + 1}" class="zoom-image w-full h-full object-contain transition-transform duration-300" />
            </div>
            <p class="text-xs text-center text-text-muted mt-2">${img.name || `Imagen ${index + 1}`}</p>
        </div>
    `).join('');
    
    const navDots = obra.images.map((_, index) => `
        <button class="w-2 h-2 rounded-full bg-text-muted transition-colors duration-300 ${index === 0 ? 'bg-pantone-magenta' : ''}" 
                onclick="goToSlide(${index})"></button>
    `).join('');


    // Lógica de Precio y Disponibilidad
    const priceText = obra.show_price && obra.price 
        ? formatPrice(obra.price) // <- USA LA FUNCIÓN CREADA
        : 'Consultar';
        
    const availabilityText = obra.is_available ? 'Disponible' : 'Vendida'; // <- CORREGIDO
    const availabilityClass = obra.is_available ? 'text-green-600' : 'text-red-500';

    const whatsappLink = `https://wa.me/5491100000000?text=Hola%2C%20estoy%20interesado%20en%20la%20obra%20%22${encodeURIComponent(obra.title)}%22%20(ID:%20${obra.id}).%20Me%20gustar%C3%ADa%20consultar%20el%20precio%20y%2Fo%20disponibilidad.`;
    
    // Contenido del modal
    modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="image-column">
                <div id="modal-image-carousel" class="relative overflow-hidden aspect-[4/3] bg-bg-principal">
                    ${imageCarousel}
                </div>
                ${obra.images.length > 1 ? `
                    <div class="carousel-nav flex justify-center space-x-2 mt-4">
                        ${navDots}
                    </div>
                ` : ''}
            </div>
            
            <div class="info-column p-4 md:p-0">
                <h2 class="text-3xl font-light text-text-dark mb-2">${obra.title}</h2>
                <p class="text-xl font-semibold text-pantone-magenta mb-4">${obra.year || 'Año N/A'}</p>
                
                <div class="space-y-3 mb-6">
                    <p class="text-lg text-text-dark"><strong>Técnica:</strong> ${obra.technique || 'N/A'}</p>
                    <p class="text-lg text-text-dark"><strong>Medidas:</strong> ${obra.size || 'N/A'}</p>
                    <p class="text-lg text-text-dark"><strong>Serie:</strong> ${obra.serie || 'N/A'}</p>
                    <p class="text-lg text-text-dark"><strong>Categoría:</strong> ${obra.category || 'N/A'}</p>
                </div>

                <div class="mt-4 pt-4 border-t border-border-light">
                    <p class="text-xl font-medium text-text-dark"><strong>Disponibilidad:</strong> <span class="font-semibold ${availabilityClass}">${availabilityText}</span></p>
                    <p class="text-xl font-medium text-text-dark mt-2"><strong>Precio:</strong> <span class="${obra.show_price && obra.price ? 'font-bold' : 'font-semibold text-pantone-magenta'}">${priceText}</span></p>
                </div>

                <div class="mt-6">
                    <a href="${whatsappLink}" target="_blank" class="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-500 hover:bg-green-600 transition duration-300">
                        <svg class="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.031 2.25c-5.497 0-9.967 4.47-9.967 9.967 0 1.77.464 3.444 1.303 4.887l-1.37 5.293 5.422-1.343c1.433.784 3.067 1.196 4.612 1.196 5.497 0 9.967-4.47 9.967-9.967s-4.47-9.967-9.967-9.967zm4.394 13.927s-.272-.14-.567-.282c-.294-.142-.44-.224-.716-.546-.275-.322-.727-.373-1.04-.373-.243 0-.41.066-.64.066-.23 0-.41-.09-.64-.403s-.84-.817-1.025-1.127c-.184-.31-.383-.69-.533-1.02-.15-.33-.016-.496.096-.688.087-.15.195-.276.294-.418.099-.142.164-.268.229-.403.064-.135.032-.268-.008-.403-.04-.135-.383-.896-.513-1.226-.13-.33-.26-.27-.403-.27-.142 0-.306-.02-.47-.02-.164 0-.44.02-.67.02s-.64-.085-.947.88c-.307.965-1.19 1.77-1.19 1.77s-.184.18-.09.344c.09.164.887 1.25 1.127 1.545.24.295.49.567.817.896 1.11 1.096 2.09 1.488 2.68 1.638.18.04.403.04.587.04.282 0 .546-.108.73-.3.26-.282.59-.513.82-.744.23-.23.414-.49.627-.67l.112-.086c.099-.085.27-.224.513-.333.243-.11.455-.175.76-.108.306.066.567.31.676.474.108.164.19.344.19.587 0 .243-.09.474-.356.705-.26.23-.424.428-.56.59l-.09.09c-.066.065-.13.13-.19.19s-.14.07-.205.108c-.065.04-.15.1-.258.127-.108.027-.216.035-.34.035z"/></svg>
                        Consultar por esta obra
                    </a>
                </div>

                <div class="mt-6 pt-4 border-t border-border-light text-text-muted">
                    <p class="font-light">${obra.description || 'Sin descripción detallada.'}</p>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    
    // Iniciar carrusel del modal
    if (obra.images.length > 1) {
        initModalCarousel();
    }
};

window.closeModal = (event) => {
    if (event && event.target !== modal) return;
    
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    
    // Resetear el carrusel y zoom
    const zoomContainers = document.querySelectorAll('.image-zoom-container');
    zoomContainers.forEach(resetZoom);
};

let currentSlide = 0;

function initModalCarousel() {
    currentSlide = 0;
    const items = document.querySelectorAll('#modal-image-carousel .modal-carousel-item');
    items.forEach((item, index) => {
        item.classList.toggle('active', index === 0);
    });
    const dots = document.querySelectorAll('.carousel-nav button');
    dots.forEach((dot, index) => {
        dot.classList.toggle('bg-pantone-magenta', index === 0);
        dot.classList.toggle('bg-text-muted', index !== 0);
    });
}

window.goToSlide = (index) => {
    const items = document.querySelectorAll('#modal-image-carousel .modal-carousel-item');
    const dots = document.querySelectorAll('.carousel-nav button');
    
    if (index >= 0 && index < items.length) {
        items[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('bg-pantone-magenta');
        dots[currentSlide].classList.add('bg-text-muted');
        
        currentSlide = index;
        items[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('bg-pantone-magenta');
        dots[currentSlide].classList.remove('bg-text-muted');
    }
};

// Funciones de Zoom
function zoomImage(event, container) {
    const img = container.querySelector('.zoom-image');
    if (!img) return;

    const { offsetX, offsetY, target } = event;
    const { offsetWidth, offsetHeight } = target;

    const xPercent = (offsetX / offsetWidth) * 100;
    const yPercent = (offsetY / offsetHeight) * 100;
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


// --- LÓGICA DE ORDENAMIENTO (solo si isEditing es true) ---

function enableSorting() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    
    sortableInstance = new Sortable(galleryContainer, {
        animation: 150,
        handle: '.drag-handle', // Asumiendo que el handle está dentro de la tarjeta
        ghostClass: 'bg-indigo-100',
        onUpdate: (evt) => {
            saveOrderButton.disabled = false;
        }
    });
}

async function saveOrder() {
    saveOrderButton.textContent = "Guardando...";
    saveOrderButton.disabled = true;

    const orderUpdates = Array.from(galleryContainer.children).map((card, index) => ({
        id: parseInt(card.dataset.id),
        orden: index 
    }));

    try {
        const { error } = await client
            .from('productos')
            .upsert(orderUpdates); 

        if (error) throw error;

        // Actualizar el array local
        orderUpdates.forEach(update => {
            const index = productos.findIndex(p => p.id === update.id);
            if (index !== -1) {
                productos[index].order = update.orden;
            }
        });
        productos.sort((a, b) => a.order - b.order); // Reordenar el array principal

        showAlert("Orden guardado exitosamente!", 'success');
    } catch (error) {
        console.error("Error al guardar el orden:", error);
        showAlert("Error al guardar el orden: " + error.message, 'error');
    } finally {
        saveOrderButton.textContent = "Guardar Orden";
        saveOrderButton.disabled = true;
    }
}


// --- LISTENERS Y SCROLL ---

// Toggle del modo edición
if (editToggleButton) {
    editToggleButton.addEventListener('click', () => {
        isEditing = !isEditing;
        editToggleButton.textContent = isEditing ? 'Salir de Edición' : 'Modo Edición';
        saveOrderButton.classList.toggle('hidden', !isEditing);
        
        if (isEditing) {
            enableSorting();
            showAlert("Modo Edición activado. Puedes arrastrar para reordenar.", 'info');
        } else {
            if (sortableInstance) {
                sortableInstance.destroy();
                sortableInstance = null;
            }
            saveOrderButton.disabled = true;
            // Al salir, recargamos el primer lote por si hubo cambios de orden no guardados
            initGallery(); 
        }
    });
}

// Listener para el botón guardar orden
if (saveOrderButton) {
    saveOrderButton.addEventListener('click', saveOrder);
}


const firstSection = document.querySelector('section#carousel-header'); 

window.addEventListener('scroll', () => {
    if (!firstSection) return;
    
    const firstSectionHeight = firstSection.offsetHeight;
    
    // Controlar visibilidad del Footer
    if (window.scrollY > firstSectionHeight - 100) { 
        mainFooter.classList.remove('translate-y-full');
    } else {
        mainFooter.classList.add('translate-y-full');
    }

    // Controlar visibilidad del botón de WhatsApp
    const gallerySectionTop = gallerySection ? gallerySection.offsetTop : firstSectionHeight;
    if (window.scrollY > gallerySectionTop - window.innerHeight / 2) { 
        whatsappButton.classList.add('show');
    } else {
        whatsappButton.classList.remove('show');
    }
    
    // Lógica de Scroll Infinito
    if (hasMore && !isLoading && !isEditing && !searchInput.value && (filterYear.value === '' && filterCategory.value === '' && filterSeries.value === '') ) {
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 300) {
            loadMoreWorks();
        }
    }
});

// --- LISTENERS DE FILTROS ---
if (searchInput) searchInput.addEventListener('input', applyFilters);
if (filterYear) filterYear.addEventListener('change', applyFilters);
if (filterCategory) filterCategory.addEventListener('change', applyFilters);
if (filterSeries) filterSeries.addEventListener('change', applyFilters);

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    mainFooter.classList.add('translate-y-full');
    whatsappButton.classList.remove('show');
    await initGallery(); // Llamar a la nueva función de inicialización
    checkAdminStatus();
});