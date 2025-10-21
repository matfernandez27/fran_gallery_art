// js/admin.js

const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(window.supabaseUrl, window.supabaseAnonKey);

let currentWorks = [];
let isEditMode = false;
let workToEdit = null;

// --- VARIABLES DE PAGINACIÓN ---
let currentPage = 0;
const PAGE_SIZE = 20; // Podemos cargar más en el admin
let isLoading = false;
let allDataLoaded = false;
let currentSearchQuery = '';
let searchDebounceTimer;
// --- FIN VARIABLES DE PAGINACIÓN ---

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
const saveOrderButton = document.getElementById('save-order-button'); // Reference to the save button

// --- TRIGGER PARA SCROLL INFINITO ---
const loadMoreTrigger = document.createElement('div');
loadMoreTrigger.id = 'load-more-trigger-admin';
loadMoreTrigger.className = 'py-6 text-center text-gray-500 hidden';
loadMoreTrigger.textContent = 'Cargando más...';


// --- FUNCIONES DE UTILIDAD ---
function showAlert(message, type = 'success') {
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-indigo-100', 'text-indigo-700', 'opacity-0');

    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'success') {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    } else { // 'info' or default
        alertDiv.classList.add('bg-indigo-100', 'text-indigo-700');
    }

    // Force reflow before adding opacity class
    void alertDiv.offsetWidth;

    alertDiv.classList.add('opacity-100');

    setTimeout(() => {
        alertDiv.classList.remove('opacity-100');
        alertDiv.classList.add('opacity-0');
        setTimeout(() => {
            alertDiv.classList.add('hidden');
        }, 300); // Match duration-300
    }, 5000);
}

function showAdminView() {
    loginContainer.classList.add('hidden');
    adminHeader.classList.remove('hidden');
    worksContainer.classList.remove('hidden'); // Ensure works container is shown
    document.getElementById('show-add-form-button').classList.remove('hidden');
}

function showLoginView() {
    loginContainer.classList.remove('hidden');
    adminHeader.classList.add('hidden');
    worksContainer.classList.add('hidden');
    obraFormContainer.classList.add('hidden');
}

function getPublicImageUrl(path) {
    if (!path) return 'https://via.placeholder.com/100x100?text=No+Image';
    const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
}

// --- RENDERING Y GESTIÓN DE OBRAS ---

function renderWorksList(works, isReplacing = false) {
    if (isReplacing) {
        worksList.innerHTML = ''; // Clear only if replacing
    }

    // Adjust condition to check currentPage reset
    if (works.length === 0 && isReplacing && currentPage === 0) {
        worksList.innerHTML = `<p class="p-4 text-center text-gray-500">${currentSearchQuery ? 'No hay resultados para la búsqueda.' : 'No hay obras cargadas.'}</p>`;
        // Ensure trigger is hidden if first page is empty
        allDataLoaded = true; // No more data to load if first page empty
        loadMoreTrigger.classList.add('hidden');
        return;
    }

    const fragment = document.createDocumentFragment();
    works.forEach(obra => {
        const item = document.createElement('div');
        item.id = `obra-item-${obra.id}`;
        item.dataset.id = obra.id;
        item.className = 'bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-start space-x-4';

        const imageUrl = obra.imagenes && obra.imagenes.length > 0
            ? getPublicImageUrl(obra.imagenes[0].path)
            : 'https://via.placeholder.com/100x100?text=No+Image';

        item.innerHTML = `
            <div class="drag-handle p-2 self-center text-gray-400 hover:text-indigo-600 transition duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
            </div>
            <img src="${imageUrl}" alt="${obra.titulo || 'Sin título'}" class="obra-image w-20 h-20 object-cover rounded-md flex-shrink-0">
            <div class="flex-grow min-w-0">
                <h3 class="text-lg font-semibold text-gray-900">${obra.titulo || 'Sin título'}</h3>
                <p class="text-sm text-gray-500 mb-1">
                    Año: ${obra.anio || 'N/A'} | Cat.: ${obra.categoria || 'N/A'} | Serie: ${obra.serie || 'N/A'}
                    ${obra.is_available ? '<span class="text-green-600 font-medium ml-2">Disponible</span>' : '<span class="text-red-500 font-medium ml-2">Vendida</span>'}
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
        fragment.appendChild(item);
    });
    worksList.appendChild(fragment); // Append new items
}

function handleSearchChange() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        const query = searchInput.value.toLowerCase().trim();
        currentSearchQuery = query;
        // Reset pagination
        currentPage = 0;
        allDataLoaded = false;
        currentWorks = []; // Clear cache
        renderWorksList([], true); // Clear DOM list
        loadMoreTrigger.classList.add('hidden'); // Hide trigger initially
        loadWorksPage(); // Load first page of search results

        // Disable/Enable SortableJS based on search
        if (sortableInstance) {
            sortableInstance.option("disabled", currentSearchQuery !== '');
        }
        if (currentSearchQuery !== '') {
            showAlert("Ordenamiento desactivado durante la búsqueda.", "info");
            if (saveOrderButton) saveOrderButton.disabled = true; // Disable save btn too
        } else {
             if (saveOrderButton) saveOrderButton.disabled = true; // Keep disabled until drag
        }

    }, 350);
}


// --- LÓGICA DE DATOS Y CONEXIÓN CON SUPABASE ---

async function loadWorksPage() {
    if (isLoading || allDataLoaded) return;
    isLoading = true;
    loadMoreTrigger.classList.remove('hidden'); // Show loader
    loadMoreTrigger.textContent = 'Cargando...';

    try {
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = client
            .from('productos')
            .select('*', { count: 'exact'}) // Request count
            .order('orden', { ascending: true }) // Always order by 'orden'
            .range(from, to);

        if (currentSearchQuery) {
            query = query.or(
                `titulo.ilike.%${currentSearchQuery}%,` +
                `descripcion.ilike.%${currentSearchQuery}%,` +
                `categoria.ilike.%${currentSearchQuery}%,` +
                `serie.ilike.%${currentSearchQuery}%`
            );
        }

        // Get count along with data
        const { data, error, count } = await query;

        if (error) throw error;

        const newWorks = data || [];
        currentWorks.push(...newWorks);
        renderWorksList(newWorks, currentPage === 0); // Replace only on first page

        // Check if all data is loaded based on count
        // Note: count might be null if RLS is enabled and no policies allow count
        if (count !== null && currentWorks.length >= count) {
             allDataLoaded = true;
        } else if (newWorks.length < PAGE_SIZE) {
            // Fallback if count is not available or inaccurate
            allDataLoaded = true;
        }


        if (allDataLoaded) {
            loadMoreTrigger.classList.add('hidden');
        } else {
            loadMoreTrigger.textContent = 'Cargar más'; // Ready for next scroll
        }
        currentPage++;

    } catch (error) {
        console.error("Error loading works:", error);
        showAlert("Error loading works: " + error.message, 'error');
        loadMoreTrigger.textContent = 'Error loading';
        // Optionally hide trigger on error, or allow retry?
        // loadMoreTrigger.classList.add('hidden');
    } finally {
        isLoading = false;
        // Ensure trigger is hidden if all loaded
        if (allDataLoaded) {
             loadMoreTrigger.classList.add('hidden');
        }
    }
}

function setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        // Load when trigger is intersecting and not loading/all loaded
        if (entries[0].isIntersecting && !isLoading && !allDataLoaded) {
            loadWorksPage();
        }
    }, { rootMargin: '400px' });

    observer.observe(loadMoreTrigger);
}

async function uploadImage(file, workId) {
    const fileExtension = file.name.split('.').pop();
    const safeFileNameBase = file.name.replace(`.${fileExtension}`, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${workId}_${safeFileNameBase}_${Date.now()}.${fileExtension}`;
    const filePath = `obras/${fileName}`;

    const { data, error } = await client.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
            cacheControl: '3600', // Cache for 1 hour
            upsert: false // Don't overwrite existing files
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

        const priceValue = data.get('price');
        const obraData = {
            titulo: data.get('titulo') || null, // Allow null if empty, but required by DB
            descripcion: data.get('descripcion') || null,
            anio: data.get('anio') ? parseInt(data.get('anio')) : null,
            categoria: data.get('categoria') || null,
            serie: data.get('serie') || null,
            tecnica: data.get('tecnica') || null,
            medidas: data.get('medidas') || null,
            price: priceValue ? parseFloat(priceValue) : null,
            is_available: data.get('is_available') === 'on',
            show_price: data.get('show_price') === 'on'
        };

        if (!obraData.titulo) {
             throw new Error("El título es obligatorio.");
        }


        const imageFiles = data.getAll('imagenes').filter(file => file.size > 0);

        let result;

        if (isEditMode && workToEdit) {
            const existingImagesJSON = currentImagesList.dataset.currentImages;
            let existingImages = existingImagesJSON ? JSON.parse(existingImagesJSON) : [];

            let newImages = [];
            if (imageFiles.length > 0) {
                showAlert(`Subiendo ${imageFiles.length} imagen(es)...`, 'info');
                const uploadPromises = imageFiles.map(file => uploadImage(file, workToEdit.id));
                newImages = await Promise.all(uploadPromises);
            }

            const updatedImages = [...existingImages, ...newImages];

            const { data: updateData, error: updateError } = await client
                .from('productos')
                .update({ ...obraData, imagenes: updatedImages })
                .eq('id', workToEdit.id)
                .select()
                .single();

            if (updateError) throw updateError;
            result = updateData;

        } else { // Creating new work
            const { data: insertData, error: insertError } = await client
                .from('productos')
                .insert([obraData])
                .select()
                .single();

            if (insertError) throw insertError;
            result = insertData;

            let uploadedImages = [];
            if (imageFiles.length > 0) {
                 showAlert(`Subiendo ${imageFiles.length} imagen(es)...`, 'info');
                 const uploadPromises = imageFiles.map(file => uploadImage(file, result.id));
                 uploadedImages = await Promise.all(uploadPromises);

                const { error: updateImagesError } = await client
                    .from('productos')
                    .update({ imagenes: uploadedImages })
                    .eq('id', result.id);

                if (updateImagesError) {
                     console.warn("Error updating image paths after insert:", updateImagesError);
                     showAlert("Obra creada, pero hubo un error al guardar las imágenes.", "error");
                } else {
                     result.imagenes = uploadedImages;
                }
            }
        }

        showAlert(`Obra ${isEditMode ? 'actualizada' : 'creada'} exitosamente!`, 'success');

        resetForm();
        showWorksList(true); // Force reload of list

    } catch (error) {
        console.error("Error processing work:", error);
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
    currentImagesList.removeAttribute('data-current-images');
}

function showAddForm() {
    resetForm();
    obraFormContainer.classList.remove('hidden');
    worksContainer.classList.add('hidden');
    document.getElementById('show-add-form-button').classList.add('hidden');
}

function showWorksList(forceReload = false) {
    obraFormContainer.classList.add('hidden');
    worksContainer.classList.remove('hidden');
    document.getElementById('show-add-form-button').classList.remove('hidden');

    if (forceReload) {
        currentPage = 0;
        allDataLoaded = false;
        currentWorks = [];
        renderWorksList([], true); // Clear DOM
        loadMoreTrigger.classList.add('hidden'); // Hide trigger until load check
        loadWorksPage();
    }
}


// --- EDICIÓN Y ELIMINACIÓN ---

window.editWork = async (id) => {
    let obra = currentWorks.find(w => w.id === id);

    if (obra) {
        populateEditForm(obra);
    } else {
        showAlert("Cargando datos de la obra...", 'info');
        try {
            const { data, error } = await client.from('productos').select('*').eq('id', id).single();
            if (error) throw error;
            if (data) {
                populateEditForm(data);
            } else {
                showAlert(`Error: No se encontró la obra con ID ${id}`, 'error');
                showWorksList();
            }
        } catch (err) {
            console.error(err);
            showAlert(err.message, 'error');
            showWorksList();
        }
    }
}

function populateEditForm(obra) {
    workToEdit = obra;
    isEditMode = true;

    document.getElementById('form-title').textContent = "Editar Obra";
    submitButton.textContent = "Guardar Cambios";

    document.getElementById('titulo').value = obra.titulo || '';
    document.getElementById('descripcion').value = obra.descripcion || '';
    document.getElementById('anio').value = obra.anio || '';
    document.getElementById('tecnica').value = obra.tecnica || '';
    document.getElementById('medidas').value = obra.medidas || '';
    document.getElementById('categoria').value = obra.categoria || '';
    document.getElementById('serie').value = obra.serie || '';
    document.getElementById('price').value = obra.price !== null ? obra.price : '';

    document.getElementById('is_available').checked = obra.is_available === true;
    document.getElementById('show_price').checked = obra.show_price === true;

    if (obra.imagenes && obra.imagenes.length > 0) {
        currentImagesContainer.classList.remove('hidden');
        renderCurrentImages(obra.imagenes);
    } else {
        currentImagesContainer.classList.add('hidden');
        currentImagesList.innerHTML = '';
        currentImagesList.removeAttribute('data-current-images');
    }

    obraFormContainer.classList.remove('hidden');
    worksContainer.classList.add('hidden');
    document.getElementById('show-add-form-button').classList.add('hidden');
}

function renderCurrentImages(images) {
    currentImagesList.innerHTML = '';
    currentImagesList.dataset.currentImages = JSON.stringify(images);

    images.forEach((img, index) => {
        if (!img || !img.path) {
            console.warn("Skipping invalid image data:", img);
            return;
        }
        const imageUrl = getPublicImageUrl(img.path);
        const imgItem = document.createElement('div');
        imgItem.className = 'relative group w-24 h-24 cursor-pointer border border-gray-300 rounded-md overflow-hidden';
        imgItem.dataset.path = img.path;
        imgItem.dataset.name = img.name || `imagen_${index + 1}`;
        imgItem.innerHTML = `
            <img src="${imageUrl}" alt="${img.name || 'Imagen actual'}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button type="button" class="text-white delete-image-btn" title="Marcar para eliminar">
                    <svg class="h-6 w-6 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>`;

        const deleteButton = imgItem.querySelector('.delete-image-btn');
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCurrentImage(imgItem, img.path);
        });

        currentImagesList.appendChild(imgItem);
    });

    // Destroy previous sortable instance before creating a new one
    if (currentImagesList.sortableInstance) {
        currentImagesList.sortableInstance.destroy();
    }
    
    if (images.length > 0) {
       currentImagesList.sortableInstance = new Sortable(currentImagesList, { // Store instance on element
            animation: 150,
            ghostClass: 'bg-indigo-200 opacity-50',
            onEnd: updateCurrentImagesData
        });
    }
}


function removeCurrentImage(imageElement, path) {
    imageElement.remove();
    updateCurrentImagesData();
    showAlert("Imagen marcada para eliminación. Guarda los cambios para confirmar.", 'info');
}

function updateCurrentImagesData() {
    const updatedImages = Array.from(currentImagesList.children).map(item => ({
        path: item.dataset.path,
        name: item.dataset.name
    }));
    currentImagesList.dataset.currentImages = JSON.stringify(updatedImages);
}

window.deleteWork = async (id, button) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta obra? Esta acción es irreversible.")) return;

    const originalText = button.textContent;
    button.textContent = "Eliminando...";
    button.disabled = true;

    try {
        let obra = currentWorks.find(w => w.id === id);
        if (!obra) {
            const { data: obraData, error: fetchError } = await client.from('productos').select('id, imagenes').eq('id', id).single();
            if (fetchError || !obraData) throw new Error("Obra no encontrada para eliminar.");
            obra = obraData;
        }

        const { error: dbError } = await client.from('productos').delete().eq('id', id);
        if (dbError) throw dbError;

        const filePaths = (obra.imagenes || []).map(img => img.path).filter(Boolean);
        if (filePaths.length > 0) {
            const { data: deletedFiles, error: storageError } = await client.storage.from(BUCKET_NAME).remove(filePaths);
            if (storageError) {
                 console.warn("Error deleting images from storage:", storageError);
                 showAlert("Obra eliminada de la DB, error al borrar imágenes.", 'error');
            } else {
                 showAlert("Obra eliminada (incluyendo imágenes).", 'success');
            }
        } else {
             showAlert("Obra eliminada (no tenía imágenes).", 'success');
        }

        const itemInDom = document.getElementById(`obra-item-${id}`);
        if(itemInDom) itemInDom.remove();
        currentWorks = currentWorks.filter(w => w.id !== id);

        if (worksList.children.length === 0) {
             renderWorksList([], true); // Show empty message if needed
        }

    } catch (error) {
        console.error("Error deleting work:", error);
        showAlert("Error al eliminar la obra: " + error.message, 'error');
        button.textContent = originalText;
        button.disabled = false; // Re-enable button on error
    }
}


// --- SORTABLEJS (DRAG & DROP FOR WORKS LIST) ---
let sortableInstance = null; // Instance for the main works list

async function saveOrder() {
    if (!sortableInstance || currentSearchQuery) {
        showAlert("Desactiva la búsqueda para guardar el orden.", "error");
        return;
    }

    // Check if the button reference exists
    if (!saveOrderButton) {
         console.error("Save order button not found!");
         return;
    }

    saveOrderButton.textContent = "Guardando...";
    saveOrderButton.disabled = true;

    // Correctly get order from current DOM state
    const orderedItems = Array.from(worksList.children).map((card, index) => ({
        id: parseInt(card.dataset.id),
        orden: index, // Simple index based on current DOM order
    }));

    try {
        for (const item of orderedItems) {
            const { error } = await client
                .from('productos')
                .update({ orden: item.orden })
                .eq('id', item.id);
            if (error) throw error;
        }

        // Update local cache
        orderedItems.forEach(item => {
            const product = currentWorks.find(p => p.id === item.id);
            if(product) product.order = item.orden;
        });
        currentWorks.sort((a, b) => (a.orden || 0) - (b.orden || 0));

        showAlert("¡Orden guardado exitosamente!", 'success');

    } catch (error) {
        console.error("Error saving order:", error);
        showAlert(`Error al guardar: ${error.message}`, 'error');
        if (saveOrderButton) saveOrderButton.disabled = false; // Re-enable on error
    } finally {
        if (saveOrderButton) {
            saveOrderButton.textContent = "Guardar Orden";
            saveOrderButton.disabled = true; // Disable until next drag
        }
    }
}

function initSortable() {
    if (sortableInstance) sortableInstance.destroy();

    if (!worksList) {
        console.error("Work list element not found for Sortable init.");
        return;
    }

    sortableInstance = new Sortable(worksList, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'bg-indigo-100 opacity-50',
        disabled: currentSearchQuery !== '', // Initial disabled state based on search
        onEnd: () => {
             // Enable save button only if not searching
            if(saveOrderButton && !currentSearchQuery) {
                saveOrderButton.disabled = false;
            }
        }
    });
}


// --- INICIALIZACIÓN Y LISTENERS ---
async function checkAuth() {
    try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;

        if (session) {
            showAdminView();
            // Append trigger only once
            if (!document.getElementById(loadMoreTrigger.id)) {
                 worksContainer.appendChild(loadMoreTrigger);
            }
            setupInfiniteScroll();
            loadMoreTrigger.classList.add('hidden'); // Start hidden
            await loadWorksPage(); // Initial load
            initSortable(); // Init sortable after first load
            handleUrlParameters(); // Check for ?edit=ID
        } else {
            showLoginView();
        }
    } catch(error) {
        console.error("Auth check failed:", error);
        showLoginView(); // Fallback to login view on error
        showAlert("Error checking authentication: " + (error.message || error), 'error');
    }
}

function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const workIdToEdit = params.get('edit');
    if (workIdToEdit) {
        const workId = parseInt(workIdToEdit, 10);
        // editWork handles fetching if needed
        window.editWork(workId);

        // Clean URL after attempting to load editor
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginButton = event.target.querySelector('button[type="submit"]');
    if (!loginButton) return; // Guard clause
    loginButton.textContent = "Ingresando...";
    loginButton.disabled = true;

    try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Auth state change will handle UI update
    } catch (error) {
        showAlert("Error de login: " + error.message, 'error');
        loginButton.textContent = "Ingresar";
        loginButton.disabled = false;
    }
}

async function handleLogout() {
    try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        // Auth state change will handle UI update
    } catch (error) {
        console.error("Error logging out:", error);
        showAlert("Error logging out: " + error.message, 'error');
    }
}

// --- GLOBAL EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Attach listeners only after DOM is ready
    const loginForm = document.getElementById('login-form');
    const showAddButton = document.getElementById('show-add-form-button');
    const cancelEditButton = document.getElementById('cancel-edit-button');

    // Add checks for element existence before adding listeners
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (obraForm) obraForm.addEventListener('submit', handleSubmit);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (showAddButton) showAddButton.addEventListener('click', showAddForm);
    if (cancelEditButton) cancelEditButton.addEventListener('click', () => showWorksList(false));
    if (searchInput) searchInput.addEventListener('input', handleSearchChange);
    // Ensure saveOrderButton exists before adding listener
    if (saveOrderButton) saveOrderButton.addEventListener('click', saveOrder); 

    checkAuth(); // Initial auth check
});

// Listen for auth changes (login/logout)
client.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event, session ? "Session exists" : "No session");
    if (event === 'INITIAL_SESSION') {
        // Handled by DOMContentLoaded checkAuth
    } else if (event === 'SIGNED_IN') {
        // --- CORRECCIÓN: REMOVIDO window.location.reload() ---
        // Let checkAuth handle showing the view and loading data if needed
        checkAuth(); // Re-run checkAuth to load data and show admin view
    } else if (event === 'SIGNED_OUT') {
         currentWorks = [];
         currentPage = 0;
         allDataLoaded = false;
         isLoading = false;
         currentSearchQuery = '';
         showLoginView();
         showAlert("Sesión cerrada.", 'info');
    }
});