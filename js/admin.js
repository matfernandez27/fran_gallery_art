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
const searchInput = document.getElementById('search-input');

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

    // Mostrar con transición
    setTimeout(() => {
        alertDiv.classList.add('opacity-100');
    }, 10);
    
    // Ocultar después de 5 segundos
    setTimeout(() => {
        alertDiv.classList.remove('opacity-100');
        alertDiv.classList.add('opacity-0');
        setTimeout(() => {
            alertDiv.classList.add('hidden');
        }, 300); // Esperar a que termine la transición
    }, 5000);
}

function showAdminView() {
    loginContainer.classList.add('hidden');
    adminHeader.classList.remove('hidden');
    document.getElementById('works-container').classList.remove('hidden');
    document.getElementById('show-add-form-button').classList.remove('hidden');
}

function showLoginView() {
    loginContainer.classList.remove('hidden');
    adminHeader.classList.add('hidden');
    document.getElementById('works-container').classList.add('hidden');
    obraFormContainer.classList.add('hidden');
}

// Función auxiliar para obtener la URL pública de una imagen
function getPublicImageUrl(path) {
    if (!path) return 'https://via.placeholder.com/100x100?text=No+Image';
    const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
}

// --- RENDERING Y GESTIÓN DE OBRAS ---

function renderWorksList(works) {
    worksList.innerHTML = '';
    if (works.length === 0) {
        worksList.innerHTML = `<p class="p-4 text-center text-gray-500">${searchInput.value.trim() ? 'No hay resultados para la búsqueda.' : 'No hay obras cargadas.'}</p>`;
        return;
    }
    
    works.forEach(obra => {
        const item = document.createElement('div');
        item.id = `obra-item-${obra.id}`;
        item.dataset.id = obra.id;
        item.className = 'bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-start space-x-4';
        
        // CORRECCIÓN: Usar la función auxiliar para obtener la URL pública
        const imageUrl = obra.imagenes && obra.imagenes.length > 0 
            ? getPublicImageUrl(obra.imagenes[0].path)
            : 'https://via.placeholder.com/100x100?text=No+Image';

        item.innerHTML = `
            <div class="drag-handle p-2 self-center text-gray-400 hover:text-indigo-600 transition duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
            </div>
            <img src="${imageUrl}" alt="${obra.titulo}" class="obra-image w-20 h-20 object-cover rounded-md flex-shrink-0">
            <div class="flex-grow min-w-0">
                <h3 class="text-lg font-semibold text-gray-900">${obra.titulo}</h3>
                <p class="text-sm text-gray-500 mb-1">
                    Año: ${obra.anio || 'N/A'} | Cat.: ${obra.categoria || 'N/A'} | Serie: ${obra.serie || 'N/A'}
                    ${obra.is_available ? '<span class="text-green-600 font-medium ml-2">(Disponible)</span>' : '<span class="text-red-500 font-medium ml-2">(Vendida)</span>'}
                </p>
                <p class="text-sm text-gray-700 text-truncate-2">${obra.descripcion || 'Sin descripción.'}</p>
            </div>
            <div class="flex flex-col space-y-2 ml-4 flex-shrink-0">
                <button onclick="editWork(${obra.id})" class="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition duration-300">
                    Editar
                </button>
                <button onclick="deleteWork(${obra.id}, this)" class="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition duration-300">
                    Eliminar
                </button>
            </div>
        `;
        worksList.appendChild(item);
    });
}

/**
 * Filtra la lista de obras mostradas basándose en el valor del input de búsqueda.
 */
function filterWorks() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (query === '') {
        renderWorksList(currentWorks);
        return;
    }

    const filteredWorks = currentWorks.filter(obra => {
        const title = obra.titulo ? obra.titulo.toLowerCase() : '';
        const description = obra.descripcion ? obra.descripcion.toLowerCase() : '';
        const category = obra.categoria ? obra.categoria.toLowerCase() : '';
        const series = obra.serie ? obra.serie.toLowerCase() : '';

        return (
            title.includes(query) ||
            description.includes(query) ||
            category.includes(query) ||
            series.includes(query)
        );
    });

    renderWorksList(filteredWorks);
}


// --- LÓGICA DE DATOS Y CONEXIÓN CON SUPABASE ---

async function fetchWorks() {
    try {
        const { data, error } = await client
            .from('productos')
            .select('*')
            .order('orden', { ascending: true }); 

        if (error) throw error;

        currentWorks = data || [];
        renderWorksList(currentWorks);
        initSortable(); // Reinicializar SortableJS con la lista cargada
    } catch (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar las obras: " + error.message, 'error');
    }
}

async function saveOrder() {
    saveOrderButton.textContent = "Guardando...";
    saveOrderButton.disabled = true;

    try {
        const orderUpdates = Array.from(worksList.children).map((item, index) => ({
            id: parseInt(item.dataset.id),
            orden: index // Nuevo orden basado en la posición en la lista
        }));

        const { error } = await client
            .from('productos')
            .upsert(orderUpdates); 

        if (error) throw error;

        // Actualizar el orden en el array local para mantener sincronización
        orderUpdates.forEach(update => {
            const index = currentWorks.findIndex(w => w.id === update.id);
            if (index !== -1) {
                currentWorks[index].orden = update.orden;
            }
        });
        currentWorks.sort((a, b) => a.orden - b.orden);

        showAlert("Orden guardado exitosamente!", 'success');
        saveOrderButton.classList.add('hidden'); // Ocultar después de guardar
    } catch (error) {
        console.error("Error al guardar el orden:", error);
        showAlert("Error al guardar el orden: " + error.message, 'error');
    } finally {
        saveOrderButton.textContent = "Guardar Orden";
    }
}

// Lógica de Supabase para subir una imagen
async function uploadImage(file, workId) {
    const fileExtension = file.name.split('.').pop();
    const fileName = `${workId}_${Date.now()}.${fileExtension}`;
    const filePath = `obras/${fileName}`;

    const { data, error } = await client.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false // No sobrescribir
        });

    if (error) throw error;

    return { path: filePath, name: file.name };
}


async function handleSubmit(event) {
    event.preventDefault();
    submitButton.textContent = isEditMode ? "Guardando Cambios..." : "Creando Obra...";
    submitButton.disabled = true;

    try {
        const data = new FormData(obraForm);
        
        // --- INCLUSIÓN DE NUEVOS CAMPOS DE CONTROL DE VENTA ---
        const priceValue = data.get('price');
        const obraData = {
            titulo: data.get('titulo') || '',
            descripcion: data.get('descripcion') || '',
            anio: data.get('anio') ? parseInt(data.get('anio')) : null,
            categoria: data.get('categoria') || '',
            serie: data.get('serie') || '', 
            tecnica: data.get('tecnica') || '',
            medidas: data.get('medidas') || '',
            // Nuevos campos
            price: priceValue ? parseFloat(priceValue) : null,
            is_available: data.get('is_available') === 'on', // Checkbox
            show_price: data.get('show_price') === 'on' // Checkbox
        };
        // -----------------------------------------------------

        const imageFiles = data.getAll('imagenes').filter(file => file.name);

        let result;
        
        if (isEditMode) {
            // --- MODO EDICIÓN ---
            
            // 1. Manejar borrado y reordenamiento de imágenes actuales
            const existingImagesJSON = currentImagesList.dataset.currentImages;
            let existingImages = existingImagesJSON ? JSON.parse(existingImagesJSON) : [];
            
            // 2. Subir nuevas imágenes (si hay)
            let newImages = [];
            if (imageFiles.length > 0) {
                const uploadPromises = imageFiles.map(file => uploadImage(file, workToEdit.id));
                newImages = await Promise.all(uploadPromises);
            }

            // Combinar las imágenes existentes (ya reordenadas/filtradas en la UI) con las nuevas
            const updatedImages = [...existingImages, ...newImages];
            
            const { data: updateData, error: updateError } = await client
                .from('productos')
                .update({ ...obraData, imagenes: updatedImages })
                .eq('id', workToEdit.id)
                .select()
                .single();

            if (updateError) throw updateError;
            result = updateData;

        } else {
            // --- MODO CREACIÓN ---
            
            // 1. Obtener el último orden para el nuevo item
            const lastOrder = currentWorks.length > 0 ? Math.max(...currentWorks.map(w => w.orden)) : -1;
            obraData.orden = lastOrder + 1;

            // 2. Insertar la obra primero para obtener el ID
            const { data: insertData, error: insertError } = await client
                .from('productos')
                .insert([obraData])
                .select()
                .single();

            if (insertError) throw insertError;
            result = insertData;
            
            // 3. Subir imágenes si existen, usando el ID recién creado
            let uploadedImages = [];
            if (imageFiles.length > 0) {
                const uploadPromises = imageFiles.map(file => uploadImage(file, result.id));
                uploadedImages = await Promise.all(uploadPromises);
                
                // 4. Actualizar la obra con la información de las imágenes
                const { error: updateImagesError } = await client
                    .from('productos')
                    .update({ imagenes: uploadedImages })
                    .eq('id', result.id);

                if (updateImagesError) throw updateImagesError;
                result.imagenes = uploadedImages; // Actualizar el objeto resultado con las imágenes
            }
        }
        
        // Actualizar lista local y UI
        if (isEditMode) {
            currentWorks = currentWorks.map(w => w.id === result.id ? result : w);
        } else {
            currentWorks.push(result);
            currentWorks.sort((a, b) => a.orden - b.orden);
        }
        renderWorksList(currentWorks);
        
        showAlert(`Obra ${isEditMode ? 'actualizada' : 'creada'} exitosamente!`, 'success');
        resetForm();
        showWorksList();

    } catch (error) {
        console.error("Error al procesar obra:", error);
        showAlert("Error: " + error.message, 'error');
    } finally {
        submitButton.textContent = isEditMode ? "Guardar Cambios" : "Guardar Obra";
        submitButton.disabled = false;
    }
}


// --- LÓGICA DE FORMULARIO ---

function resetForm() {
    obraForm.reset();
    isEditMode = false;
    workToEdit = null;
    document.getElementById('form-title').textContent = "Agregar Nueva Obra";
    submitButton.textContent = "Guardar Obra";
    currentImagesContainer.classList.add('hidden');
    currentImagesList.innerHTML = '';
}

function showAddForm() {
    resetForm();
    // Asegurarse de que el input de categoría se seleccione a un valor por defecto si es necesario
    const categorySelect = document.getElementById('categoria');
    if (categorySelect && categorySelect.options.length > 0) {
        categorySelect.value = categorySelect.options[0].value;
    }
    // Asegurarse de que los checkboxes estén por defecto en false/unchecked (el reset lo hace)
    
    obraFormContainer.classList.remove('hidden');
    document.getElementById('works-container').classList.add('hidden');
    document.getElementById('show-add-form-button').classList.add('hidden');
}

function showWorksList() {
    obraFormContainer.classList.add('hidden');
    document.getElementById('works-container').classList.remove('hidden');
    document.getElementById('show-add-form-button').classList.remove('hidden');
    filterWorks(); // Refrescar la lista, aplicando el filtro si lo hay
}


// --- EDICIÓN Y ELIMINACIÓN ---

window.editWork = (id) => {
    const obra = currentWorks.find(w => w.id === id);
    if (!obra) return;

    workToEdit = obra;
    isEditMode = true;
    
    // 1. Llenar campos de texto y selección
    document.getElementById('form-title').textContent = "Editar Obra";
    submitButton.textContent = "Guardar Cambios";
    document.getElementById('titulo').value = obra.titulo || '';
    document.getElementById('descripcion').value = obra.descripcion || '';
    document.getElementById('anio').value = obra.anio || '';
    // ESTOS CAMPOS FUERON EL ORIGEN DEL ERROR SI NO ESTABAN EN EL HTML:
    document.getElementById('tecnica').value = obra.tecnica || '';
    document.getElementById('medidas').value = obra.medidas || '';
    // -------------------------------------------------------------
    document.getElementById('categoria').value = obra.categoria || '';
    document.getElementById('serie').value = obra.serie || '';

    // 2. Llenar nuevos campos de Control de Venta
    document.getElementById('price').value = obra.price || '';
    document.getElementById('is_available').checked = obra.is_available || false;
    document.getElementById('show_price').checked = obra.show_price || false;


    // 3. Mostrar contenedor de imágenes actuales
    currentImagesContainer.classList.remove('hidden');
    renderCurrentImages(obra.imagenes);

    // 4. Mostrar el formulario
    obraFormContainer.classList.remove('hidden');
    document.getElementById('works-container').classList.add('hidden');
    document.getElementById('show-add-form-button').classList.add('hidden');
}

function renderCurrentImages(images) {
    currentImagesList.innerHTML = '';
    
    // Guardar el estado actual en el dataset (importante para el submit)
    currentImagesList.dataset.currentImages = JSON.stringify(images);

    images.forEach(img => {
        // CORRECCIÓN: Usar la función auxiliar para obtener la URL pública
        const imageUrl = getPublicImageUrl(img.path);
        
        const imgItem = document.createElement('div');
        imgItem.className = 'relative group w-24 h-24 cursor-pointer';
        imgItem.dataset.path = img.path;
        imgItem.dataset.name = img.name;
        
        imgItem.innerHTML = `
            <img src="${imageUrl}" alt="${img.name}" class="w-full h-full object-cover rounded-md border border-gray-300">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 rounded-md">
                <svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </div>
        `;
        
        // Manejar el click para eliminar (solo visualmente por ahora)
        imgItem.addEventListener('click', (e) => removeCurrentImage(e, img.path));
        
        currentImagesList.appendChild(imgItem);
    });
    
    // Inicializar SortableJS para las imágenes actuales
    new Sortable(currentImagesList, {
        animation: 150,
        ghostClass: 'bg-indigo-200',
        onEnd: updateCurrentImagesData
    });
}

function removeCurrentImage(event, path) {
    event.stopPropagation();
    const itemToRemove = event.currentTarget;
    itemToRemove.remove();
    updateCurrentImagesData(); // Actualizar el dataset después de la eliminación
    showAlert("Imagen marcada para eliminación/reordenamiento. Confirma en 'Guardar Cambios'.", 'info');
}

function updateCurrentImagesData() {
    const updatedImages = Array.from(currentImagesList.children).map(item => ({
        path: item.dataset.path,
        name: item.dataset.name
    }));
    // Sobrescribir el dataset con la nueva lista de imágenes (ordenada o filtrada)
    currentImagesList.dataset.currentImages = JSON.stringify(updatedImages);
    // No hace falta mostrar el botón de orden aquí, ya que el cambio se guarda con el formulario
    // saveOrderButton.classList.remove('hidden'); 
}

window.deleteWork = async (id, button) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta obra y todas sus imágenes? Esta acción es irreversible.")) {
        return;
    }
    
    const originalText = button.textContent;
    button.textContent = "Eliminando...";
    button.disabled = true;

    try {
        const obra = currentWorks.find(w => w.id === id);
        if (!obra) throw new Error("Obra no encontrada localmente.");

        // 1. Eliminar de la Base de Datos
        const { error: dbError } = await client
            .from('productos')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Eliminar del Storage
        const filePaths = obra.imagenes.map(img => img.path).filter(Boolean);

        if (filePaths.length > 0) {
            const { error: storageError } = await client.storage
                .from(BUCKET_NAME)
                .remove(filePaths);

            if (storageError && storageError.statusCode !== '200' && storageError.statusCode !== '404') {
                console.warn("Error al borrar imágenes del storage:", storageError);
                showAlert(`Obra eliminada de la DB. ADVERTENCIA: Falló el borrado de ${filePaths.length} imagen(es) del Storage.`, 'error');
                return; 
            }
        }

        showAlert("Obra y archivos eliminados exitosamente!", 'success');
        document.getElementById(`obra-item-${id}`).remove(); 
        
        // 3. Actualizar array local
        currentWorks = currentWorks.filter(w => w.id !== id);
        filterWorks(); 

    } catch (error) {
        console.error(error);
        showAlert(error.message, 'error');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}


// --- SORTABLEJS (DRAG & DROP) ---

let sortableInstance = null;

function initSortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    
    sortableInstance = new Sortable(worksList, {
        animation: 150,
        handle: '.drag-handle', // Solo el handle para arrastrar
        ghostClass: 'bg-indigo-100', // Clase para el elemento fantasma
        onEnd: function (evt) {
            // Un item ha sido movido
            saveOrderButton.classList.remove('hidden');
            saveOrderButton.disabled = false;
        }
    });
}


// --- INICIALIZACIÓN Y LISTENERS ---

async function checkAuth() {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        showAdminView();
        await fetchWorks();
    } else {
        showLoginView();
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        await checkAuth(); 
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

// Event Listeners
document.addEventListener('DOMContentLoaded', checkAuth);
obraForm.addEventListener('submit', handleSubmit);
document.getElementById('login-form').addEventListener('submit', handleLogin);
logoutButton.addEventListener('click', handleLogout);
saveOrderButton.addEventListener('click', saveOrder);
document.getElementById('show-add-form-button').addEventListener('click', showAddForm);
document.getElementById('cancel-edit-button').addEventListener('click', showWorksList);

// Listener para el buscador
searchInput.addEventListener('input', filterWorks);


// Listener para manejar cambios de autenticación en tiempo real
client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setTimeout(checkAuth, 100); 
    }
});