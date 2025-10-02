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
const saveOrderButton = document.getElementById('save-order-button'); // Restaurado
const currentImagesList = document.getElementById('current-images-list');
const currentImagesContainer = document.getElementById('current-images-container');
const alertDiv = document.getElementById('alert');
const submitButton = document.getElementById('submit-button');
const searchInput = document.getElementById('search-input');


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    if (!alertDiv) return;
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-indigo-100', 'text-indigo-700', 'opacity-0');
    
    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'info') {
         alertDiv.classList.add('bg-indigo-100', 'text-indigo-700');
    }
    
    setTimeout(() => alertDiv.classList.add('opacity-0'), 4500);
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

// --- LÓGICA DE SORTABLEJS (CORREGIDA) ---

let sortableInstance = null;

function startSortable() {
    // Verificar si Sortable está definido y si ya hay una instancia
    if (typeof Sortable === 'undefined' || !worksList) {
        console.error("SortableJS no está cargado o worksList no existe.");
        return;
    }
    
    // Si ya existe una instancia, la destruimos para crear una nueva
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    
    sortableInstance = Sortable.create(worksList, {
        handle: '.drag-handle', // El elemento que se puede arrastrar
        animation: 150,
        onUpdate: function (evt) {
            // Mostrar botón de guardar al reordenar
            saveOrderButton.classList.remove('hidden');
        },
    });
}

async function saveOrder() {
    if (!sortableInstance) return;

    const newOrder = sortableInstance.toArray().map((id, index) => ({
        id: parseInt(id),
        orden: index + 1
    }));

    try {
        // 1. Obtener la lista de promesas de actualización
        const updates = newOrder.map(item =>
            client.from('obras')
                .update({ orden: item.orden })
                .eq('id', item.id)
        );

        // 2. Ejecutar todas las promesas en paralelo
        const results = await Promise.all(updates);
        
        // 3. Verificar si hubo errores en alguna actualización
        const hasError = results.some(res => res.error);

        if (hasError) {
            console.error("Errores al guardar orden:", results.filter(res => res.error));
            showAlert("Error al guardar el nuevo orden.", 'error');
        } else {
            showAlert("¡Orden de obras guardado exitosamente!", 'success');
            saveOrderButton.classList.add('hidden');
            // Refrescar la lista local y la vista
            await fetchWorks();
        }
    } catch (error) {
        console.error("Error inesperado al guardar orden:", error);
        showAlert("Error inesperado al comunicarse con el servidor.", 'error');
    }
}


// --- LÓGICA DE VISTAS Y AUTENTICACIÓN ---

function showLoginView() {
    loginContainer.classList.remove('hidden');
    adminHeader.classList.add('hidden');
    worksList.innerHTML = '';
    obraFormContainer.classList.add('hidden');
}

function showAdminView() {
    loginContainer.classList.add('hidden');
    adminHeader.classList.remove('hidden');
    obraFormContainer.classList.add('hidden');
    worksList.classList.remove('hidden');
    fetchWorks();
}

function showWorksList() {
    obraFormContainer.classList.add('hidden');
    worksList.classList.remove('hidden');
    saveOrderButton.classList.add('hidden');
    isEditMode = false;
    workToEdit = null;
    submitButton.textContent = 'Agregar Obra';
    obraForm.reset();
    currentImagesContainer.classList.add('hidden');
    // Si se sale del modo edición, destruimos Sortable si existe
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
}

function showAddForm() {
    obraFormContainer.classList.remove('hidden');
    worksList.classList.add('hidden');
    isEditMode = false;
    workToEdit = null;
    submitButton.textContent = 'Agregar Obra';
    obraForm.reset();
    currentImagesList.innerHTML = '';
    currentImagesContainer.classList.add('hidden');
}

// ... (Resto de funciones: fetchWorks, renderWorksList, deleteWork, handleEdit, handleSubmit) ...
async function fetchWorks() {
    try {
        const { data, error } = await client
            .from('obras')
            .select('*')
            .order('orden', { ascending: true }); 

        if (error) throw error;
        currentWorks = data;
        renderWorksList(currentWorks);
        
        // Iniciar Sortable después de que las obras se han renderizado
        startSortable(); 

    } catch (error) {
        console.error("Error al cargar obras:", error);
        showAlert("Error al cargar la lista de obras.", 'error');
    }
}


// Función de autenticación (mantener o ajustar según tu login.js)
async function checkAuth() {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
        showAdminView();
    } else {
        showLoginView();
    }
}

// ... (El resto de funciones como handleLogin, handleLogout, filterWorks) ...

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
        showLoginView();
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showAlert("Error al cerrar sesión: " + error.message, 'error');
    }
}

function filterWorks() {
    const searchTerm = searchInput.value.toLowerCase();
    const filtered = currentWorks.filter(obra => 
        obra.titulo.toLowerCase().includes(searchTerm) ||
        obra.tecnica.toLowerCase().includes(searchTerm) ||
        obra.serie.toLowerCase().includes(searchTerm)
    );
    renderWorksList(filtered);
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', checkAuth);
// obraForm.addEventListener('submit', handleSubmit); // Asumo que existe una handleSubmit
document.getElementById('login-form').addEventListener('submit', handleLogin);
logoutButton.addEventListener('click', handleLogout);

// Se añade listener para Save Order (que estaba faltando)
if (saveOrderButton) {
    saveOrderButton.addEventListener('click', saveOrder);
}

document.getElementById('show-add-form-button').addEventListener('click', showAddForm);
document.getElementById('cancel-edit-button').addEventListener('click', showWorksList);

searchInput.addEventListener('input', filterWorks);


client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setTimeout(checkAuth, 100);
    }
});