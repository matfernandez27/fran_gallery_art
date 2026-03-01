// js/main.js
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    orderBy, 
    limit, 
    startAfter, 
    getDocs,
    getCountFromServer,
    where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Variables de Paginación y Búsqueda ---
const PAGE_SIZE = 12;
let currentPage = 1;
let totalPages = 1;
let pageCursors = [null];
let isLoading = false;
let currentSearchQuery = ""; 
let searchDebounceTimer;     
let searchResultsMemory = [];

// --- Selectores DOM ---
const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const paginationControls = document.getElementById("pagination-controls");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");
const searchInput = document.getElementById("search");

// --- Helper: Formatear Precio ---
function formatPrice(price, currency) {
    if (!price) return '';
    // toLocaleString('es-AR') pone los puntos en los miles automáticamente
    const formattedNumber = Number(price).toLocaleString('es-AR'); 
    const symbol = currency === 'USD' ? 'U$D' : '$';
    return `${symbol} ${formattedNumber}`;
}

// --- Calcular el total de páginas ---
async function calculateTotalPages(baseQuery) {
    try {
        const snapshot = await getCountFromServer(baseQuery);
        const totalDocs = snapshot.data().count;
        totalPages = Math.ceil(totalDocs / PAGE_SIZE) || 1;
    } catch (error) {
        console.error("Error al contar documentos:", error);
        totalPages = 1;
    }
}

// --- Cargar una página específica ---
async function loadPage(pageNumber) {
    if (!db) {
        console.error("Error: La base de datos no está inicializada.");
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

        // ==========================================
        // CAMINO A: LÓGICA DE BÚSQUEDA (EN MEMORIA)
        // ==========================================
        if (currentSearchQuery) {
            
            if (pageNumber === 1) {
                const qAll = query(productsRef, orderBy("orden", "asc"));
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
                if (galleryContainer) galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras con esa búsqueda.</p>';
                if (paginationControls) paginationControls.classList.add("hidden");
            } else {
                if (galleryContainer) galleryContainer.innerHTML = ""; 
                renderGallery(newWorks);
                updatePaginationUI();
            }

        } 
        // ==========================================
        // CAMINO B: LÓGICA NORMAL (FIRESTORE)
        // ==========================================
        else {
            const baseQuery = query(productsRef, orderBy("orden", "asc"));

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
                if (galleryContainer) galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras disponibles.</p>';
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
        if (galleryContainer) {
            galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-red-500">Ocurrió un error al cargar la galería.</p>';
        }
    } finally {
        isLoading = false;
        hideSpinner();
    }
}

// --- Actualizar Interfaz de Botones ---
function updatePaginationUI() {
    if (!paginationControls) return;
    
    paginationControls.classList.remove("hidden");
    if (pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    
    if (prevButton) prevButton.disabled = currentPage === 1;
    if (nextButton) nextButton.disabled = currentPage === totalPages;
}

// --- Helper: Ocultar Spinner Inicial ---
function hideSpinner() {
    if (loadingOverlay) {
        loadingOverlay.style.opacity = "0";
        setTimeout(() => {
            loadingOverlay.style.display = "none";
            loadingOverlay.classList.add("hidden");
        }, 300);
    }
}

// --- Renderizado de la Galería ---
function renderGallery(works) {
    if (!galleryContainer) return;
    const fragment = document.createDocumentFragment();

    works.forEach(obra => {
        const mainImg = (obra.imagenes && obra.imagenes.length > 0) 
                        ? obra.imagenes[0].url 
                        : './img/placeholder.jpg';

        const card = document.createElement("div");
        card.className = "bg-bg-surface border border-border-default rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 group cursor-pointer";
        card.innerHTML = `
            <div class="aspect-square overflow-hidden bg-gray-100">
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

// --- Lógica del Modal ---
window.openModal = function(obra) {
    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modal-content");
    if (!modal || !modalContent) return;

    const imgUrl = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes[0].url : '';

    const priceHTML = (obra.show_price && obra.price) 
        ? `<div class="mt-8 inline-block bg-gray-50 px-5 py-3 rounded-sm border border-border-default">
             <span class="text-xs text-text-secondary uppercase tracking-wider block mb-1">Valor de la obra</span>
             <span class="text-2xl font-bold text-text-main">${formatPrice(obra.price, obra.currency)}</span>
           </div>`
        : '';

    modalContent.innerHTML = `
        <div class="grid md:grid-cols-2 gap-8">
            <div class="image-zoom-container bg-gray-50 rounded-sm">
                <img src="${imgUrl}" class="zoom-image w-full">
            </div>
            <div>
                <div class="flex justify-between items-start mb-2 gap-4">
                    <h2 class="text-3xl font-display text-text-main leading-none">${obra.titulo || 'Sin título'}</h2>
                    <span class="px-3 py-1 text-xs font-semibold rounded-sm border ${obra.is_available ? 'bg-green-50 text-whatsapp border-green-200' : 'bg-red-50 text-red-500 border-red-200'}">
                        ${obra.is_available ? 'Disponible' : 'Vendido'}
                    </span>
                </div>
                
                <p class="text-accent-blue font-medium mb-6 mt-2">${obra.serie || 'Serie General'} — ${obra.anio || 's/f'}</p>
                
                <div class="space-y-4 text-sm text-text-secondary">
                    <p><strong>Técnica:</strong> ${obra.tecnica || 'No especificada'}</p>
                    <p><strong>Medidas:</strong> ${obra.medidas || 'No especificadas'}</p>
                    <p class="text-text-main leading-relaxed mt-4">${obra.descripcion || ''}</p>
                </div>

                ${priceHTML}

                <div class="mt-8 pt-8 border-t border-border-default">
                    <a href="https://wa.me/5492805032663?text=Hola! Me interesa la obra: ${obra.titulo}" 
                       target="_blank" 
                       class="block text-center bg-whatsapp text-white py-3 rounded-sm font-bold hover:bg-opacity-90 transition-all uppercase tracking-wider text-sm">
                       Consultar por esta obra
                    </a>
                </div>
            </div>
        </div>
    `;
    modal.classList.remove("hidden");
};

window.closeModal = function(e) {
    const modal = document.getElementById("modal");
    if (!modal) return;
    if (!e || e.target.id === "modal" || e.target.tagName === "BUTTON") {
        modal.classList.add("hidden");
    }
};

// --- Arranque y Listeners ---
document.addEventListener("DOMContentLoaded", () => {
    // Iniciamos la galería cargando la página 1
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