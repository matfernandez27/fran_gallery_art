import { db, auth, storage } from '../src/firebaseConfig.js'; 
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, startAfter, getDocs, getDoc, 
    where, writeBatch, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    ref, uploadBytes, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { 
    signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ... el resto del código queda igual

// --- Variables de Estado ---
let currentWorks = [];
let isEditMode = false;
let workToEdit = null;
let currentSearchQuery = '';
let searchDebounceTimer;

// NUEVAS variables de paginación
const PAGE_SIZE = 20;
let currentPage = 1;
let totalPages = 1;
let pageCursors = [null];
let isLoading = false;
let searchResultsMemoryAdmin = [];

// --- Selectores DOM ---
const worksList = document.getElementById('works-list');
const loginContainer = document.getElementById('login-container');
const adminHeader = document.getElementById('admin-header');
const obraFormContainer = document.getElementById('obra-form-container');
const obraForm = document.getElementById('obra-form');
const logoutButton = document.getElementById('logout-button');
const currentImagesList = document.getElementById('current-images-list');
const currentImagesContainer = document.getElementById('current-images-container');
const alertDiv = document.getElementById('alert');
const submitButton = document.getElementById('submit-button');
const searchInput = document.getElementById('search-input');
const worksContainer = document.getElementById('works-container');
const saveOrderButton = document.getElementById('save-order-button');

const paginationControlsAdmin = document.getElementById("admin-pagination-controls");
const prevButtonAdmin = document.getElementById("admin-prev-page");
const nextButtonAdmin = document.getElementById("admin-next-page");
const pageInfoAdmin = document.getElementById("admin-page-info");

function showAlert(message, type = 'success') {
    if (!alertDiv) return;
    alertDiv.textContent = message;
    alertDiv.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[1001] px-6 py-3 rounded-md shadow-lg text-sm font-medium transition-opacity duration-300 w-[90%] max-w-md ${
        type === 'error' ? 'bg-red-100 text-red-700' : 
        type === 'info' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'
    }`;
    alertDiv.classList.remove('hidden');
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

function showAdminView() {
    loginContainer?.classList.add('hidden');
    adminHeader?.classList.remove('hidden');
    worksContainer?.classList.remove('hidden');
    document.getElementById('show-add-form-button')?.classList.remove('hidden');
}

function showLoginView() {
    loginContainer?.classList.remove('hidden');
    adminHeader?.classList.add('hidden');
    worksContainer?.classList.add('hidden');
    obraFormContainer?.classList.add('hidden');
}

// --- Lógica de Negocio: Carga de Datos y Paginación ---
async function calculateTotalPages(baseQuery) {
    try {
        const snapshot = await getCountFromServer(baseQuery);
        totalPages = Math.ceil(snapshot.data().count / PAGE_SIZE) || 1;
    } catch (e) {
        console.error("Error contando documentos:", e);
        totalPages = 1;
    }
}

// --- Lógica de Negocio: Carga de Datos y Paginación ---
async function calculateTotalPages(baseQuery) {
    try {
        const snapshot = await getCountFromServer(baseQuery);
        totalPages = Math.ceil(snapshot.data().count / PAGE_SIZE) || 1;
    } catch (e) {
        console.error("Error contando documentos:", e);
        totalPages = 1;
    }
}

// --- Lógica de Negocio: Carga de Datos y Paginación ---
async function loadWorksPage(pageNumber = 1) {
    if (isLoading) return;
    isLoading = true;
    
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

                searchResultsMemoryAdmin = querySnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(obra => {
                        const tituloMatch = obra.titulo?.toLowerCase().includes(queryLower);
                        const categoriaMatch = obra.categoria?.toLowerCase().includes(queryLower);
                        const serieMatch = obra.serie?.toLowerCase().includes(queryLower);
                        return tituloMatch || categoriaMatch || serieMatch;
                    });

                totalPages = Math.ceil(searchResultsMemoryAdmin.length / PAGE_SIZE) || 1;
            }

            const startIndex = (pageNumber - 1) * PAGE_SIZE;
            const newWorks = searchResultsMemoryAdmin.slice(startIndex, startIndex + PAGE_SIZE);

            currentPage = pageNumber;
            currentWorks = newWorks; // CLAVE: Actualizamos las obras en pantalla para poder editarlas

            if (newWorks.length === 0) {
                worksList.innerHTML = '<p class="p-4 text-center text-gray-500">No se encontraron obras con esa búsqueda.</p>';
                if (paginationControlsAdmin) paginationControlsAdmin.classList.add("hidden");
            } else {
                renderWorksList(newWorks, true); 
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
                worksList.innerHTML = '<p class="p-4 text-center text-gray-500">No se encontraron obras.</p>';
                if (paginationControlsAdmin) paginationControlsAdmin.classList.add("hidden");
            } else {
                pageCursors[pageNumber] = querySnapshot.docs[querySnapshot.docs.length - 1];
                currentPage = pageNumber;
                
                const newWorks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                currentWorks = newWorks; // CLAVE: Guardamos en memoria para edición/eliminación
                
                renderWorksList(newWorks, true); 
                updatePaginationUI();
            }
        }

    } catch (error) {
        console.error("Error loading works:", error);
        showAlert("Error al cargar obras", 'error');
    } finally {
        isLoading = false;
    }
}

function updatePaginationUI() {
    if (!paginationControlsAdmin) return;
    paginationControlsAdmin.classList.remove("hidden");
    pageInfoAdmin.textContent = `Página ${currentPage} de ${totalPages}`;
    prevButtonAdmin.disabled = currentPage === 1;
    nextButtonAdmin.disabled = currentPage === totalPages;
}

function renderWorksList(works, isReplacing = false) {
    if (!worksList) return;
    if (isReplacing) worksList.innerHTML = '';

    if (works.length === 0 && isReplacing) {
        worksList.innerHTML = `<p class="p-4 text-center text-gray-500">No se encontraron obras.</p>`;
        return;
    }

    works.forEach(obra => {
        const item = document.createElement('div');
        item.id = `obra-item-${obra.id}`;
        item.dataset.id = obra.id;
        item.className = 'bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-start space-x-4 mb-4';
        
        const imageUrl = obra.imagenes?.length > 0 ? obra.imagenes[0].url : 'https://via.placeholder.com/64';

        item.innerHTML = `
            <div class="drag-handle p-2 self-center text-gray-400 cursor-move"><svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></div>
            <img src="${imageUrl}" class="w-16 h-16 object-cover rounded">
            <div class="flex-grow min-w-0">
                <h3 class="font-semibold truncate">${obra.titulo || 'Sin título'}</h3>
                <p class="text-xs text-gray-500">${obra.categoria || 'N/A'} | ${obra.anio || 'N/A'}</p>
            </div>
            <div class="flex flex-col space-y-2">
                <button onclick="editWork('${obra.id}')" class="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded">Editar</button>
                <button onclick="deleteWork('${obra.id}', this)" class="text-xs bg-red-50 text-red-600 px-3 py-1 rounded">Eliminar</button>
            </div>`;
        worksList.appendChild(item);
    });
}

async function uploadImage(file, workId) {
    const fileName = `${workId}_${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `obras/${fileName}`);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    return { path: snapshot.ref.fullPath, url: url, name: file.name };
}

async function handleSubmit(event) {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = "Procesando...";
    
    try {
        const formData = new FormData(obraForm);
        const imageFiles = formData.getAll('imagenes').filter(f => f.size > 0);
        
        const obraData = {
            titulo: formData.get('titulo'),
            descripcion: formData.get('descripcion'),
            anio: parseInt(formData.get('anio')) || null,
            categoria: formData.get('categoria'),
            serie: formData.get('serie'),
            tecnica: formData.get('tecnica'),
            medidas: formData.get('medidas'),
            price: parseFloat(formData.get('price')) || null,
            is_available: formData.get('is_available') === 'on',
            show_price: formData.get('show_price') === 'on',
            updatedAt: new Date()
        };

        let workId;
        let finalImages = [];

        if (isEditMode && workToEdit) {
            workId = workToEdit.id;
            const existingImages = JSON.parse(currentImagesList.dataset.currentImages || "[]");
            finalImages = [...existingImages];
            
            if (imageFiles.length > 0) {
                const uploads = await Promise.all(imageFiles.map(file => uploadImage(file, workId)));
                finalImages.push(...uploads);
            }
            
            await updateDoc(doc(db, "productos", workId), { ...obraData, imagenes: finalImages });
        } else {
            obraData.createdAt = new Date();
            obraData.orden = currentWorks.length; 
            const docRef = await addDoc(collection(db, "productos"), obraData);
            workId = docRef.id;

            if (imageFiles.length > 0) {
                finalImages = await Promise.all(imageFiles.map(file => uploadImage(file, workId)));
                await updateDoc(doc(db, "productos", workId), { imagenes: finalImages });
            }
        }

        showAlert(`Obra ${isEditMode ? 'actualizada' : 'creada'}.`);
        resetForm();
        showWorksList(true);
    } catch (error) {
        console.error(error);
        showAlert("Error al guardar: " + error.message, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Guardar Obra";
    }
}

window.deleteWork = async (id, button) => {
    if (!confirm("¿Eliminar obra permanentemente?")) return;
    
    try {
        const obra = currentWorks.find(w => w.id === id);
        if (obra?.imagenes) {
            for (const img of obra.imagenes) {
                try { await deleteObject(ref(storage, img.path)); } catch(e) { console.warn("Imagen no encontrada en Storage"); }
            }
        }
        await deleteDoc(doc(db, "productos", id));
        showAlert("Obra eliminada.");
        document.getElementById(`obra-item-${id}`).remove();
    } catch (error) {
        showAlert("Error al eliminar", "error");
    }
};

async function saveOrder() {
    saveOrderButton.disabled = true;
    const batch = writeBatch(db);
    const orderedItems = Array.from(worksList.children);
    
    orderedItems.forEach((card, index) => {
        const docRef = doc(db, "productos", card.dataset.id);
        batch.update(docRef, { orden: index });
    });

    try {
        await batch.commit();
        showAlert("Orden actualizado.");
    } catch (error) {
        showAlert("Error al guardar orden", "error");
    } finally {
        saveOrderButton.disabled = true;
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        showAdminView();
        loadWorksPage(1);
    } else {
        showLoginView();
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        showAlert("Credenciales inválidas", "error");
    }
}

async function handleLogout() {
    await signOut(auth);
}

function resetForm() {
    obraForm?.reset();
    isEditMode = false;
    workToEdit = null;
    document.getElementById('form-title').textContent = "Agregar Nueva Obra";
    currentImagesContainer?.classList.add('hidden');
    if(currentImagesList) currentImagesList.innerHTML = '';
}

function showWorksList(forceReload = false) {
    obraFormContainer?.classList.add('hidden');
    worksContainer?.classList.remove('hidden');
    document.getElementById('show-add-form-button')?.classList.remove('hidden');
    if (forceReload) {
        lastVisibleDoc = null;
        allDataLoaded = false;
        loadWorksPage(1);
    }
}

window.editWork = async (id) => {
    const obra = currentWorks.find(w => w.id === id);
    if (!obra) return;
    
    workToEdit = obra;
    isEditMode = true;
    document.getElementById('form-title').textContent = "Editar Obra";
    
    const fields = ['titulo', 'descripcion', 'anio', 'tecnica', 'medidas', 'categoria', 'serie', 'price'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = obra[f] || '';
    });

    if (document.getElementById('is_available')) document.getElementById('is_available').checked = obra.is_available;
    if (document.getElementById('show_price')) document.getElementById('show_price').checked = obra.show_price;

    if (obra.imagenes?.length > 0) {
            currentImagesContainer.classList.remove('hidden');
            currentImagesList.dataset.currentImages = JSON.stringify(obra.imagenes);
            
            // Agregamos un botón de rotar superpuesto a cada imagen
            currentImagesList.innerHTML = obra.imagenes.map((img, idx) => `
                <div class="relative w-24 h-24 border border-border-default rounded-sm overflow-hidden group">
                    <img src="${img.url}" class="w-full h-full object-cover">
                    
                    <button type="button" onclick="rotateImage('${obra.id}', ${idx})" 
                            class="absolute inset-0 m-auto w-8 h-8 bg-black bg-opacity-70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-blue cursor-pointer shadow-md" 
                            title="Rotar 90°">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            `).join('');
        }

    obraFormContainer.classList.remove('hidden');
    worksContainer.classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    obraForm?.addEventListener('submit', handleSubmit);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    
    document.getElementById('show-add-form-button')?.addEventListener('click', () => {
        resetForm();
        obraFormContainer.classList.remove('hidden');
        worksContainer.classList.add('hidden');
    });
    
    document.getElementById('cancel-edit-button')?.addEventListener('click', () => showWorksList(false));
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentSearchQuery = searchInput.value;
                loadWorksPage(1);
            }, 500);
        });
    }
    
    saveOrderButton?.addEventListener('click', saveOrder);

    prevButtonAdmin?.addEventListener("click", () => {
        if (currentPage > 1) loadWorksPage(currentPage - 1);
    });
    
    nextButtonAdmin?.addEventListener("click", () => {
        if (currentPage < totalPages) loadWorksPage(currentPage + 1);
    });
});

// --- Lógica para Rotar Imágenes ---
window.rotateImage = async (workId, imageIndex) => {
    const obra = currentWorks.find(w => w.id === workId);
    if (!obra || !obra.imagenes || !obra.imagenes[imageIndex]) return;

    const imgData = obra.imagenes[imageIndex];
    showAlert("Rotando imagen, por favor no cierres la ventana...", "info");

    try {
        // 1. Descargar la imagen como Blob para evitar bloqueos del Canvas
        const response = await fetch(imgData.url);
        const blob = await response.blob();

        // 2. Cargar la imagen en memoria
        const img = new Image();
        const imgLoadPromise = new Promise(resolve => {
            img.onload = resolve;
            img.src = URL.createObjectURL(blob);
        });
        await imgLoadPromise;

        // 3. Crear el lienzo (Canvas) e invertir sus dimensiones
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.height;
        canvas.height = img.width;

        // 4. Rotar 90 grados (en radianes)
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(90 * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        // 5. Convertir a un nuevo archivo WebP optimizado
        const newBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));

        // 6. Subir la nueva imagen a Firebase Storage
        const newFileName = `rotada_${Date.now()}_${imgData.name}`;
        const storageRef = ref(storage, `obras/${newFileName}`);
        const snapshot = await uploadBytes(storageRef, newBlob);
        const newUrl = await getDownloadURL(snapshot.ref);

        // 7. Borrar la imagen vieja para no ocupar espacio "basura"
        try {
            await deleteObject(ref(storage, imgData.path));
        } catch(e) { console.warn("La imagen anterior no se pudo borrar."); }

        // 8. Actualizar la base de datos y la interfaz
        obra.imagenes[imageIndex] = {
            path: snapshot.ref.fullPath,
            url: newUrl,
            name: newFileName
        };

        await updateDoc(doc(db, "productos", workId), { imagenes: obra.imagenes });
        
        showAlert("¡Imagen rotada con éxito!");
        editWork(workId); // Recargar la vista actual

    } catch (error) {
        console.error("Error al rotar:", error);
        showAlert("Error al rotar. Verifica los permisos CORS en la consola.", "error");
    }
};