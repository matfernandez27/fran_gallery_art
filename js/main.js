// js/main.js
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    limit, 
    startAfter, 
    getDocs,
    getCountFromServer,
    where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Variables Generales ---
const PAGE_SIZE = 12;
let currentPage = 1;
let totalPages = 1;
let pageCursors = [null];
let isLoading = false;
let currentSearchQuery = ""; 
let searchDebounceTimer;     
let searchResultsMemory = [];

// --- Variables del Carrusel ---
let currentSlide = 0;
let totalSlides = 0;
let carouselInterval;

// --- Selectores DOM ---
const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const paginationControls = document.getElementById("pagination-controls");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");
const searchInput = document.getElementById("search");
const carouselTrack = document.getElementById("carousel-track");

// --- Helper: Formatear Precio ---
function formatPrice(price, currency) {
    if (!price) return '';
    const formattedNumber = Number(price).toLocaleString('es-AR'); 
    const symbol = currency === 'USD' ? 'U$D' : '$';
    return `${symbol} ${formattedNumber}`;
}

// --- Lógica del Carrusel Dinámico ---
async function initCarousel() {
    if (!carouselTrack) return;
    
    try {
        // Traemos las primeras 4 obras para destacar en el carrusel
        const q = query(collection(db, "productos"), limit(4));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            document.getElementById("carousel-track").parentElement.classList.add("hidden");
            return;
        }

        const works = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        totalSlides = works.length;

        carouselTrack.innerHTML = works.map((obra, index) => {
            const img = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : './img/placeholder.jpg';
            return `
                <div class="w-full h-full flex-shrink-0 relative">
                    <img src="${img}" alt="${obra.titulo}" class="w-full h-full object-cover opacity-80">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-8 md:p-16">
                        <span class="text-accent-blue font-bold tracking-widest uppercase text-xs mb-2">Obra Destacada</span>
                        <h2 class="text-4xl md:text-5xl font-display text-white mb-4 leading-tight">${obra.titulo}</h2>
                        <button onclick="openModalById('${obra.id}')" class="w-max bg-white text-black px-6 py-3 text-sm font-medium tracking-wide hover:bg-accent-blue hover:text-white transition-colors">
                            VER DETALLES
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Hacer globales las obras del carrusel para que el botón funcione
        window.carouselWorks = works;

        // Controles y Auto-play
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
    if (carouselTrack) {
        carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
    }
}

function startCarouselAutoPlay() {
    carouselInterval = setInterval(() => moveSlide(1), 5000); // Rota cada 5 segundos
}

function resetCarouselAutoPlay() {
    clearInterval(carouselInterval);
    startCarouselAutoPlay();
}

window.openModalById = function(id) {
    const obra = window.carouselWorks?.find(w => w.id === id);
    if (obra) window.openModal(obra);
}

// --- Calcular el total de páginas ---
async function calculateTotalPages(baseQuery) {
    try {
        const snapshot = await getCountFromServer(baseQuery);
        const totalDocs = snapshot.data().count;
        totalPages = Math.ceil(totalDocs / PAGE_SIZE) || 1;
    } catch (error) {
        console.error("Error al contar:", error);
        totalPages = 1;
    }
}

// --- Cargar Galería ---
async function loadPage(pageNumber) {
    if (!db) {
        hideSpinner();
        return;
    }

    if (isLoading) return;
    isLoading = true;

    if (galleryContainer) {
        galleryContainer.innerHTML = '<div class="col-span-full flex justify-center py-12"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>';
    }

    try {
        const productsRef = collection(db, "productos"); 

        if (currentSearchQuery) {
            if (pageNumber === 1) {
                const qAll = query(productsRef);
                const querySnapshot = await getDocs(qAll);
                const queryLower = currentSearchQuery.toLowerCase();

                searchResultsMemory = querySnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(obra => {
                        const tituloMatch = obra.titulo?.toLowerCase().includes(queryLower);
                        const categoriaMatch = obra.categoria?.toLowerCase().includes(queryLower);
                        const serieMatch = obra.serie?.toLowerCase().includes(queryLower);
                        return tituloMatch || categoriaMatch || serieMatch; 
                    });

                totalPages = Math.ceil(searchResultsMemory.length / PAGE_SIZE) || 1;
            }

            const startIndex = (pageNumber - 1) * PAGE_SIZE;
            const newWorks = searchResultsMemory.slice(startIndex, startIndex + PAGE_SIZE);
            
            currentPage = pageNumber;

            if (newWorks.length === 0) {
                if (galleryContainer) galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras.</p>';
                if (paginationControls) paginationControls.classList.add("hidden");
            } else {
                if (galleryContainer) galleryContainer.innerHTML = ""; 
                renderGallery(newWorks);
                updatePaginationUI();
            }

        } else {
            const baseQuery = query(productsRef);

            if (pageNumber === 1) {
                await calculateTotalPages(baseQuery);
                pageCursors = [null];
            }

            let q;
            if (pageNumber === 1) {
                q = query(baseQuery, limit(PAGE_SIZE));
            } else {
                const cursor = pageCursors[pageNumber - 1];
                q = query(baseQuery, startAfter(cursor), limit(PAGE_SIZE));
            }

            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                if (galleryContainer) galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No hay obras disponibles.</p>';
                if (paginationControls) paginationControls.classList.add("hidden");
            } else {
                pageCursors[pageNumber] = querySnapshot.docs[querySnapshot.docs.length - 1];
                currentPage = pageNumber;
                
                const newWorks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (galleryContainer) galleryContainer.innerHTML = ""; 
                renderGallery(newWorks);
                updatePaginationUI();
            }
        }
    } catch (error) {
        console.error("Error al cargar la página:", error);
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
        setTimeout(() => {
            loadingOverlay.style.display = "none";
            loadingOverlay.classList.add("hidden");
        }, 300);
    }
}

// --- Renderizado de la Grilla ---
function renderGallery(works) {
    if (!galleryContainer) return;
    const fragment = document.createDocumentFragment();

    works.forEach(obra => {
        const mainImg = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : './img/placeholder.jpg';

        const card = document.createElement("div");
        card.className = "bg-bg-surface border border-border-default rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 group cursor-pointer";
        card.innerHTML = `
            <div class="aspect-square overflow-hidden bg-gray-100 relative">
                <img src="${mainImg}" alt="${obra.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="p-4">
                <h3 class="font-display text-xl text-text-main truncate">${obra.titulo || 'Sin título'}</h3>
                <p class="text-xs text-text-secondary uppercase tracking-widest mt-1">${obra.categoria || 'Obra'}</p>
                <div class="flex justify-between items-center mt-4">
                    <span class="text-sm font-semibold ${obra.is_available ? 'text-whatsapp' : 'text-red-400'}">
                        ${obra.is_available ? 'Disponible' : 'Vendido'}
                    </span>
                    ${obra.show_price && obra.price ? `<span class="text-text-main font-bold tracking-wide">${formatPrice(obra.price, obra.currency)}</span>` : ''}
                </div>
            </div>
        `;
        card.onclick = () => openModal(obra);
        fragment.appendChild(card);
    });

    galleryContainer.appendChild(fragment);
}

// --- Modal con Panzoom ---
window.openModal = function(obra) {
    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modal-content");
    if (!modal || !modalContent) return;

    const imgUrl = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : '';

    const priceHTML = (obra.show_price && obra.price) 
        ? `<div class="mt-6 md:mt-8 inline-block bg-gray-50 px-4 py-3 md:px-5 md:py-3 rounded-sm border border-border-default w-full md:w-auto text-center md:text-left">
             <span class="text-xs text-text-secondary uppercase tracking-wider block mb-1">Valor de la obra</span>
             <span class="text-2xl font-bold text-text-main">${formatPrice(obra.price, obra.currency)}</span>
           </div>`
        : '';

    modalContent.innerHTML = `
        <div class="grid md:grid-cols-2 gap-4 md:gap-8 h-full max-h-[85vh] md:max-h-[90vh] overflow-y-auto overflow-x-hidden p-2 md:p-1">
            <div id="zoom-container" class="relative bg-gray-100 rounded-sm overflow-hidden flex items-center justify-center cursor-move min-h-[300px] sm:min-h-[400px] md:min-h-[600px] border border-border-default group">
                <img src="${imgUrl}" id="zoom-image" class="max-w-full max-h-full object-contain shadow-sm">
                
                <div class="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col gap-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                    <button id="zoom-in" class="bg-white/90 text-text-main p-3 md:p-2 rounded-sm shadow hover:bg-white hover:text-accent-blue transition-colors" title="Acercar">
                        <svg class="w-6 h-6 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                    <button id="zoom-out" class="bg-white/90 text-text-main p-3 md:p-2 rounded-sm shadow hover:bg-white hover:text-accent-blue transition-colors" title="Alejar">
                        <svg class="w-6 h-6 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                    </button>
                    <button id="zoom-reset" class="bg-white/90 text-text-main p-3 md:p-2 rounded-sm shadow hover:bg-white hover:text-accent-blue transition-colors mt-2" title="Restaurar vista">
                        <svg class="w-6 h-6 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>
                </div>
            </div>

            <div class="flex flex-col h-full py-2 md:py-4">
                <div class="flex justify-between items-start mb-2 gap-4">
                    <h2 class="text-2xl md:text-3xl font-display text-text-main leading-tight md:leading-none">${obra.titulo || 'Sin título'}</h2>
                    <span class="px-3 py-1 text-xs font-semibold rounded-sm border whitespace-nowrap ${obra.is_available ? 'bg-green-50 text-whatsapp border-green-200' : 'bg-red-50 text-red-500 border-red-200'}">
                        ${obra.is_available ? 'Disponible' : 'Vendido'}
                    </span>
                </div>
                
                <p class="text-accent-blue font-medium mb-4 md:mb-6 mt-1 md:mt-2 text-sm md:text-base">${obra.serie || 'Serie General'} — ${obra.anio || 's/f'}</p>
                
                <div class="space-y-3 md:space-y-4 text-sm text-text-secondary flex-grow">
                    <p><strong>Técnica:</strong> ${obra.tecnica || 'No especificada'}</p>
                    <p><strong>Medidas:</strong> ${obra.medidas || 'No especificadas'}</p>
                    <p class="text-text-main leading-relaxed mt-4 whitespace-pre-line">${obra.descripcion || ''}</p>
                </div>

                ${priceHTML}

                <div class="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-border-default pb-4 md:pb-0">
                    <a href="https://wa.me/5492805032663?text=Hola! Me interesa la obra: ${obra.titulo}" 
                       target="_blank" 
                       class="block text-center bg-whatsapp text-white py-3 md:py-4 rounded-sm font-bold hover:bg-opacity-90 transition-all uppercase tracking-wider text-sm shadow-md">
                       Consultar por esta obra
                    </a>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove("hidden");

    const imgElement = document.getElementById('zoom-image');
    const container = document.getElementById('zoom-container');

    if (imgElement && container && typeof Panzoom !== 'undefined') {
        const panzoom = Panzoom(imgElement, { maxScale: 5, minScale: 1, step: 0.3, contain: 'outside' });
        container.addEventListener('wheel', panzoom.zoomWithWheel);
        document.getElementById('zoom-in').addEventListener('click', panzoom.zoomIn);
        document.getElementById('zoom-out').addEventListener('click', panzoom.zoomOut);
        document.getElementById('zoom-reset').addEventListener('click', panzoom.reset);
    }
};

window.closeModal = function(e) {
    const modal = document.getElementById("modal");
    if (!modal) return;
    if (!e || e.target.id === "modal" || e.target.tagName === "BUTTON") {
        modal.classList.add("hidden");
    }
};

// --- Inicialización ---
document.addEventListener("DOMContentLoaded", () => {
    initCarousel(); // Cargamos el carrusel primero
    loadPage(1);    // Luego la grilla paginada

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