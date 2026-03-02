// js/main.js
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    limit, 
    startAfter, 
    getDocs,
    getCountFromServer 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const PAGE_SIZE = 12;
let currentPage = 1;
let totalPages = 1;
let pageCursors = [null];
let isLoading = false;
let currentSearchQuery = ""; 
let searchDebounceTimer;     
let searchResultsMemory = [];

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
                    <img src="${img}" alt="${obra.titulo}" class="w-full h-full object-cover opacity-90">
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

async function calculateTotalPages(baseQuery) {
    try {
        const snapshot = await getCountFromServer(baseQuery);
        totalPages = Math.ceil(snapshot.data().count / PAGE_SIZE) || 1;
    } catch (error) {
        totalPages = 1;
    }
}

async function loadPage(pageNumber) {
    if (!db) { hideSpinner(); return; }
    if (isLoading) return;
    isLoading = true;

    if (galleryContainer) galleryContainer.innerHTML = '<div class="col-span-full flex justify-center py-12"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>';

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
                        return obra.titulo?.toLowerCase().includes(queryLower) || 
                               obra.categoria?.toLowerCase().includes(queryLower) || 
                               obra.serie?.toLowerCase().includes(queryLower);
                    });

                totalPages = Math.ceil(searchResultsMemory.length / PAGE_SIZE) || 1;
            }

            const startIndex = (pageNumber - 1) * PAGE_SIZE;
            const newWorks = searchResultsMemory.slice(startIndex, startIndex + PAGE_SIZE);
            currentPage = pageNumber;

            if (newWorks.length === 0) {
                galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras.</p>';
                if (paginationControls) paginationControls.classList.add("hidden");
            } else {
                galleryContainer.innerHTML = ""; 
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
                galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No hay obras disponibles.</p>';
                if (paginationControls) paginationControls.classList.add("hidden");
            } else {
                pageCursors[pageNumber] = querySnapshot.docs[querySnapshot.docs.length - 1];
                currentPage = pageNumber;
                
                const newWorks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                galleryContainer.innerHTML = ""; 
                renderGallery(newWorks);
                updatePaginationUI();
            }
        }
    } catch (error) {
        console.error(error);
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
                <img src="${mainImg}" alt="${obra.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out">
            </div>
            <div class="flex flex-col flex-grow">
                <h3 class="font-display text-lg text-text-main truncate">${obra.titulo || 'Sin título'}</h3>
                <p class="text-xs text-text-secondary tracking-widest uppercase mt-1 mb-3">${obra.categoria || 'Obra'}</p>
                <div class="flex justify-between items-center mt-auto">
                    <span class="text-sm ${obra.is_available ? 'text-text-secondary' : 'text-red-400'}">
                        ${obra.is_available ? 'Disponible' : 'Vendido'}
                    </span>
                    ${obra.show_price && obra.price ? `<span class="text-text-main font-medium">${formatPrice(obra.price, obra.currency)}</span>` : ''}
                </div>
            </div>
        `;
        card.onclick = () => openModal(obra);
        fragment.appendChild(card);
    });
    galleryContainer.appendChild(fragment);
}

window.openModal = function(obra) {
    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modal-content");
    if (!modal || !modalContent) return;

    document.body.style.overflow = 'hidden';

    const imgUrl = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : '';

    const priceSection = (obra.show_price && obra.price) 
        ? `<div class="mt-4">
             <span class="text-xl text-text-main font-medium">${formatPrice(obra.price, obra.currency)}</span>
           </div>`
        : '';

    modalContent.innerHTML = `
        <div class="flex flex-col md:flex-row h-full">
            
            <div id="zoom-container" class="w-full md:w-[65%] relative bg-white flex items-center justify-center cursor-move border-b md:border-b-0 md:border-r border-border-default min-h-[40vh] md:min-h-0 group overflow-hidden">
                <img src="${imgUrl}" id="zoom-image" class="max-w-full max-h-full object-contain pointer-events-none p-4 md:p-8" style="transform-origin: center center;">
                
                <div class="absolute bottom-6 right-6 flex gap-2 z-10 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button id="zoom-out" class="bg-white/90 border border-gray-200 text-text-main p-2 rounded-sm hover:bg-gray-50 transition-colors" title="Alejar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                    </button>
                    <button id="zoom-in" class="bg-white/90 border border-gray-200 text-text-main p-2 rounded-sm hover:bg-gray-50 transition-colors" title="Acercar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                    <button id="zoom-reset" class="bg-white/90 border border-gray-200 text-text-main p-2 rounded-sm hover:bg-gray-50 transition-colors ml-2" title="Restaurar vista">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>
                </div>
            </div>

            <div class="w-full md:w-[35%] flex flex-col p-6 md:p-10 bg-white">
                <div class="mb-8">
                    <h2 class="text-3xl font-display text-text-main leading-tight mb-2">${obra.titulo || 'Sin título'}</h2>
                    <p class="text-text-secondary text-sm tracking-wide">${obra.serie || 'Serie General'} — ${obra.anio || 's/f'}</p>
                </div>
                
                <div class="space-y-3 text-sm text-text-secondary flex-grow font-light">
                    <p><strong>Técnica:</strong> ${obra.tecnica || 'No especificada'}</p>
                    <p><strong>Medidas:</strong> ${obra.medidas || 'No especificadas'}</p>
                    ${obra.descripcion ? `<p class="mt-6 leading-relaxed whitespace-pre-line">${obra.descripcion}</p>` : ''}
                </div>

                <div class="mt-8 pt-8 border-t border-gray-100">
                    <div class="flex justify-between items-end mb-6">
                        <span class="text-sm ${obra.is_available ? 'text-text-main font-medium' : 'text-red-400'}">
                            ${obra.is_available ? 'Obra Disponible' : 'Colección Privada (Vendido)'}
                        </span>
                        ${priceSection}
                    </div>

                    <a href="https://wa.me/5492805032663?text=Hola Francisco! Quería consultarte por la obra: ${obra.titulo}" 
                       target="_blank" 
                       class="block text-center border border-text-main text-text-main hover:bg-text-main hover:text-white py-3 rounded-[3px] font-medium transition-colors text-sm">
                       Consultar
                    </a>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove("hidden");

    const imgElement = document.getElementById('zoom-image');
    const container = document.getElementById('zoom-container');

    if (imgElement && container && typeof Panzoom !== 'undefined') {
        const panzoom = Panzoom(imgElement, { maxScale: 5, minScale: 1, step: 0.3 });
        container.addEventListener('wheel', panzoom.zoomWithWheel);
        document.getElementById('zoom-in').addEventListener('click', panzoom.zoomIn);
        document.getElementById('zoom-out').addEventListener('click', panzoom.zoomOut);
        document.getElementById('zoom-reset').addEventListener('click', panzoom.reset);
    }
};

window.closeModal = function(e) {
    const modal = document.getElementById("modal");
    if (!modal) return;
    if (!e || e.target.id === "modal" || e.target.closest('button[onclick="closeModal(event)"]')) {
        modal.classList.add("hidden");
        document.body.style.overflow = 'auto';
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