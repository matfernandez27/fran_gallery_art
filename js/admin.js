// js/admin.js

const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(window.supabaseUrl, window.supabaseAnonKey);

let currentWorks = [];
let isEditMode = false;
let workToEdit = null;
let sortableInstance = null; // Instancia de SortableJS

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
const searchInput = document.getElementById('search-input'); // Nuevo


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-indigo-100', 'text-indigo-700', 'opacity-0');
    
    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    } else {
        alertDiv.classList.add('bg-indigo-100', 'text-indigo-700');
    }

    setTimeout(() => {
        alertDiv.classList.add('opacity-0');
        alertDiv.addEventListener('transitionend', function handler() {
            alertDiv.classList.add('hidden');
            alertDiv.classList.remove('opacity-0'); // Reset para el siguiente show
            alertDiv.removeEventListener('transitionend', handler);
        });
    }, 4000);
}


// --- LÓGICA DE VISTAS ---
function showLoginView() {
    loginContainer.classList.remove('hidden');
    adminHeader.classList.add('hidden');
    obraFormContainer.classList.add('hidden');
    worksContainer.classList.add('hidden');
    document.getElementById('works-container').classList.add('hidden');
}

function showAdminView() {
    loginContainer.classList.add('hidden');
    adminHeader.classList.remove('hidden');
    document.getElementById('works-container').classList.remove('hidden');
    loadWorks();
}

function showAddForm() {
    isEditMode = false;
    workToEdit = null;
    document.getElementById('form-title').textContent = 'Agregar Nueva Obra';
    document.getElementById('submit-button').textContent = 'Guardar Obra';
    obraForm.reset();
    currentImagesContainer.classList.add('hidden');
    obraFormContainer.classList.remove('hidden');
    document.getElementById('works-container').classList.add('hidden');
}

function showWorksList() {
    // Implementa la función de reset (limpieza de formulario)
    isEditMode = false;
    workToEdit = null;
    obraForm.reset();
    document.getElementById('price').value = '';
    document.getElementById('show_price').checked = false;
    document.getElementById('is_available').checked = false;

    obraFormContainer.classList.add('hidden');
    document.getElementById('works-container').classList.remove('hidden');
    saveOrderButton.disabled = true;
    searchInput.value = ''; // Limpiar buscador
    filterWorks(); // Refrescar la lista con todas las obras
}


// --- LÓGICA DE DATOS Y RENDERIZADO ---
async function loadWorks() {
    // Carga las obras ordenadas por el campo 'orden'
    const { data, error } = await client
        .from('productos')
        .select('*')
        .order('orden', { ascending: true }); 

    if (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar las obras.", 'error');
        return;
    }

    currentWorks = data;
    filterWorks(); // Renderiza todas las obras inicialmente
    initSortable();
}

// Función para renderizar la lista de obras (usada por loadWorks y filterWorks)
function renderWorks(works) {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    worksList.innerHTML = ''; 

    if (works.length === 0) {
        worksList.innerHTML = '<p class="text-center text-gray-500 py-4">No se encontraron obras.</p>';
        return;
    }

    works.forEach(obra => {
        const obraElement = document.createElement('div');
        obraElement.id = `obra-item-${obra.id}`;
        // Uso de clases para el drag and drop (arrastrar)
        obraElement.className = 'flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md shadow-sm hover:shadow-lg transition-shadow duration-200 cursor-default';
        obraElement.dataset.id = obra.id;
        obraElement.dataset.orden = obra.orden;
        
        const info = document.createElement('div');
        info.className = 'flex items-center min-w-0 flex-1';

        // Icono de arrastre (drag handle)
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle mr-3 text-gray-400 hover:text-indigo-600';
        dragHandle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>';
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${obra.titulo} (${obra.anio}) - ${obra.categoria || 'Sin Cat.'}`;
        titleSpan.className = 'font-medium text-gray-800 flex-1 truncate';

        info.appendChild(dragHandle);
        info.appendChild(titleSpan);


        const actions = document.createElement('div');
        actions.className = 'flex space-x-2 items-center ml-4';
        
        // Botón de EDITAR
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Editar';
        editBtn.className = 'px-3 py-1 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 transition';
        editBtn.onclick = () => editWork(obra.id); 

        // Botón de ELIMINAR
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Eliminar';
        deleteBtn.className = 'px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition';
        deleteBtn.onclick = (e) => deleteWork(obra.id, e.target); 

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        
        obraElement.appendChild(info);
        obraElement.appendChild(actions);

        worksList.appendChild(obraElement);
    });
    initSortable(); // Reinicializa SortableJS para la nueva lista
}

function initSortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    sortableInstance = new Sortable(worksList, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: function (evt) {
            // Activar el botón de guardar orden si hubo un cambio
            if (evt.oldIndex !== evt.newIndex) {
                saveOrderButton.disabled = false;
                saveOrderButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                saveOrderButton.classList.add('bg-green-600', 'hover:bg-green-700');
            }
        },
    });
}

// Lógica de filtrado
function filterWorks() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        renderWorks(currentWorks);
        return;
    }

    const filtered = currentWorks.filter(obra => {
        // Concatenar todos los campos de texto relevantes para la búsqueda
        const searchableText = [
            obra.titulo, 
            obra.descripcion, 
            obra.categoria, 
            obra.serie, 
            String(obra.anio) 
        ].join(' ').toLowerCase();
        
        return searchableText.includes(searchTerm);
    });

    renderWorks(filtered);
}


// --- CRUD DE OBRA ---
async function editWork(id) {
    workToEdit = currentWorks.find(w => w.id === id);
    if (!workToEdit) {
        showAlert("Obra no encontrada.", 'error');
        return;
    }
    
    isEditMode = true;
    document.getElementById('form-title').textContent = `Editar Obra: ${workToEdit.titulo}`;
    document.getElementById('submit-button').textContent = 'Actualizar Obra';

    // Cargar datos de texto
    document.getElementById('titulo').value = workToEdit.titulo;
    document.getElementById('descripcion').value = workToEdit.descripcion;
    document.getElementById('anio').value = workToEdit.anio;
    document.getElementById('categoria').value = workToEdit.categoria || '';
    document.getElementById('serie').value = workToEdit.serie || '';
    
    // Cargar datos de precio y disponibilidad (NUEVO)
    document.getElementById('price').value = workToEdit.price || '';
    document.getElementById('show_price').checked = workToEdit.show_price;
    document.getElementById('is_available').checked = workToEdit.is_available;
    
    // Cargar imágenes actuales
    renderCurrentImages(workToEdit.imagenes);
    currentImagesContainer.classList.remove('hidden');

    obraFormContainer.classList.remove('hidden');
    document.getElementById('works-container').classList.add('hidden');
}


async function handleSubmit(e) {
    e.preventDefault();

    // El botón que dispara el submit (soluciona el error de ID duplicado)
    const button = e.submitter; 
    const originalText = button.textContent;
    
    // Deshabilitar y mostrar estado
    button.textContent = isEditMode ? "Actualizando..." : "Guardando...";
    button.disabled = true;

    // 1. Obtener datos del formulario
    const formData = new FormData(obraForm);
    const titulo = formData.get('titulo');
    const descripcion = formData.get('descripcion');
    const anio = parseInt(formData.get('anio'));
    const categoria = formData.get('categoria');
    const serie = formData.get('serie');
    const newFiles = document.getElementById('imagenes').files;
    
    // --- OBTENER NUEVOS CAMPOS ---
    const price = parseFloat(formData.get('price')) || null;
    const show_price = formData.get('show_price') === 'on'; 
    const is_available = formData.get('is_available') === 'on';
    // ----------------------------


    let existingImages = isEditMode ? workToEdit.imagenes : [];
    let newImageUrls = [];

    try {
        // 2. Subir Nuevas Imágenes
        if (newFiles.length > 0) {
            showAlert(`Subiendo ${newFiles.length} imágenes...`, 'info');

            for (let i = 0; i < newFiles.length; i++) {
                const file = newFiles[i];
                // Crear un path único
                const timestamp = new Date().getTime();
                const folder = workToEdit ? workToEdit.id : 'temp-upload'; // Usar ID o un temporal
                const filePath = `${folder}/${timestamp}-${file.name.replace(/\s/g, '_')}`;

                const { data, error } = await client.storage
                    .from(BUCKET_NAME)
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (error) throw error;

                // Obtener URL pública para almacenar en la DB
                newImageUrls.push({
                    path: data.path,
                    url: client.storage.from(BUCKET_NAME).getPublicUrl(data.path).data.publicUrl,
                    name: file.name
                });
            }
        }

        // 3. Combinar las listas de imágenes
        // Si estamos editando, las imágenes existentes ya fueron reordenadas por el drag and drop del formulario
        const finalImageList = [...existingImages, ...newImageUrls];

        // 4. Preparar el objeto de datos para la DB
        const obraData = {
            titulo: titulo,
            descripcion: descripcion,
            anio: anio,
            categoria: categoria,
            serie: serie,
            imagenes: finalImageList,
            price: price,
            show_price: show_price,
            is_available: is_available
        };

        let dbResponse;

        // 5. Insertar o Actualizar en la DB
        if (isEditMode) {
            dbResponse = await client
                .from('productos')
                .update(obraData)
                .eq('id', workToEdit.id)
                .select();
        } else {
            // Insertar con orden temporal 0
            dbResponse = await client
                .from('productos')
                .insert([{ ...obraData, orden: 0 }]) 
                .select(); 
            
            if (dbResponse.error) throw dbResponse.error;
            
            // Actualizar el orden con el ID después de la inserción
            const newId = dbResponse.data[0].id;
            const updateOrder = await client
                .from('productos')
                .update({ orden: newId })
                .eq('id', newId);
                
            if (updateOrder.error) throw updateOrder.error;
            
            dbResponse.data[0].orden = newId; 
        }

        if (dbResponse.error) throw dbResponse.error;

        showAlert(`Obra ${isEditMode ? 'actualizada' : 'creada'} exitosamente!`, 'success');
        
        // Limpiar formulario y recargar la lista
        showWorksList(); // Llama a la función de limpieza y recarga

    } catch (error) {
        console.error("Error en la operación de obra:", error);
        showAlert(`Error al guardar la obra: ${error.message}`, 'error');

    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}


// Función completa para DELETE WORK (necesaria para el panel)
async function deleteWork(id, element) {
    if (!confirm("¿Estás seguro de que quieres ELIMINAR PERMANENTEMENTE esta obra y todos sus archivos?")) {
        return;
    }
    
    const originalText = element.textContent;
    element.textContent = "Eliminando...";
    element.disabled = true;

    try {
        const obra = currentWorks.find(w => w.id === id);
        if (!obra) throw new Error("Obra no encontrada localmente.");

        // 1. Eliminar de la base de datos
        const { error: dbError } = await client
            .from('productos')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Eliminar imágenes del Storage
        const filePaths = obra.imagenes.map(img => img.path).filter(Boolean);

        if (filePaths.length > 0) {
            const { error: storageError } = await client.storage
                .from(BUCKET_NAME)
                .remove(filePaths);

            if (storageError && storageError.statusCode !== '200') {
                console.warn("Error al borrar imágenes del storage:", storageError);
                // No lanzamos error para no detener el flujo, solo advertimos
                showAlert(`Obra eliminada de la DB. ADVERTENCIA: Falló el borrado de ${filePaths.length} imagen(es) del Storage.`, 'error');
            }
        }

        showAlert("Obra y archivos eliminados exitosamente!", 'success');
        document.getElementById(`obra-item-${id}`).remove(); 
        currentWorks = currentWorks.filter(w => w.id !== id);

    } catch (error) {
        console.error(error);
        showAlert(error.message, 'error');
    } finally {
        element.textContent = originalText;
        element.disabled = false;
    }
}

// Función para renderizar y manejar la eliminación de imágenes en modo edición
function renderCurrentImages(images) {
    currentImagesList.innerHTML = '';
    
    // Si no hay imágenes, ocultar el contenedor
    if (!images || images.length === 0) {
        currentImagesContainer.classList.add('hidden');
        return;
    }

    images.forEach(img => {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'relative group cursor-pointer w-20 h-20 rounded-md overflow-hidden shadow-md';
        
        const imgElement = document.createElement('img');
        imgElement.src = img.url;
        imgElement.className = 'w-full h-full object-cover obra-image';
        
        // Overlay de eliminación
        const deleteOverlay = document.createElement('div');
        deleteOverlay.className = 'absolute inset-0 bg-red-600 bg-opacity-70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300';
        deleteOverlay.innerHTML = '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
        
        // Evento de eliminación
        imgContainer.onclick = () => deleteImageFromWork(workToEdit.id, img.path, imgContainer);

        imgContainer.appendChild(imgElement);
        imgContainer.appendChild(deleteOverlay);
        currentImagesList.appendChild(imgContainer);
    });

    currentImagesContainer.classList.remove('hidden');
}

async function deleteImageFromWork(workId, imagePath, element) {
    if (!confirm(`¿Estás seguro de que quieres ELIMINAR PERMANENTEMENTE esta imagen? Esto también la borrará del Storage de Supabase.`)) {
        return;
    }
    
    element.classList.add('opacity-50', 'pointer-events-none'); 
    
    try {
        // 1. Eliminar del Storage
        const { error: storageError } = await client.storage
            .from(BUCKET_NAME)
            .remove([imagePath]);

        if (storageError) throw storageError;

        // 2. Actualizar el registro en la tabla 'productos'
        const obra = currentWorks.find(w => w.id === workId);
        if (!obra) throw new Error("Obra no encontrada localmente.");

        // Filtrar la imagen eliminada del array
        const updatedImages = obra.imagenes.filter(img => img.path !== imagePath);

        const { error: dbError } = await client
            .from('productos')
            .update({ imagenes: updatedImages })
            .eq('id', workId);
        
        if (dbError) throw dbError;

        // 3. Actualizar la interfaz local
        obra.imagenes = updatedImages; // Actualiza el objeto local
        workToEdit.imagenes = updatedImages; // Actualiza el objeto de edición
        element.remove();
        showAlert("Imagen eliminada de la obra y del Storage.", 'success');
        
        // Si no quedan más imágenes, oculta el contenedor
        if (updatedImages.length === 0) {
             currentImagesContainer.classList.add('hidden');
        }

    } catch (error) {
        console.error("Error al eliminar la imagen:", error);
        showAlert(`Error al eliminar imagen: ${error.message}`, 'error');
        element.classList.remove('opacity-50', 'pointer-events-none'); 
    }
}


// --- LÓGICA DE AUTENTICACIÓN ---
async function checkAuth() {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        showAdminView();
    } else {
        showLoginView();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // La vista se actualizará automáticamente con onAuthStateChange o al recargar
        showAlert("¡Bienvenido!", 'success');
    } catch (error) {
        showAlert("Error de login: " + error.message, 'error');
    }
}

async function handleLogout() {
    try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        showAlert("Sesión cerrada.", 'info');
        showLoginView();
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showAlert("Error al cerrar sesión: " + error.message, 'error');
    }
}


// --- LÓGICA DE ORDEN ---
async function saveOrder() {
    const orderElements = worksList.querySelectorAll('[data-id]');
    const updates = [];

    orderElements.forEach((el, index) => {
        const newOrder = index + 1; // Orden basado en 1
        const workId = parseInt(el.dataset.id);

        if (workId) {
            updates.push({
                id: workId,
                orden: newOrder
            });
        }
    });

    try {
        const { error } = await client
            .from('productos')
            .upsert(updates); // Usar upsert para actualizar múltiples filas

        if (error) throw error;

        showAlert("Orden de obras guardado exitosamente!", 'success');
        saveOrderButton.disabled = true;
        saveOrderButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        saveOrderButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');

        // Actualizar el orden localmente
        currentWorks = currentWorks.map(work => {
            const update = updates.find(u => u.id === work.id);
            return update ? { ...work, orden: update.orden } : work;
        });

    } catch (error) {
        console.error("Error al guardar el orden:", error);
        showAlert("Error al guardar el orden.", 'error');
    }
}


// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', checkAuth);
obraForm.addEventListener('submit', handleSubmit);
document.getElementById('login-form').addEventListener('submit', handleLogin);
logoutButton.addEventListener('click', handleLogout);
saveOrderButton.addEventListener('click', saveOrder);
document.getElementById('show-add-form-button').addEventListener('click', showAddForm);
document.getElementById('cancel-edit-button').addEventListener('click', showWorksList);
searchInput.addEventListener('input', filterWorks); // Conectar el buscador