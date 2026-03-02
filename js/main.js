// js/main.js
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    limit, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const PAGE_SIZE = 12;
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let currentSearchQuery = ""; 
let searchDebounceTimer;     
let searchResultsMemory = []; // Aquí vivirá todo el catálogo

let currentSlide = 0;
let totalSlides = 0;
let carouselInterval;

const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const paginationControls = document.getElementById("pagination-controls");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");
const searchInput = document.getElementById("search");
const carouselTrack = document.getElementById("carousel-track");

function formatPrice(price, currency) {
    if (!price) return '';
    const formattedNumber = Number(price).toLocaleString('es-AR'); 
    const symbol = currency === 'USD' ? 'U$D' : '$';
    return `${symbol} ${formattedNumber}`;
}

async function initCarousel() {
    if (!carouselTrack) return;
    try {
        const q = query(collection(db, "productos"), limit(4));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            document.getElementById("carousel-track").parentElement.classList.add("hidden");
            return;
        }

        const works = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        totalSlides = works.length;

        carouselTrack.innerHTML = works.map((obra) => {
            const img = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : './img/placeholder.jpg';
            return `
                <div class="w-full h-full flex-shrink-0 relative">
                    <img src="${img}" alt="${obra.titulo}" class="w-full h-full object-cover opacity-90 transition-all duration-1000 ease-out">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex flex-col justify-end p-8 md:p-16">
                        <h2 class="text-4xl md:text-5xl font-display text-white mb-6 leading-tight drop-shadow-md">${obra.titulo}</h2>
                        <button onclick="openModalById('${obra.id}')" class="w-max bg-white/90 text-black px-8 py-3 text-sm font-medium hover:bg-white transition-colors rounded-[3px]">
                            Ver obra
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        window.carouselWorks = works;
        document.getElementById('carousel-next')?.addEventListener('click', () => moveSlide(1));
        document.getElementById('carousel-prev')?.addEventListener('click', () => moveSlide(-1));
        startCarouselAutoPlay();
    } catch (error) {
        console.error("Error cargando el carrusel:", error);
    }
}

function moveSlide(direction) {
    currentSlide = (currentSlide + direction + totalSlides) % totalSlides;
    updateCarouselPosition();
    resetCarouselAutoPlay();
}

function updateCarouselPosition() {
    if (carouselTrack) carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
}

function startCarouselAutoPlay() {
    carouselInterval = setInterval(() => moveSlide(1), 6000); 
}

function resetCarouselAutoPlay() {
    clearInterval(carouselInterval);
    startCarouselAutoPlay();
}

window.openModalById = function(id) {
    const obra = window.carouselWorks?.find(w => w.id === id);
    if (obra) window.openModal(obra);
}

// ========================================================
// CARGA MAESTRA: 100% MEMORIA Y CERO OBRAS PERDIDAS
// ========================================================
async function loadPage(pageNumber) {
    if (!db) { hideSpinner(); return; }
    if (isLoading) return;
    isLoading = true;

    if (galleryContainer) galleryContainer.innerHTML = '<div class="col-span-full flex justify-center py-12"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>';

    try {
        // Solo vamos a la base de datos en la página 1 o si la memoria está vacía
        if (pageNumber === 1 || searchResultsMemory.length === 0) {
            const productsRef = collection(db, "productos"); 
            // Traemos TODO el catálogo sin filtros para que no quede ni una obra afuera
            const querySnapshot = await getDocs(productsRef);
            
            let allWorks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Ordenamos con JavaScript de forma segura
            allWorks.sort((a, b) => {
                const oA = typeof a.orden === 'number' ? a.orden : 99999;
                const oB = typeof b.orden === 'number' ? b.orden : 99999;
                return oA - oB;
            });

            // Si el usuario usó el buscador, filtramos aquí mismo
            if (currentSearchQuery) {
                const queryLower = currentSearchQuery.toLowerCase();
                allWorks = allWorks.filter(obra => {
                    return obra.titulo?.toLowerCase().includes(queryLower) || 
                           obra.categoria?.toLowerCase().includes(queryLower) || 
                           obra.serie?.toLowerCase().includes(queryLower);
                });
            }

            searchResultsMemory = allWorks;
            totalPages = Math.ceil(searchResultsMemory.length / PAGE_SIZE) || 1;
        }

        // Cortamos el pedacito exacto que corresponde a la página actual
        const startIndex = (pageNumber - 1) * PAGE_SIZE;
        const newWorks = searchResultsMemory.slice(startIndex, startIndex + PAGE_SIZE);
        currentPage = pageNumber;

        if (newWorks.length === 0) {
            galleryContainer.innerHTML = '<p class="text-center col-span-full py-12 text-text-secondary font-light">No se encontraron obras en el archivo.</p>';
            if (paginationControls) paginationControls.classList.add("hidden");
        } else {
            galleryContainer.innerHTML = ""; 
            renderGallery(newWorks);
            updatePaginationUI();
        }

    } catch (error) {
        console.error("Error al cargar la galería:", error);
    } finally {
        isLoading = false;
        hideSpinner();
    }
}

function updatePaginationUI() {
    if (!paginationControls) return;
    paginationControls.classList.remove("hidden");
    if (pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    if (prevButton) prevButton.disabled = currentPage === 1;
    if (nextButton) nextButton.disabled = currentPage === totalPages;
}

function hideSpinner() {
    if (loadingOverlay) {
        loadingOverlay.style.opacity = "0";
        setTimeout(() => { loadingOverlay.classList.add("hidden"); }, 300);
    }
}

function renderGallery(works) {
    if (!galleryContainer) return;
    const fragment = document.createDocumentFragment();

    works.forEach(obra => {
        const mainImg = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : './img/placeholder.jpg';
        const card = document.createElement("div");
        card.className = "group cursor-pointer flex flex-col h-full";
        card.innerHTML = `
            <div class="aspect-[4/5] overflow-hidden bg-[#f3f4f6] relative mb-4">
                <img src="${mainImg}" alt="${obra.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ease-out">
            </div>
            <div class="flex flex-col flex-grow p-1">
                <h3 class="font-display text-lg text-text-main leading-snug truncate">${obra.titulo || 'Sin título'}</h3>
                <p class="text-xs text-text-secondary tracking-widest uppercase mt-1 mb-3">${obra.categoria || 'Obra'}</p>
                <div class="flex justify-between items-center mt-auto pt-3 border-t border-gray-100">
                    <span class="text-xs tracking-wide ${obra.is_available ? 'text-whatsapp font-medium' : 'text-red-400'}">
                        ${obra.is_available ? 'Disponible' : 'Privada'}
                    </span>
                    ${obra.show_price && obra.price ? `<span class="text-text-main font-medium text-sm tracking-wide">${formatPrice(obra.price, obra.currency)}</span>` : ''}
                </div>
            </div>
        `;
        card.onclick = () => openModal(obra);
        fragment.appendChild(card);
    });
    galleryContainer.appendChild(fragment);
}

// Historial para celular
window.addEventListener('popstate', (e) => {
    const modal = document.getElementById("modal");
    if (modal && !modal.classList.contains("hidden")) {
        closeModalLogic();
    }
});

function closeModalLogic() {
    const modal = document.getElementById("modal");
    if (modal) {
        modal.classList.add("hidden");
        document.body.style.overflow = 'auto';
    }
}

window.closeModal = function(e, fromBackButton = false) {
    const modal = document.getElementById("modal");
    if (!modal) return;
    
    if (!e || e.target.id === "modal" || e.target.closest('.close-btn')) {
        closeModalLogic();
        if (!fromBackButton && window.location.hash === '#obra') {
            history.back();
        }
    }
};

window.openModal = function(obra) {
    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modal-content");
    if (!modal || !modalContent) return;

    history.pushState({ modalOpen: true }, "", "#obra");
    document.body.style.overflow = 'hidden';

    const imagenes = obra.imagenes || [];
    if (imagenes.length === 0) imagenes.push({url: './img/placeholder.jpg'});
    const defaultImg = imagenes[0].url;

    const priceSection = (obra.show_price && obra.price) 
        ? `<div class="mt-2">
             <span class="text-xl text-text-main font-medium">${formatPrice(obra.price, obra.currency)}</span>
           </div>`
        : '';

    modalContent.innerHTML = `
        <div class="flex md:hidden justify-between items-center p-4 border-b border-gray-200 bg-white sticky top-0 z-20">
            <span class="font-display font-semibold text-text-main truncate pr-4">${obra.titulo || 'Detalle'}</span>
            <button class="close-btn text-text-secondary p-1" onclick="closeModal(event)">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" pointer-events="none"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <div class="flex flex-col md:flex-row h-full overflow-hidden relative">
            <button class="hidden md:block close-btn absolute top-4 right-4 z-[60] text-gray-400 hover:text-text-main transition-colors p-2 bg-white rounded-full shadow-sm" onclick="closeModal(event)">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" pointer-events="none"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div id="zoom-container" class="w-full md:w-[65%] relative bg-[#f8fafc] flex items-center justify-center cursor-move border-b md:border-b-0 md:border-r border-border-default h-[45vh] md:h-auto group overflow-hidden">
                <div id="panzoom-wrapper" class="w-full h-full flex items-center justify-center">
                    <img src="${defaultImg}" id="zoom-image" class="max-w-full max-h-full object-contain pointer-events-none p-4 md:p-8 transition-transform duration-300 ease-out" style="transform-origin: center center;">
                </div>
                
                <div class="absolute bottom-4 right-4 md:bottom-6 md:right-6 flex gap-2 z-10 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button id="zoom-rotate" class="bg-white border border-gray-200 text-text-main p-2 rounded-sm shadow-sm hover:bg-gray-50 transition-all" title="Rotar 90°">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>
                    <button id="zoom-out" class="bg-white border border-gray-200 text-text-main p-2 rounded-sm shadow-sm hover:bg-gray-50 transition-colors" title="Alejar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                    </button>
                    <button id="zoom-in" class="bg-white border border-gray-200 text-text-main p-2 rounded-sm shadow-sm hover:bg-gray-50 transition-colors" title="Acercar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                    <button id="zoom-reset" class="bg-white border border-gray-200 text-text-main p-2 rounded-sm shadow-sm hover:bg-gray-50 ml-2 transition-colors" title="Restaurar visor">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
                    </button>
                </div>
            </div>

            <div class="w-full md:w-[35%] flex flex-col p-6 md:p-10 bg-white overflow-y-auto">
                <div class="mb-6">
                    <h2 class="text-3xl font-display text-text-main leading-tight mb-2 tracking-tight">${obra.titulo || 'Sin título'}</h2>
                    <p class="text-text-secondary text-sm font-light tracking-wide">${obra.serie || 'Serie General'} — ${obra.anio || 's/f'}</p>
                </div>
                
                <div class="space-y-2 text-sm text-text-secondary font-light">
                    <p><strong>Técnica:</strong> ${obra.tecnica || 'No especificada'}</p>
                    <p><strong>Medidas:</strong> ${obra.medidas || 'No especificadas'}</p>
                </div>
                
                ${obra.descripcion ? `<p class="mt-4 text-sm leading-relaxed whitespace-pre-line font-light text-[#334155]">${obra.descripcion}</p>` : ''}

                ${imagenes.length > 1 ? `
                <div class="mt-8 pt-6 border-t border-gray-100">
                    <p class="text-xs text-text-secondary uppercase tracking-widest mb-3 font-medium">Otras vistas</p>
                    <div id="modal-gallery-thumbnails" class="flex flex-wrap gap-2">
                        ${imagenes.map((img, index) => `
                            <div class="thumbnail-item w-14 h-14 border-2 ${index === 0 ? 'border-accent-blue' : 'border-gray-200'} rounded-sm overflow-hidden cursor-pointer hover:border-gray-300 transition-colors" data-img-url="${img.url}">
                                <img src="${img.url}" class="w-full h-full object-cover">
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="mt-8 pt-6 border-t border-gray-100">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-6 gap-2">
                        <span class="text-xs tracking-wide ${obra.is_available ? 'text-text-secondary' : 'text-red-400'}">
                            ${obra.is_available ? 'Disponible para adquisición' : 'Colección Privada'}
                        </span>
                        ${priceSection}
                    </div>

                    <a href="https://wa.me/5492805032663?text=Hola Francisco! Quería consultarte por la obra: ${obra.titulo}" 
                       target="_blank" 
                       class="block text-center border-2 border-text-main text-text-main hover:bg-text-main hover:text-white py-3 rounded-sm font-medium transition-colors text-sm tracking-wide">
                       Consultar
                    </a>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove("hidden");

    const wrapperElement = document.getElementById('panzoom-wrapper');
    const imgElement = document.getElementById('zoom-image');
    const container = document.getElementById('zoom-container');

    if (wrapperElement && imgElement && container && typeof Panzoom !== 'undefined') {
        const panzoom = Panzoom(wrapperElement, { maxScale: 5, minScale: 1, step: 0.3 });
        container.addEventListener('wheel', panzoom.zoomWithWheel);
        
        document.getElementById('zoom-in').addEventListener('click', panzoom.zoomIn);
        document.getElementById('zoom-out').addEventListener('click', panzoom.zoomOut);
        
        let currentRotation = 0;
        document.getElementById('zoom-reset').addEventListener('click', () => {
            panzoom.reset();
            currentRotation = 0;
            imgElement.style.transform = `rotate(0deg)`;
        });

        document.getElementById('zoom-rotate').addEventListener('click', () => {
            currentRotation = (currentRotation + 90) % 360;
            imgElement.style.transform = `rotate(${currentRotation}deg)`;
        });

        document.getElementById('modal-gallery-thumbnails')?.addEventListener('click', (e) => {
            const thumbnailItem = e.target.closest('.thumbnail-item');
            if (!thumbnailItem) return;

            const newUrl = thumbnailItem.dataset.imgUrl;
            imgElement.src = newUrl;

            panzoom.reset();
            currentRotation = 0;
            imgElement.style.transform = `rotate(0deg)`;

            document.querySelectorAll('#modal-gallery-thumbnails .thumbnail-item').forEach(item => {
                item.classList.remove('border-accent-blue');
                item.classList.add('border-gray-200');
            });
            thumbnailItem.classList.remove('border-gray-200');
            thumbnailItem.classList.add('border-accent-blue');
        });
    }
};

document.addEventListener("DOMContentLoaded", () => {
    initCarousel(); 
    loadPage(1);    

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentSearchQuery = searchInput.value;
                loadPage(1);
            }, 500);
        });
    }

    prevButton?.addEventListener("click", () => {
        if (currentPage > 1) {
            loadPage(currentPage - 1);
            document.getElementById("gallery-section").scrollIntoView({ behavior: 'smooth' });
        }
    });

    nextButton?.addEventListener("click", () => {
        if (currentPage < totalPages) {
            loadPage(currentPage + 1);
            document.getElementById("gallery-section").scrollIntoView({ behavior: 'smooth' });
        }
    });
});