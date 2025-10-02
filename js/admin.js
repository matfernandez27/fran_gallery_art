// js/admin.js

const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(window.supabaseUrl, window.supabaseAnonKey);
const TABLE_NAME = 'productos'; // <--- CLAVE: Nombre de la tabla unificado

let currentWorks = [];
let isEditMode = false;
let workToEdit = null;
let sortableInstance = null; // Instancia de SortableJS

// Elementos del DOM
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


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-indigo-100', 'text-indigo-700', 'opacity-0');
    
    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'info') {
         alertDiv.classList.add('bg-indigo-100', 'text-indigo-700');
    }
    
    // Ocultar después de un tiempo
    setTimeout(() => alertDiv.classList.add('opacity-0'), 4500);
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

// --- VISTAS ---

function showWorksList() {
    obraFormContainer.classList.add('hidden');
    worksList.parentElement.classList.remove('hidden'); 
    obraForm.reset();
    isEditMode = false;
    workToEdit = null;
    submitButton.textContent = "Añadir Obra";
    currentImagesContainer.classList.add('hidden');
    fetchWorks();
}

function showAddForm() {
    worksList.parentElement.classList.add('hidden');
    obraFormContainer.classList.remove('hidden');
    isEditMode = false;
    workToEdit = null;
    obraForm.reset();
    submitButton.textContent = "Añadir Obra";
    currentImagesContainer.classList.add('hidden');
}

function showEditForm(obra) {
    worksList.parentElement.classList.add('hidden');
    obraFormContainer.classList.remove('hidden');
    isEditMode = true;
    workToEdit = obra;
    submitButton.textContent = "Guardar Cambios";
    
    // Llenar el formulario
    document.getElementById('titulo').value = obra.titulo || '';
    document.getElementById('tecnica').value = obra.tecnica || '';
    document.getElementById('dimensiones').value = obra.dimensiones || '';
    document.getElementById('anio').value = obra.anio || '';
    document.getElementById('categoria').value = obra.categoria || '';
    document.getElementById('serie').value = obra.serie || '';
    document.getElementById('descripcion').value = obra.descripcion || '';
    document.getElementById('disponible').checked = obra.disponible || false;
    document.getElementById('precio').value = obra.precio || '';
    document.getElementById('orden').value = obra.orden || '';
    
    // Mostrar imagen actual
    currentImagesList.innerHTML = `
        <img src="${client.storage.from(BUCKET_NAME).getPublicUrl(obra.ruta_imagen).data.publicUrl}" 
             alt="Imagen actual" class="h-32 object-contain mx-auto">
        <p class="text-sm text-gray-500 mt-2 text-center">La imagen actual se mantendrá si no subes un nuevo archivo.</p>
    `;
    currentImagesContainer.classList.remove('hidden');
}

// --- FUNCIONES DE AUTENTICACIÓN ---

function showLoginView() {
    loginContainer.classList.remove('hidden');
    worksList.parentElement.classList.add('hidden');
    adminHeader.classList.add('hidden');
    obraFormContainer.classList.add('hidden');
}

function showAdminView() {
    loginContainer.classList.add('hidden');
    adminHeader.classList.remove('hidden');
    showWorksList(); 
}

async function checkAuth() {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
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
        window.location.href = './login.html'; // Redirigir al login.html
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showAlert("Error al cerrar sesión: " + error.message, 'error');
    }
}

// --- FUNCIONES CRUD Y LÓGICA DE OBRAS ---

async function fetchWorks() {
    const { data, error } = await client
        .from(TABLE_NAME) // <--- CLAVE: Se usa la tabla 'productos'
        .select('*')
        .order('orden', { ascending: true });

    if (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar la lista de obras.", 'error');
        return;
    }

    currentWorks = data;
    renderWorksList(currentWorks);
    setupSortable(); 
}

function renderWorksList(works) {
    worksList.innerHTML = works.map(obra => {
        const imageUrl = client.storage.from(BUCKET_NAME).getPublicUrl(obra.ruta_imagen).data.publicUrl;
        return `
            <div id="item-${obra.id}" data-id="${obra.id}" class="work-item-admin flex items-center bg-white p-3 rounded-lg shadow-sm border border-gray-100 hover:border-pantone-magenta transition-colors">
                <span class="drag-handle text-gray-400 hover:text-pantone-magenta mr-3 cursor-grab">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </span>
                <img src="${imageUrl}" alt="${obra.titulo}" class="obra-image object-cover rounded-sm mr-4 flex-shrink-0">
                <div class="flex-grow">
                    <p class="font-semibold text-gray-800">${obra.titulo} (${obra.anio})</p>
                    <p class="text-sm text-gray-500">${obra.tecnica} | Orden: ${obra.orden}</p>
                </div>
                <div class="flex space-x-2 ml-4 flex-shrink-0">
                    <button onclick="editWork(${obra.id})" class="text-indigo-600 hover:text-indigo-900 transition-colors" title="Editar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-14-2l4 4m-4-4l4 4m6-11l4 4m-4-4l-4 4"></path></svg>
                    </button>
                    <button onclick="deleteWork(${obra.id})" class="text-red-600 hover:text-red-900 transition-colors" title="Eliminar">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.013 21H7.987a2 2 0 01-1.92-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function uploadImage(file, id) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${id}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await client.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true 
        });

    if (error) throw error;
    return filePath;
}

async function deleteImage(filePath) {
    const { error } = await client.storage
        .from(BUCKET_NAME)
        .remove([filePath]);

    if (error) {
        console.error("Error al eliminar imagen del storage:", error);
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const file = form.imagen.files[0];
    const newObra = {
        titulo: form.titulo.value,
        tecnica: form.tecnica.value,
        dimensiones: form.dimensiones.value,
        anio: parseInt(form.anio.value),
        categoria: form.categoria.value,
        serie: form.serie.value,
        descripcion: form.descripcion.value,
        disponible: form.disponible.checked,
        precio: parseFloat(form.precio.value) || 0,
        orden: parseInt(form.orden.value) || 999 
    };

    try {
        if (isEditMode) {
            // Edición
            let imagePath = workToEdit.ruta_imagen;
            
            if (file) {
                // Sube la nueva imagen (upsert=true se encargará de reemplazar)
                imagePath = await uploadImage(file, workToEdit.id);
            }
            
            newObra.ruta_imagen = imagePath;

            const { error } = await client
                .from(TABLE_NAME) // <--- CLAVE: Se usa la tabla 'productos'
                .update(newObra)
                .eq('id', workToEdit.id);

            if (error) throw error;
            showAlert("Obra actualizada exitosamente!", 'success');
        } else {
            // Nueva Obra
            
            // 1. Insertar la obra para obtener el ID
            const { data: insertedData, error: insertError } = await client
                .from(TABLE_NAME) // <--- CLAVE: Se usa la tabla 'productos'
                .insert(newObra)
                .select(); 

            if (insertError) throw insertError;
            
            const newId = insertedData[0].id;
            
            // 2. Subir la imagen con el ID generado
            if (file) {
                const imagePath = await uploadImage(file, newId);
                
                // 3. Actualizar la obra con la ruta de la imagen
                const { error: updateError } = await client
                    .from(TABLE_NAME) // <--- CLAVE: Se usa la tabla 'productos'
                    .update({ ruta_imagen: imagePath })
                    .eq('id', newId);

                if (updateError) throw updateError;
            }

            showAlert("Obra añadida exitosamente!", 'success');
        }
        
        showWorksList();

    } catch (error) {
        console.error("Error al guardar obra:", error);
        showAlert("Error al guardar la obra: " + error.message, 'error');
    }
}

function editWork(id) {
    const obra = currentWorks.find(w => w.id === id);
    if (obra) {
        showEditForm(obra);
    }
}

async function deleteWork(id) {
    if (!confirm("¿Estás seguro de que quieres eliminar esta obra? Esta acción es irreversible.")) {
        return;
    }

    const obraToDelete = currentWorks.find(w => w.id === id);

    try {
        // 1. Eliminar de la base de datos
        const { error: dbError } = await client
            .from(TABLE_NAME) // <--- CLAVE: Se usa la tabla 'productos'
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;
        
        // 2. Eliminar la imagen del storage (si existe)
        if (obraToDelete && obraToDelete.ruta_imagen) {
            await deleteImage(obraToDelete.ruta_imagen);
        }

        showAlert("Obra eliminada exitosamente.", 'success');
        fetchWorks();

    } catch (error) {
        console.error("Error al eliminar obra:", error);
        showAlert("Error al eliminar la obra: " + error.message, 'error');
    }
}

async function saveOrder() {
    if (!sortableInstance) return;

    const items = sortableInstance.toArray();
    const updates = items.map((id, index) => ({
        id: parseInt(id),
        orden: index + 1
    }));

    try {
        const { error } = await client
            .from(TABLE_NAME) // <--- CLAVE: Se usa la tabla 'productos'
            .upsert(updates);

        if (error) throw error;
        showAlert("Orden de obras guardado exitosamente!", 'success');
    } catch (error) {
        console.error("Error al guardar orden:", error);
        showAlert("Error al guardar el orden.", 'error');
    }
}

function setupSortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    
    // Inicializar SortableJS
    sortableInstance = new Sortable(worksList, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: function (evt) {
            // Guardar orden automáticamente al finalizar el arrastre
            saveOrder(); 
        }
    });
}

function filterWorks() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredWorks = currentWorks.filter(obra => 
        obra.titulo.toLowerCase().includes(searchTerm) ||
        obra.tecnica.toLowerCase().includes(searchTerm) ||
        obra.serie.toLowerCase().includes(searchTerm)
    );
    renderWorksList(filteredWorks);
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', checkAuth);
obraForm.addEventListener('submit', handleSubmit);
document.getElementById('login-form').addEventListener('submit', handleLogin);
logoutButton.addEventListener('click', handleLogout);
document.getElementById('show-add-form-button').addEventListener('click', showAddForm);
document.getElementById('cancel-edit-button').addEventListener('click', showWorksList);

searchInput.addEventListener('input', filterWorks);


client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // Usa setTimeout para dar tiempo a que la página cambie si es necesario
        setTimeout(checkAuth, 100); 
    }
});