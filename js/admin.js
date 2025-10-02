// js/admin.js

const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(window.supabaseUrl, window.supabaseAnonKey);

let currentWorks = [];
let isEditMode = false;
let workToEdit = null;

const worksList = document.getElementById('works-list');
const loginContainer = document.getElementById('login-container');
const adminHeader = document.getElementById('admin-header');
const obraFormContainer = document.getElementById('obra-form-container');
const obraForm = document.getElementById('obra-form');
const logoutButton = document.getElementById('logout-button');
const saveOrderButton = document.getElementById('save-order-button');
const currentImagesList = document.getElementById('current-images-list');
const currentImagesContainer = document.getElementById('current-images-container');
const alertDiv = document.getElementById('alert');
const submitButton = document.getElementById('submit-button');


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-indigo-100', 'text-indigo-700');
    
    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    } else {
         alertDiv.classList.add('bg-indigo-100', 'text-indigo-700');
    }
    
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

function getPublicUrl(path) {
    const { data } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);
    return data.publicUrl;
}
window.getPublicUrl = getPublicUrl;


// --- LÓGICA DE AUTENTICACIÓN ---
async function checkAuth() {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        adminHeader.classList.remove('hidden');
        loginContainer.classList.add('hidden');
        loadWorks();
    } else {
        adminHeader.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
        showAlert(`Error de login: ${error.message}`, 'error');
    } else {
        showAlert('Inicio de sesión exitoso.', 'success');
        checkAuth();
    }
});

logoutButton.addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
        showAlert('Error al cerrar sesión.', 'error');
    } else {
        showAlert('Sesión cerrada correctamente.', 'success');
        checkAuth();
    }
});


// --- LÓGICA DE CARGA Y RENDERIZADO DE OBRAS ---
async function loadWorks() {
    worksList.innerHTML = '<p class="text-gray-500">Cargando obras...</p>';
    try {
        const { data, error } = await client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true })
            .order('anio', { ascending: false });

        if (error) throw error;
        
        currentWorks = data.map(p => ({
            ...p,
            imagenes: Array.isArray(p.imagenes) ? p.imagenes : [] 
        }));
        
        renderWorksList(currentWorks);
        enableSorting();

    } catch (error) {
        console.error("Error al cargar obras:", error);
        worksList.innerHTML = '<p class="text-red-500">Error al cargar el listado de obras.</p>';
    }
}

function renderWorksList(works) {
    worksList.innerHTML = '';
    works.forEach(obra => {
        const mainImage = obra.imagenes[0] ? getPublicUrl(obra.imagenes[0].path) : 'https://placehold.co/60x60?text=NO+IMG';

        const item = document.createElement('div');
        item.id = `obra-item-${obra.id}`;
        item.dataset.id = obra.id;
        item.className = 'bg-gray-50 border border-gray-200 p-4 rounded-lg flex items-center justify-between shadow-sm hover:shadow-md transition duration-300';
        
        item.innerHTML = `
            <div class="flex items-center space-x-4">
                <span class="drag-handle text-gray-400 hover:text-indigo-600 mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </span>
                <img src="${mainImage}" alt="${obra.titulo}" class="w-16 h-16 object-cover rounded-md border border-gray-300" onerror="this.onerror=null;this.src='https://placehold.co/60x60?text=FALLO'">
                <div>
                    <p class="text-lg font-semibold text-gray-800">${obra.titulo}</p>
                    <p class="text-sm text-gray-500">${obra.tecnica} | ${obra.anio}</p>
                    <p class="text-xs text-gray-400">Orden: ${obra.orden || 'N/A'}</p>
                </div>
            </div>
            <div class="space-x-2">
                <button onclick="editObra(${obra.id})" class="px-3 py-1 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition duration-300">
                    Editar
                </button>
                <button onclick="deleteObra(${obra.id}, this)" class="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition duration-300">
                    Eliminar
                </button>
            </div>
        `;
        worksList.appendChild(item);
    });
}

// --- LÓGICA DE ORDENAMIENTO (SortableJS) ---
function enableSorting() {
    new Sortable(worksList, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            if (evt.oldIndex !== evt.newIndex) {
                saveOrderButton.classList.remove('hidden');
                saveOrderButton.disabled = false;
                saveOrderButton.textContent = "Guardar Orden (Cambios Pendientes)";
                saveOrderButton.classList.remove('bg-red-500');
                saveOrderButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            }
        },
    });
}

saveOrderButton.addEventListener('click', async () => {
    saveOrderButton.disabled = true;
    saveOrderButton.textContent = "Guardando...";

    try {
        const cardElements = worksList.querySelectorAll('[data-id]');
        const newOrder = Array.from(cardElements).map((card, index) => ({
            id: parseInt(card.dataset.id),
            orden: index + 1
        }));

        const updatePromises = newOrder.map(item =>
            client.from('productos').update({ orden: item.orden }).eq('id', item.id)
        );
        
        const results = await Promise.all(updatePromises);
        
        const failed = results.some(r => r.error);
        if (failed) throw new Error('Falló la actualización de una o más posiciones.');

        showAlert("Orden actualizado exitosamente!", 'success');
        saveOrderButton.classList.add('hidden');
        
        await loadWorks();

    } catch (error) {
        console.error("Error al guardar el orden:", error);
        showAlert("Error al guardar el orden. Intente nuevamente.", 'error');
    } finally {
        saveOrderButton.textContent = "Guardar Orden";
        saveOrderButton.disabled = false;
    }
});


// --- LÓGICA DEL FORMULARIO (CRUD) ---
function resetForm() {
    obraForm.reset();
    document.getElementById('form-id').value = '';
    document.getElementById('form-title').textContent = 'Nueva Obra';
    currentImagesContainer.classList.add('hidden');
    currentImagesList.innerHTML = '';
    submitButton.textContent = 'Guardar Obra';
    obraFormContainer.classList.add('hidden');
    workToEdit = null;
    isEditMode = false;
}
window.resetForm = resetForm;

function openForm(id = null) {
    resetForm(); 
    obraFormContainer.classList.remove('hidden');
    
    if (id) {
        workToEdit = currentWorks.find(w => w.id === id);
        if (!workToEdit) return;

        isEditMode = true;
        
        document.getElementById('form-title').textContent = 'Editar Obra';
        document.getElementById('form-id').value = workToEdit.id;
        document.getElementById('form-titulo').value = workToEdit.titulo || '';
        document.getElementById('form-anio').value = workToEdit.anio || '';
        document.getElementById('form-tecnica').value = workToEdit.tecnica || '';
        document.getElementById('form-medidas').value = workToEdit.medidas || '';
        document.getElementById('form-categoria').value = workToEdit.categoria || 'grabado';
        document.getElementById('form-serie').value = workToEdit.serie || '';
        document.getElementById('form-descripcion').value = workToEdit.descripcion || '';
        submitButton.textContent = 'Actualizar Obra';
        
        renderCurrentImages(workToEdit.imagenes);
    }
    
    obraFormContainer.scrollIntoView({ behavior: 'smooth' });
}
window.openForm = openForm;
window.editObra = openForm; 

function renderCurrentImages(images) {
    currentImagesList.innerHTML = '';
    if (images.length === 0) {
        currentImagesContainer.classList.add('hidden');
        return;
    }

    currentImagesContainer.classList.remove('hidden');
    images.forEach(img => {
        const imgElement = document.createElement('div');
        imgElement.className = 'relative group cursor-pointer';
        imgElement.innerHTML = `
            <img src="${getPublicUrl(img.path)}" data-path="${img.path}" class="w-20 h-20 object-cover rounded-md border-2 border-gray-300 group-hover:border-red-500 transition-colors">
            <span class="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" title="Click para eliminar">
                &times;
            </span>
        `;
        imgElement.addEventListener('click', () => deleteImageFromWork(workToEdit.id, img.path, imgElement));
        currentImagesList.appendChild(imgElement);
    });
}

// --- LÓGICA DE SUBIDA/ACTUALIZACIÓN ---
obraForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-id').value;
    const files = document.getElementById('image-files').files;

    if (!isEditMode && files.length === 0) {
        showAlert("Debe subir al menos una imagen para una nueva obra.", 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = id ? 'Actualizando...' : 'Guardando...';

    try {
        let imagesToKeep = workToEdit ? workToEdit.imagenes.filter(img => !img.deleted) : [];
        let newImages = [];
        let currentImageCount = imagesToKeep.length;
        const maxImages = 4;
        
        if (files.length > 0) {
            if (currentImageCount + files.length > maxImages) {
                 throw new Error(`Solo se permiten un máximo de ${maxImages} imágenes por obra (actuales: ${currentImageCount}, intentando subir: ${files.length}).`);
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const pathId = id ? id : Date.now(); 
                const filePath = `${pathId}/${file.name.replace(/\s/g, '_')}`;

                const { data: uploadData, error: uploadError } = await client.storage
                    .from(BUCKET_NAME)
                    .upload(filePath, file);

                if (uploadError) throw uploadError;
                
                newImages.push({ 
                    path: uploadData.path, 
                });
            }
        }
        
        const finalImagesArray = [...imagesToKeep, ...newImages].map(img => ({
            path: img.path,
            url: getPublicUrl(img.path)
        }));
        
        const dataToSave = {
            titulo: document.getElementById('form-titulo').value,
            anio: parseInt(document.getElementById('form-anio').value),
            tecnica: document.getElementById('form-tecnica').value,
            medidas: document.getElementById('form-medidas').value,
            categoria: document.getElementById('form-categoria').value,
            serie: document.getElementById('form-serie').value,
            descripcion: document.getElementById('form-descripcion').value,
            imagenes: finalImagesArray
        };

        let dbResponse;
        if (id) {
            dbResponse = await client.from('productos').update(dataToSave).eq('id', id).select();
        } else {
            dataToSave.orden = currentWorks.length + 1; 
            dbResponse = await client.from('productos').insert(dataToSave).select();
        }

        if (dbResponse.error) throw dbResponse.error;
        
        showAlert(`Obra ${id ? 'actualizada' : 'creada'} exitosamente.`, 'success');
        
        resetForm();
        loadWorks(); 

    } catch (error) {
        console.error("Error al guardar la obra:", error);
        showAlert(`Error: ${error.message}. Verifique el formulario.`, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = id ? 'Actualizar Obra' : 'Guardar Obra';
    }
});


// --- LÓGICA DE ELIMINACIÓN DE IMÁGENES/OBRAS ---
async function deleteImageFromWork(workId, imagePath, elementToRemove) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta imagen?')) return;

    try {
        const { error: storageError } = await client.storage
            .from(BUCKET_NAME)
            .remove([imagePath]);

        if (storageError) throw storageError;

        let updatedImages = workToEdit.imagenes.filter(img => img.path !== imagePath);

        const { error: dbError } = await client
            .from('productos')
            .update({ imagenes: updatedImages })
            .eq('id', workId);
        
        if (dbError) throw dbError;
        
        elementToRemove.remove();
        workToEdit.imagenes = updatedImages;
        showAlert('Imagen eliminada correctamente.', 'success');

        if (updatedImages.length === 0) {
             currentImagesContainer.classList.add('hidden');
        }

    } catch (error) {
        console.error("Error al eliminar imagen:", error);
        showAlert(`Error al eliminar la imagen: ${error.message}`, 'error');
    }
}
window.deleteImageFromWork = deleteImageFromWork; 

async function deleteObra(id, button) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta obra COMPLETAMENTE?')) return;
    
    const originalText = button.textContent;
    button.textContent = "Eliminando...";
    button.disabled = true;

    try {
        const obra = currentWorks.find(w => w.id === id);
        if (!obra) throw new Error("Obra no encontrada localmente.");

        const { error: dbError } = await client
            .from('productos')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        const filePaths = obra.imagenes.map(img => img.path).filter(Boolean);

        if (filePaths.length > 0) {
            const { error: storageError } = await client.storage
                .from(BUCKET_NAME)
                .remove(filePaths);

            if (storageError && storageError.statusCode !== '200') {
                console.warn("Error al borrar imágenes del storage:", storageError);
                showAlert(`Obra eliminada de la DB. ADVERTENCIA: Falló el borrado de ${filePaths.length} imagen(es) del Storage.`, 'error');
                return; 
            }
        }

        showAlert("Obra y archivos eliminados exitosamente!", 'success');
        document.getElementById(`obra-item-${id}`).remove(); 
        
        currentWorks = currentWorks.filter(w => w.id !== id);

    } catch (error) {
        console.error(error);
        showAlert(error.message, 'error');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}
window.deleteObra = deleteObra;

// Inicializar
checkAuth();