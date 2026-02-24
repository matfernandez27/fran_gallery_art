// js/main.js
import { db } from "../src/firebaseConfig.js";
import { 
    collection, 
    query, 
    orderBy, // Lo dejamos importado para cuando lo volvamos a activar
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
        console.error("Error: La instancia de la base de datos (db) no está definida.");
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
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
        const productsRef = collection(db, "productos"); 
        
        // 🔥 PRUEBA DE DEBUGGING: Quitamos el orderBy("orden", "asc")
        let q = query(productsRef, limit(PAGE_SIZE));

        if (lastVisible && !reset) {
            // 🔥 PRUEBA DE DEBUGGING: Quitamos el orderBy aquí también
            q = query(productsRef, startAfter(lastVisible), limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(q);
        
        // 🔥 PRUEBA DE DEBUGGING: Vemos qué responde Firebase
        console.log("Firebase respondió. Documentos encontrados:", querySnapshot.docs.length);
        
        if (querySnapshot.empty) {
            isExhausted = true;
            if (reset && galleryContainer) {
                galleryContainer.innerHTML = '<p class="text-center col-span-full py-10 text-text-secondary">No se encontraron obras en la base de datos.</p>';
            }
            return;
        }

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        
        const newWorks = querySnapshot.docs.map(doc => {
            // 🔥 PRUEBA DE DEBUGGING: Vemos el contenido exacto de cada obra
            console.log("Datos de la obra:", doc.data());
            return {
                id: doc.id,
                ...doc.data()
            };
        });

        renderGallery(newWorks);

    } catch (error) {
        console.error("Error crítico al cargar obras de Firestore:", error);
    } finally {
        isLoading = false;
        if (loadingOverlay) {
            loadingOverlay.style.opacity = "0";
            setTimeout(() => loadingOverlay.classList.add("hidden"), 300);
        }
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

// --- Infinite Scroll ---
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && !isExhausted) {
        fetchWorks();
    }
}, { rootMargin: '200px' });

// --- Inicialización ---
document.addEventListener("DOMContentLoaded", () => {
    fetchWorks(true);
    if (loadMoreTrigger) observer.observe(loadMoreTrigger);
});