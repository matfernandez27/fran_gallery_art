// js/main.js
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    orderBy, 
    limit, 
    startAfter, 
    getDocs,
    getCountFromServer 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Variables de Paginación ---
const PAGE_SIZE = 12;
let currentPage = 1;
let totalPages = 1;
let pageCursors = [null]; // Guarda el último documento de cada página (Índice 0 = null para la pág 1)
let isLoading = false;

// --- Selectores DOM ---
const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const paginationControls = document.getElementById("pagination-controls");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");

// --- Inicialización de la Galería ---
async function initGallery() {
    if (!db) {
        console.error("Error: La base de datos no está inicializada. Revisa firebaseConfig.js");
        hideSpinner();
        return;
    }
    
    await calculateTotalPages();
    await loadPage(1);
}

// --- Calcular el total de páginas ---
async function calculateTotalPages() {
    try {
        const coll = collection(db, "productos");
        const snapshot = await getCountFromServer(coll);
        const totalDocs = snapshot.data().count;
        totalPages = Math.ceil(totalDocs / PAGE_SIZE) || 1;
    } catch (error) {
        console.error("Error al contar documentos:", error);
        totalPages = 1;
    }
}

// --- Cargar una página específica ---
async function loadPage(pageNumber) {
    if (isLoading) return;
    isLoading = true;

    // Mostrar un pequeño spinner en la grilla mientras carga la nueva página
    if (galleryContainer) {
        galleryContainer.innerHTML = '<div class="col-span-full flex justify-center py-12"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>';
    }

    try {
        const productsRef = collection(db, "productos"); 
        let q;

        // Si es la página 1, consultamos desde el principio
        if (pageNumber === 1) {
            q = query(productsRef, orderBy("orden", "asc"), limit(PAGE_SIZE));
        } else {
            // Buscamos el cursor de la página anterior
            const cursor = pageCursors[pageNumber - 1];
            q = query(productsRef, orderBy("orden", "asc"), startAfter(cursor), limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            if (galleryContainer) {
                galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras disponibles.</p>';
            }
            paginationControls?.classList.add("hidden");
            return;
        }

        // Guardamos el último documento de esta consulta para poder avanzar a la siguiente página
        pageCursors[pageNumber] = querySnapshot.docs[querySnapshot.docs.length - 1];
        currentPage = pageNumber;
        
        const newWorks = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (galleryContainer) galleryContainer.innerHTML = ""; // Limpiamos el spinner
        renderGallery(newWorks);
        updatePaginationUI();

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
    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    
    // Habilitar/Deshabilitar botones en los extremos
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;
}

// --- Listeners de Paginación ---
prevButton?.addEventListener("click", () => {
    if (currentPage > 1) {
        loadPage(currentPage - 1);
        // Scrollear suavemente hacia el inicio de la galería
        document.getElementById("gallery-section").scrollIntoView({ behavior: 'smooth' });
    }
});

nextButton?.addEventListener("click", () => {
    if (currentPage < totalPages) {
        loadPage(currentPage + 1);
        document.getElementById("gallery-section").scrollIntoView({ behavior: 'smooth' });
    }
});

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
                    ${obra.show_price && obra.price ? `<span class="text-text-main font-bold">$${obra.price}</span>` : ''}
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

    modalContent.innerHTML = `
        <div class="grid md:grid-cols-2 gap-8">
            <div class="image-zoom-container bg-gray-50 rounded-sm">
                <img src="${imgUrl}" class="zoom-image w-full">
            </div>
            <div>
                <h2 class="text-3xl font-display mb-2 text-text-main">${obra.titulo || 'Sin título'}</h2>
                <p class="text-accent-blue font-medium mb-6">${obra.serie || 'Serie General'} — ${obra.anio || 's/f'}</p>
                <div class="space-y-4 text-sm text-text-secondary">
                    <p><strong>Técnica:</strong> ${obra.tecnica || 'No especificada'}</p>
                    <p><strong>Medidas:</strong> ${obra.medidas || 'No especificadas'}</p>
                    <p class="text-text-main leading-relaxed mt-4">${obra.descripcion || ''}</p>
                </div>
                <div class="mt-8 pt-8 border-t border-border-default">
                    <a href="https://wa.me/5492805032663?text=Hola! Me interesa la obra: ${obra.titulo}" 
                       target="_blank" 
                       class="block text-center bg-whatsapp text-white py-3 rounded-sm font-bold hover:bg-opacity-90 transition-all">
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

// --- Arranque ---
document.addEventListener("DOMContentLoaded", () => {
    initGallery();
});