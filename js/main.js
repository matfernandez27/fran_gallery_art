

// js/main.js
alert("¡El código nuevo por fin cargó!");
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    orderBy,
    limit, 
    startAfter, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Variables de Estado ---
let allWorks = [];
let lastVisible = null;
const PAGE_SIZE = 12;
let isLoading = false;
let isExhausted = false;

// --- Selectores DOM ---
const galleryContainer = document.getElementById("gallery-container");
const loadingOverlay = document.getElementById("loading-overlay");
const loadMoreTrigger = document.getElementById("load-more-trigger");

// --- Función Principal: Cargar Obras ---
async function fetchWorks(reset = false) {
    if (!db) {
        console.error("🔥 Error: La base de datos (db) no está inicializada.");
        forceHideSpinner();
        return;
    }

    if (isLoading || (isExhausted && !reset)) return;
    isLoading = true;

    if (reset) {
        lastVisible = null;
        isExhausted = false;
        if (galleryContainer) galleryContainer.innerHTML = "";
    }

    try {
        console.log("🔥 Solicitando obras a Firebase...");
        const productsRef = collection(db, "productos"); 
        let q = query(productsRef, orderBy("orden", "asc"), limit(PAGE_SIZE));

        if (lastVisible && !reset) {
            q = query(productsRef, orderBy("orden", "asc"), startAfter(lastVisible), limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(q);
        console.log(`🔥 Firebase respondió con ${querySnapshot.docs.length} documentos.`);
        
        if (querySnapshot.empty) {
            isExhausted = true;
            if (reset && galleryContainer) {
                galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras disponibles.</p>';
            }
            return;
        }

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        
        const newWorks = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderGallery(newWorks);

    } catch (error) {
        console.error("🔥 Error al cargar obras de Firestore:", error);
    } finally {
        isLoading = false;
        forceHideSpinner();
    }
}

// --- Helper: Ocultar Spinner a la fuerza (Evita conflictos CSS) ---
function forceHideSpinner() {
    if (loadingOverlay) {
        loadingOverlay.style.opacity = "0";
        setTimeout(() => {
            loadingOverlay.style.display = "none"; // Obligamos al CSS a ocultarlo
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

    modalContent.innerHTML = `
        <div class="grid md:grid-cols-2 gap-8">
            <div class="image-zoom-container bg-gray-50 rounded-sm">
                <img src="${(obra.imagenes && obra.imagenes[0]) ? obra.imagenes[0].url : ''}" class="zoom-image w-full">
            </div>
            <div>
                <h2 class="text-3xl font-display mb-2 text-text-main">${obra.titulo || 'Sin título'}</h2>
                <p class="text-accent-blue font-medium mb-6">${obra.serie || 'Serie General'} — ${obra.anio || 's/f'}</p>
                <div class="space-y-4 text-sm text-text-secondary">
                    <p><strong>Técnica:</strong> ${obra.tecnica || 'No especificada'}</p>
                    <p><strong>Medidas:</strong> ${obra.medidas || 'No especificadas'}</p>
                    <p class="text-text-main leading-relaxed mt-4">${obra.descripcion || ''}</p>
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

// --- Infinite Scroll ---
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && !isExhausted) {
        fetchWorks();
    }
}, { rootMargin: '200px' });

// --- Inicialización Infalible ---
function init() {
    // Kill-Switch: Si Firebase no responde en 8 segundos, apagamos el spinner a la fuerza.
    setTimeout(() => {
        if (isLoading) {
            console.warn("⏳ Timeout: Forzando cierre del spinner.");
            forceHideSpinner();
        }
    }, 8000);

    fetchWorks(true);
    if (loadMoreTrigger) observer.observe(loadMoreTrigger);
}

// Verifica si el documento ya cargó antes de esperar al evento
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init(); // Si el evento ya pasó, arranca directamente
}