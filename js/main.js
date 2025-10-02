// js/main.js

// Inicialización de Supabase usando config.js
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
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
        images,
        mainImage: (images.length ? images[0].url : "")
    };
}

function renderGallery(items) {
    galleryContainer.innerHTML = '';
    if (items.length === 0) {
        galleryContainer.innerHTML = '<p class="col-span-full text-center text-text-muted">No se encontraron obras que coincidan con los filtros.</p>';
        return;
    }

    items.forEach(obra => {
        const card = document.createElement("div");
        card.className = "bg-bg-card rounded-sm overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition duration-500 transform hover:-translate-y-1 group border border-border-light";
        card.setAttribute('data-id', obra.id); 
        card.setAttribute('onclick', `openModal(${obra.id})`);
        
        card.innerHTML = `
            <div class="aspect-[4/3] overflow-hidden flex items-center justify-center bg-bg-principal"> 
                <img src="${obra.mainImage}" alt="Obra de Francisco Fernández: ${obra.title}, ${obra.technique}" 
                    class="w-full h-full object-contain transition duration-500 group-hover:scale-105" 
                    onerror="this.onerror=null;this.src='[URL_IMAGEN_DEFAULT]';" />
            </div>
            <div class="p-4 border-t border-border-light">
                <h3 class="text-xl font-medium text-text-dark">${obra.title}</h3>
                <p class="text-sm text-text-muted">${obra.technique} · <span class="text-pantone-magenta font-semibold">${obra.year}</span></p>
            </div>
        `;
        galleryContainer.appendChild(card);
    });
    
    if (isEditing) {
        enableSorting();
    }
}

async function initGallery() {
    status.textContent = "Cargando obras...";
    loadingOverlay.classList.remove('hidden');

    try {
        const { data, error } = await client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true }) 
            .order('anio', { ascending: false }); 

        loadingOverlay.classList.add('hidden');
        
        if (error) {
            throw new Error(`Error de Supabase: ${error.message}`);
        }

        productos = data.map(normalize);
        productos.sort((a, b) => {
            if (a.order !== b.order) {
                if (!a.order) return 1;
                if (!b.order) return -1;
                return a.order - b.order; 
            }
            return b.year - a.year; 
        });

        const carouselUrls = productos
            .filter(p => p.mainImage) 
            .slice(0, 4) 
            .map(p => p.mainImage);

        renderCarouselItems(carouselUrls);

        const years = [...new Set(productos.map(a => a.year).filter(Boolean))].sort((a, b) => b - a);
        filterYear.innerHTML = '<option value="">Año</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');

        const series = [...new Set(productos.map(a => a.serie).filter(s => s && s.trim() !== ''))].sort((a, b) => a.localeCompare(b));
        filterSeries.innerHTML = '<option value="">Serie</option>' + series.map(s => `<option value="${s}">${s}</option>`).join('');

        const categoryDefault = document.querySelector('#filter-category option[value=""]');
        if (categoryDefault.textContent === 'Todas las categorías') {
            categoryDefault.textContent = 'Categoría';
        }

        applyFilters(); 
        status.textContent = "";

        await checkAdminStatus(); 
    } catch (e) {
        loadingOverlay.classList.add('hidden');
        status.textContent = `¡ERROR AL CARGAR LA GALERÍA! Detalle: ${e.message}`;
        console.error("Error crítico al cargar initGallery:", e);
    }
}

function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const y = filterYear.value;
    const c = filterCategory.value;
    const s = filterSeries.value;

    let filtered = productos.filter(p => {
        const hay = `${p.title || ""} ${p.technique || ""} ${p.year || ""} ${p.description || ""} ${p.serie || ""} ${p.category || ""}`.toLowerCase();
        
        let textMatch = hay.includes(q);
        let yearMatch = y ? String(p.year) === y : true;
        let categoryMatch = c ? String(p.category).toLowerCase() === c : true;
        let seriesMatch = s ? String(p.serie) === s : true;

        return textMatch && yearMatch && categoryMatch && seriesMatch;
    });

    renderGallery(filtered);
}

// --- LÓGICA DE REORDENAMIENTO ---
function enableSorting() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    sortableInstance = new Sortable(galleryContainer, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            if (evt.oldIndex !== evt.newIndex) {
                saveOrderButton.disabled = false;
                saveOrderButton.textContent = "Guardar Orden (Cambios Pendientes)";
                saveOrderButton.classList.add('bg-pantone-magenta', 'hover:bg-opacity-80', 'text-white');
                saveOrderButton.classList.remove('bg-green-600', 'hover:bg-green-700');
            }
        },
    });
}

editToggleButton.addEventListener('click', () => {
    isEditing = !isEditing;
    
    if (isEditing) {
        editToggleButton.textContent = 'Salir de Edición';
        editToggleButton.classList.replace('bg-border-light', 'bg-red-500');
        editToggleButton.classList.replace('hover:bg-pantone-magenta', 'hover:bg-red-600');
        editToggleButton.classList.remove('text-text-dark');
        editToggleButton.classList.add('text-white');

        saveOrderButton.classList.remove('hidden');
        galleryContainer.style.cursor = 'grab';
        applyFilters(); 
    } else {
        editToggleButton.textContent = 'Activar Edición';
        editToggleButton.classList.replace('bg-red-500', 'bg-border-light');
        editToggleButton.classList.replace('hover:bg-red-600', 'hover:bg-pantone-magenta');
        editToggleButton.classList.add('text-text-dark');
        editToggleButton.classList.remove('text-white'); 
        
        saveOrderButton.classList.add('hidden');
        galleryContainer.style.cursor = 'default';
        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
        initGallery(); 
    }
});

saveOrderButton.addEventListener('click', async () => {
    saveOrderButton.disabled = true;
    saveOrderButton.textContent = "Guardando...";
    saveOrderButton.classList.remove('bg-pantone-magenta', 'hover:bg-opacity-80', 'text-white');
    saveOrderButton.classList.add('bg-gray-500', 'hover:bg-gray-600', 'text-white'); 
    
    const cardElements = galleryContainer.querySelectorAll('[data-id]');
    const updates = [];

    cardElements.forEach((card, index) => {
        const obraId = parseInt(card.getAttribute('data-id'));
        const newOrder = index + 1;
        updates.push({ id: obraId, orden: newOrder });
    });
    
    const { error } = await client
        .from('productos')
        .upsert(updates); 

    if (error) {
        status.textContent = `Error al guardar el orden: ${error.message}`;
        console.error(error);
        saveOrderButton.textContent = "Error al Guardar";
    } else {
        status.textContent = "Orden guardado exitosamente!";
        await initGallery();
        
        saveOrderButton.textContent = "Orden Guardado";
        saveOrderButton.classList.add('bg-green-600', 'hover:bg-green-700', 'text-white');
        saveOrderButton.classList.remove('bg-gray-500', 'hover:bg-gray-600', 'bg-pantone-magenta'); 
    }
    
    saveOrderButton.disabled = false; 
});

// --- LÓGICA DE GUARDADO DE CAMBIOS DESDE EL MODAL ---
async function saveModalChanges(event, id) {
    event.preventDefault(); 
    
    const form = event.target;
    const saveButton = form.querySelector('button[type="submit"]');

    const updatedData = {
        titulo: form.titulo.value.trim(),
        anio: parseInt(form.anio.value.trim()),
        tecnica: form.tecnica.value.trim(),
        medidas: form.medidas.value.trim(),
        categoria: form.categoria.value,
        serie: form.serie.value.trim(),
        descripcion: form.descripcion.value.trim(),
    };

    saveButton.textContent = "Guardando...";
    saveButton.disabled = true;
    
    const { error } = await client
        .from('productos')
        .update(updatedData)
        .eq('id', id);

    if (error) {
        showAlert(`Error al guardar: ${error.message}. ¿Tiene las Políticas RLS de UPDATE configuradas?`, 'error');
    } else {
        showAlert("¡Obra actualizada exitosamente!", 'success');
        closeModal();
        await initGallery();
    }

    saveButton.textContent = "Guardar Cambios";
    saveButton.disabled = false;
}
window.saveModalChanges = saveModalChanges;

// --- MODAL LÓGICA ---
function openModal(id) {
    const obra = productos.find(p => p.id === parseInt(id));
    if (!obra) return;
    
    modalContent.innerHTML = '';
    
    const whatsappNumber = '+5492805032663'; 
    const whatsappMessage = encodeURIComponent(`¡Hola, Francisco! Vi esta obra en tu galería web y me encantaría saber más. El título es: ${obra.title}.`);
    const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
    
    let modalHtml;

    if (isEditing) {
        modalHtml = `
            <form id="edit-form" onsubmit="saveModalChanges(event, ${obra.id})">
                <div class="grid md:grid-cols-2 gap-8">
                    <div class="md:h-[65vh] h-80 overflow-hidden flex items-center justify-center bg-bg-principal rounded-sm">
                        <img src="${obra.mainImage}" alt="Imagen de la obra ${obra.title}" class="max-w-full max-h-full object-contain" />
                    </div>
                    
                    <div>
                        <input name="titulo" value="${obra.title}" class="text-3xl font-light w-full text-text-dark mb-2 border-b border-pantone-magenta focus:outline-none p-1" required />
                        <input name="anio" type="number" value="${obra.year}" class="text-xl text-pantone-magenta mb-4 w-20 border-b border-pantone-magenta focus:outline-none p-1" required />
                        
                        <div class="space-y-3 text-text-dark mb-6 border-b border-border-light pb-4">
                            <p class="text-sm">
                                <strong class="text-text-dark">Categoría:</strong>
                                <select name="categoria" class="ml-2 border border-border-light rounded-sm p-1 text-text-dark">
                                    <option value="grabado" ${obra.category === 'grabado' ? 'selected' : ''}>Grabado</option>
                                    <option value="dibujo" ${obra.category === 'dibujo' ? 'selected' : ''}>Dibujo</option>
                                    <option value="pintura" ${obra.category === 'pintura' ? 'selected' : ''}>Pintura</option>
                                </select>
                            </p>
                            <p class="text-sm"><strong class="text-text-dark">Serie:</strong> <input name="serie" value="${obra.serie || ''}" class="ml-2 border-b border-border-light focus:outline-none p-1 w-2/3 text-text-dark" /></p>
                            <p class="text-sm"><strong class="text-text-dark">Técnica:</strong> <input name="tecnica" value="${obra.technique}" class="ml-2 border-b border-border-light focus:outline-none p-1 w-2/3 text-text-dark" required /></p>
                            <p class="text-sm"><strong class="text-text-dark">Medidas:</strong> <input name="medidas" value="${obra.size}" class="ml-2 border-b border-border-light focus:outline-none p-1 w-2/3 text-text-dark" required /></p>
                        </div>
                        
                        <h3 class="text-xl font-medium border-b border-border-light pb-1 mb-2 text-text-dark">Descripción</h3>
                        <textarea name="descripcion" class="text-text-muted whitespace-pre-wrap text-sm w-full h-32 border border-border-light p-2 focus:border-pantone-magenta rounded-sm">${obra.description || 'Sin descripción.'}</textarea>
                        
                        <div class="mt-8 flex flex-wrap gap-3 pt-4 border-t border-border-light" id="thumbnail-container">
                            ${obra.images.map(img => `
                                <img src="${img.url}" alt="Miniatura de ${obra.title}" class="h-16 w-16 object-cover rounded-sm shadow border border-border-light" />
                            `).join('')}
                        </div>

                        <button type="submit" class="mt-8 w-full inline-flex text-center py-3 px-6 rounded-sm bg-pantone-magenta hover:bg-opacity-80 text-white font-semibold transition-colors items-center justify-center shadow-md">
                            Guardar Cambios
                        </button>
                        <button type="button" onclick="closeModal()" class="mt-4 w-full py-3 px-6 rounded-sm bg-border-light hover:bg-gray-300 text-text-dark font-semibold transition-colors items-center justify-center shadow-md">
                            Cancelar
                        </button>
                    </div>
                </div>
            </form>
        `;
    } else {
        modalHtml = `
            <div class="grid md:grid-cols-2 gap-8">
                <div id="zoom-container-${id}" class="md:h-[65vh] h-80 overflow-hidden flex items-center justify-center bg-bg-principal rounded-sm zoom-container">
                    <div class="zoom-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    </div>
                    <img id="modal-main-image-${id}" src="${obra.mainImage}" alt="Detalle de la obra de Francisco Fernández: ${obra.title}" class="max-w-full max-h-full object-contain zoom-image" />
                </div>

                <div>
                    <h2 class="text-3xl font-light text-text-dark mb-2">${obra.title}</h2>
                    <p class="text-xl text-pantone-magenta mb-4">${obra.year}</p>
                    
                    <div class="space-y-3 text-text-dark mb-6 border-b border-border-light pb-4">
                        <p class="text-sm"><strong>Categoría:</strong> ${obra.category || 'N/A'}</p>
                        <p class="text-sm"><strong>Serie:</strong> ${obra.serie || 'N/A'}</p>
                        <p class="text-sm"><strong>Técnica:</strong> ${obra.technique}</p>
                        <p class="text-sm"><strong>Medidas:</strong> ${obra.size}</p>
                    </div>
                    
                    <h3 class="text-xl font-medium border-b border-border-light pb-1 mb-2 text-text-dark">Descripción</h3>
                    <p class="text-text-muted whitespace-pre-wrap text-sm">${obra.description || 'Sin descripción.'}</p>
                    
                    <div class="mt-8 flex flex-wrap gap-3 pt-4 border-t border-border-light" id="thumbnail-container-${id}">
                        ${obra.images.map(img => `
                            <img src="${img.url}" alt="Miniatura de ${obra.title}" class="h-16 w-16 object-cover rounded-sm shadow cursor-pointer border border-border-light hover:border-pantone-magenta transition-colors" 
                                data-url="${img.url}" />
                        `).join('')}
                    </div>

                    <a href="${whatsappLink}" target="_blank" 
                    class="mt-8 w-full md:w-auto inline-flex text-center py-3 px-6 rounded-sm bg-whatsapp hover:bg-green-600 text-white font-semibold transition-colors items-center justify-center space-x-2 shadow-md">
                        <svg fill="#FFF" viewBox="0 0 24 24" width="20" height="20" class="whatsapp-icon"><path d="M12 2C6.48 2 2 6.48 2 12c0 3.25 1.5 6.2 3.88 8.1l-1.38 5.02L7.6 21.62C9.5 22.18 11.08 22 12 22c5.52 0 10-4.48 10-10C22 6.48 17.52 2 12 2zM17.43 15.4c-.09-.15-.36-.24-.77-.42-.42-.18-2.52-1.24-2.91-1.38-.39-.14-.67-.21-.95.21-.28.42-1.09 1.38-1.34 1.66-.25.28-.5.31-.92.21-.42-.1-.71-.34-1.27-.64-.47-.25-1.07-.65-2.03-1.89-.75-.98-1.25-1.95-1.38-2.2-.14-.25-.02-.38.11-.5.1-.11.23-.26.35-.4.12-.14.16-.25.25-.42.09-.17.04-.32-.02-.45-.06-.13-.57-1.36-.78-1.87-.2-.5-.41-.42-.56-.42-.15 0-.33-.02-.51-.02-.18 0-.47.07-.72.35-.25.28-.95.93-.95 2.27 0 1.34.97 2.64 1.1 2.82.13.18 1.92 3.03 4.6 4.24 2.68 1.21 2.68.85 2.97.8.29-.05.95-.39 1.08-.77.13-.38.13-.7.09-.77z"/></svg>
                        <span>Consultar por esta Obra</span>
                    </a>
                </div>
            </div>
        `;
    }
    
    modalContent.innerHTML = modalHtml;

    if (!isEditing) {
        const zoomContainer = document.getElementById(`zoom-container-${id}`);
        const mainImage = document.getElementById(`modal-main-image-${id}`);
        
        if (zoomContainer) {
            zoomContainer.addEventListener('mousemove', handleZoom);
            zoomContainer.addEventListener('mouseleave', () => resetZoom(zoomContainer));
        }
        
        document.querySelectorAll(`#thumbnail-container-${id} img`).forEach(thumb => {
            thumb.addEventListener('click', () => {
                mainImage.src = thumb.getAttribute('data-url');
                resetZoom(zoomContainer);
            });
        });
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal(event) {
    if (!event || event.target.id === 'modal' || event.target.tagName === 'BUTTON' || event.target.closest('button')) { 
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

document.querySelector('#modal-container .flex.justify-end button').onclick = closeModal;

// --- LÓGICA DE ZOOM Y SCROLL ---
function handleZoom(event) {
    const container = event.currentTarget;
    const img = container.querySelector('.zoom-image');
    if (!img) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left; 
    const y = event.clientY - rect.top;  
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;
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

document.addEventListener('DOMContentLoaded', () => {
    mainFooter.classList.add('translate-y-full');
    whatsappButton.classList.remove('show');
    initGallery(); 
});

// Event Listeners de Filtro
searchInput.addEventListener("input", applyFilters);
filterYear.addEventListener("change", applyFilters);
filterCategory.addEventListener("change", applyFilters);
filterSeries.addEventListener("change", applyFilters);