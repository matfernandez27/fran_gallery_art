// js/admin.js
import { db, auth, storage } from './firebase-config.js'; // Ajusta la ruta según tu proyecto
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, startAfter, getDocs, getDoc, 
    where, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    ref, uploadBytes, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { 
    signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Variables de Estado ---
let currentWorks = [];
let isEditMode = false;
let workToEdit = null;
let lastVisibleDoc = null; // Para paginación en Firebase
const PAGE_SIZE = 20;
let isLoading = false;
let allDataLoaded = false;
let currentSearchQuery = '';
let searchDebounceTimer;

// --- Selectores DOM (Se mantienen igual) ---
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

// --- Helpers de UI ---
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

// --- Lógica de Negocio: Carga de Datos ---
async function loadWorksPage(reset = false) {
    if (isLoading || (allDataLoaded && !reset)) return;
    isLoading = true;
    
    try {
        let q;
        const productsRef = collection(db, "productos");

        if (currentSearchQuery) {
            // Firebase no tiene 'ilike'. Se suele usar un filtro de rango para búsquedas simples por prefijo
            q = query(
                productsRef,
                where("titulo", ">=", currentSearchQuery),
                where("titulo", "<=", currentSearchQuery + "\uf8ff"),
                limit(PAGE_SIZE)
            );
        } else {
            if (reset) {
                q = query(productsRef, orderBy("orden", "asc"), limit(PAGE_SIZE));
            } else {
                q = query(productsRef, orderBy("orden", "asc"), startAfter(lastVisibleDoc), limit(PAGE_SIZE));
            }
        }

        const querySnapshot = await getDocs(q);
        lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        
        const newWorks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (reset) currentWorks = [];
        currentWorks.push(...newWorks);
        
        renderWorksList(newWorks, reset);
        
        if (querySnapshot.docs.length < PAGE_SIZE) allDataLoaded = true;

    } catch (error) {
        console.error("Error loading works:", error);
        showAlert("Error al cargar obras", 'error');
    } finally {
        isLoading = false;
    }
}

// --- Lógica de Imágenes (Firebase Storage) ---
async function uploadImage(file, workId) {
    const fileName = `${workId}_${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `obras/${fileName}`);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    return { path: snapshot.ref.fullPath, url: url, name: file.name };
}

// --- Guardar / Editar ---
async function handleSubmit(event) {
    event.preventDefault();
    submitButton.disabled = true;
    
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
            // Crear primero para obtener ID si es necesario, o usar addDoc
            obraData.createdAt = new Date();
            obraData.orden = currentWorks.length; // Orden básico al final
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
    }
}

// --- Eliminar ---
window.deleteWork = async (id, button) => {
    if (!confirm("¿Eliminar obra?")) return;
    
    try {
        const obra = currentWorks.find(w => w.id === id);
        // 1. Borrar imágenes de Storage
        if (obra?.imagenes) {
            for (const img of obra.imagenes) {
                try { await deleteObject(ref(storage, img.path)); } catch(e) { console.warn("Imagen no encontrada en Storage"); }
            }
        }
        // 2. Borrar documento
        await deleteDoc(doc(db, "productos", id));
        showAlert("Obra eliminada.");
        document.getElementById(`obra-item-${id}`).remove();
    } catch (error) {
        showAlert("Error al eliminar", "error");
    }
};

// --- Reordenamiento (Batch Update) ---
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

// --- Auth State ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        showAdminView();
        loadWorksPage(true);
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
        showAlert("Login fallido", "error");
    }
}

async function handleLogout() {
    await signOut(auth);
}

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    obraForm.addEventListener('submit', handleSubmit);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentSearchQuery = searchInput.value;
                allDataLoaded = false;
                loadWorksPage(true);
            }, 500);
        });
    }
    // ... resto de event listeners de UI (showAddForm, etc)
});