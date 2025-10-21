// js/admin.js

const BUCKET_NAME = 'imagenes';
const client = supabase.createClient(window.supabaseUrl, window.supabaseAnonKey);

let currentWorks = [];
let isEditMode = false;
let workToEdit = null;
let currentPage = 0;
const PAGE_SIZE = 20; 
let isLoading = false;
let allDataLoaded = false;
let currentSearchQuery = '';
let searchDebounceTimer;

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

const loadMoreTrigger = document.createElement('div');
loadMoreTrigger.id = 'load-more-trigger-admin';
loadMoreTrigger.className = 'py-6 text-center text-gray-500 hidden';
loadMoreTrigger.textContent = 'Cargando más...';

function showAlert(message, type = 'success') {
    if (!alertDiv) return;
    alertDiv.textContent = message;
    alertDiv.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[1001] px-6 py-3 rounded-md shadow-lg text-sm font-medium transition-opacity duration-300 opacity-0 w-[90%] max-w-md'; // Base + positioning
    
    if (type === 'error') alertDiv.classList.add('bg-red-100', 'text-red-700');
    else if (type === 'info') alertDiv.classList.add('bg-indigo-100', 'text-indigo-700'); // Changed info color
    else alertDiv.classList.add('bg-green-100', 'text-green-700');
    
    alertDiv.classList.remove('hidden');
    void alertDiv.offsetWidth; 
    alertDiv.classList.add('opacity-100');
    
    setTimeout(() => {
        alertDiv.classList.remove('opacity-100');
        setTimeout(() => alertDiv.classList.add('hidden'), 300);
    }, 5000);
}

function showAdminView() {
    if (loginContainer) loginContainer.classList.add('hidden');
    if (adminHeader) adminHeader.classList.remove('hidden');
    if (worksContainer) worksContainer.classList.remove('hidden'); 
    const showAddBtn = document.getElementById('show-add-form-button');
    if (showAddBtn) showAddBtn.classList.remove('hidden');
}

function showLoginView() {
    if (loginContainer) loginContainer.classList.remove('hidden');
    if (adminHeader) adminHeader.classList.add('hidden');
    if (worksContainer) worksContainer.classList.add('hidden');
    if (obraFormContainer) obraFormContainer.classList.add('hidden');
}

function getPublicImageUrl(path) {
    if (!path) return 'https://via.placeholder.com/100x100?text=No+Img';
    const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
}

function renderWorksList(works, isReplacing = false) {
    if (!worksList) return;
    if (isReplacing) worksList.innerHTML = ''; 

    if (works.length === 0 && isReplacing && currentPage === 0) { 
        worksList.innerHTML = `<p class="p-4 text-center text-text-secondary">${currentSearchQuery ? 'No hay resultados.' : 'No hay obras.'}</p>`;
        allDataLoaded = true; 
        if(loadMoreTrigger) loadMoreTrigger.classList.add('hidden');
        return;
    }
    
    const fragment = document.createDocumentFragment();
    works.forEach(obra => {
        const item = document.createElement('div');
        item.id = `obra-item-${obra.id}`;
        item.dataset.id = obra.id;
        item.className = 'bg-bg-surface border border-border-default rounded-lg shadow-sm p-4 flex items-start space-x-4';
        const imageUrl = obra.imagenes && obra.imagenes.length > 0 ? getPublicImageUrl(obra.imagenes[0].path) : 'https://via.placeholder.com/64x64?text=N/A';

        item.innerHTML = `
            <div class="drag-handle p-2 self-center text-gray-400 hover:text-accent-blue transition duration-200"><svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></div>
            <img src="${imageUrl}" alt="${obra.titulo || ''}" class="obra-image">
            <div class="flex-grow min-w-0"><h3 class="text-base font-semibold text-text-main truncate">${obra.titulo || 'Sin título'}</h3><p class="text-xs text-text-secondary mb-1">Año: ${obra.anio || 'N/A'} | Cat: ${obra.categoria || 'N/A'} | Serie: ${obra.serie || 'N/A'} ${obra.is_available ? '<span class="text-green-600 font-medium ml-1">✓ Disp.</span>' : '<span class="text-red-500 font-medium ml-1">✗ Vend.</span>'}</p><p class="text-xs text-gray-600 text-truncate-2">${obra.descripcion || 'Sin descripción.'}</p></div>
            <div class="flex flex-col space-y-2 ml-auto flex-shrink-0"><button onclick="editWork(${obra.id})" class="admin-button admin-button-link text-xs !px-3 !py-1">Editar</button><button onclick="deleteWork(${obra.id}, this)" class="admin-button admin-button-danger text-xs !px-3 !py-1">Eliminar</button></div>`;
        fragment.appendChild(item);
    });
    worksList.appendChild(fragment); 
}

function handleSearchChange() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        const query = searchInput.value.toLowerCase().trim();
        currentSearchQuery = query;
        currentPage = 0; allDataLoaded = false; currentWorks = [];
        renderWorksList([], true); 
        if(loadMoreTrigger) loadMoreTrigger.classList.add('hidden'); 
        loadWorksPage(); 
        if (sortableInstance) sortableInstance.option("disabled", currentSearchQuery !== '');
        if (currentSearchQuery !== '') { showAlert("Ordenamiento desactivado durante la búsqueda.", "info"); if (saveOrderButton) saveOrderButton.disabled = true; }
        else { if (saveOrderButton) saveOrderButton.disabled = true; }
    }, 350);
}

async function loadWorksPage() {
    if (isLoading || allDataLoaded || !loadMoreTrigger) return;
    isLoading = true;
    loadMoreTrigger.classList.remove('hidden'); loadMoreTrigger.textContent = 'Cargando...';

    try {
        const from = currentPage * PAGE_SIZE; const to = from + PAGE_SIZE - 1;
        let query = client.from('productos').select('*', { count: 'exact'})
                          .order('orden', { ascending: true }).range(from, to);
        if (currentSearchQuery) query = query.or(`titulo.ilike.%${currentSearchQuery}%,descripcion.ilike.%${currentSearchQuery}%,categoria.ilike.%${currentSearchQuery}%,serie.ilike.%${currentSearchQuery}%`);
        const { data, error, count } = await query;
        if (error) throw error;
        const newWorks = data || [];
        currentWorks.push(...newWorks);
        renderWorksList(newWorks, currentPage === 0); 
        if (count !== null && currentWorks.length >= count) allDataLoaded = true;
        else if (newWorks.length < PAGE_SIZE) allDataLoaded = true;
        if (allDataLoaded) loadMoreTrigger.classList.add('hidden');
        else loadMoreTrigger.textContent = 'Cargar más'; 
        currentPage++;
    } catch (error) {
        console.error("Error loading works:", error); showAlert("Error loading works: " + error.message, 'error');
        if(loadMoreTrigger) loadMoreTrigger.textContent = 'Error al cargar';
    } finally {
        isLoading = false;
        if (allDataLoaded && loadMoreTrigger) loadMoreTrigger.classList.add('hidden');
    }
}

function setupInfiniteScroll() {
    if (!loadMoreTrigger) return;
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && !allDataLoaded) loadWorksPage();
    }, { rootMargin: '400px' });
    observer.observe(loadMoreTrigger);
}

async function uploadImage(file, workId) {
    const fileExtension = file.name.split('.').pop();
    const safeFileNameBase = file.name.replace(`.${fileExtension}`, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${workId}_${safeFileNameBase}_${Date.now()}.${fileExtension}`;
    const filePath = `obras/${fileName}`;
    const { data, error } = await client.storage.from(BUCKET_NAME).upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return { path: filePath, name: file.name }; 
}

async function handleSubmit(event) {
    event.preventDefault();
    if (!submitButton) return;
    submitButton.textContent = isEditMode ? "Guardando..." : "Creando..."; submitButton.disabled = true;
    try {
        const data = new FormData(obraForm);
        const priceValue = data.get('price');
        const obraData = {
            titulo: data.get('titulo') || null, descripcion: data.get('descripcion') || null,
            anio: data.get('anio') ? parseInt(data.get('anio')) : null, categoria: data.get('categoria') || null,
            serie: data.get('serie') || null, tecnica: data.get('tecnica') || null,
            medidas: data.get('medidas') || null, price: priceValue ? parseFloat(priceValue) : null,
            is_available: data.get('is_available') === 'on', show_price: data.get('show_price') === 'on'
        };
        if (!obraData.titulo) throw new Error("El título es obligatorio.");
        const imageFiles = data.getAll('imagenes').filter(file => file.size > 0);
        let result;
        if (isEditMode && workToEdit) {
            const existingImagesJSON = currentImagesList.dataset.currentImages;
            let existingImages = existingImagesJSON ? JSON.parse(existingImagesJSON) : [];
            let newImages = [];
            if (imageFiles.length > 0) { showAlert(`Subiendo ${imageFiles.length} imagen(es)...`, 'info'); const uploadPromises = imageFiles.map(file => uploadImage(file, workToEdit.id)); newImages = await Promise.all(uploadPromises); }
            const updatedImages = [...existingImages, ...newImages];
            const { data: updateData, error: updateError } = await client.from('productos').update({ ...obraData, imagenes: updatedImages }).eq('id', workToEdit.id).select().single();
            if (updateError) throw updateError;
            result = updateData;
        } else { 
            const { data: insertData, error: insertError } = await client.from('productos').insert([obraData]).select().single();
            if (insertError) throw insertError;
            result = insertData;
            let uploadedImages = [];
            if (imageFiles.length > 0) { showAlert(`Subiendo ${imageFiles.length} imagen(es)...`, 'info'); const uploadPromises = imageFiles.map(file => uploadImage(file, result.id)); uploadedImages = await Promise.all(uploadPromises);
                 const { error: updateImagesError } = await client.from('productos').update({ imagenes: uploadedImages }).eq('id', result.id);
                 if (updateImagesError) { console.warn("Error updating image paths:", updateImagesError); showAlert("Obra creada, error al guardar imágenes.", "error"); } 
                 else { result.imagenes = uploadedImages; }
            }
        }
        showAlert(`Obra ${isEditMode ? 'actualizada' : 'creada'}.`, 'success');
        resetForm(); showWorksList(true); 
    } catch (error) {
        console.error("Error processing work:", error); showAlert("Error: " + error.message, 'error');
    } finally {
        if (submitButton) { submitButton.textContent = isEditMode ? "Guardar Cambios" : "Guardar Obra"; submitButton.disabled = false; }
    }
}

function resetForm() {
    if (obraForm) obraForm.reset();
    isEditMode = false; workToEdit = null;
    const formTitle = document.getElementById('form-title'); if (formTitle) formTitle.textContent = "Agregar Nueva Obra";
    if (submitButton) submitButton.textContent = "Guardar Obra";
    if (currentImagesContainer) currentImagesContainer.classList.add('hidden');
    if (currentImagesList) { currentImagesList.innerHTML = ''; currentImagesList.removeAttribute('data-current-images'); }
}

function showAddForm() {
    resetForm();
    if (obraFormContainer) obraFormContainer.classList.remove('hidden');
    if (worksContainer) worksContainer.classList.add('hidden'); 
    const showAddBtn = document.getElementById('show-add-form-button'); if (showAddBtn) showAddBtn.classList.add('hidden');
}

function showWorksList(forceReload = false) {
    if (obraFormContainer) obraFormContainer.classList.add('hidden');
    if (worksContainer) worksContainer.classList.remove('hidden'); 
    const showAddBtn = document.getElementById('show-add-form-button'); if (showAddBtn) showAddBtn.classList.remove('hidden');
    if (forceReload) { currentPage = 0; allDataLoaded = false; currentWorks = []; renderWorksList([], true); if(loadMoreTrigger) loadMoreTrigger.classList.add('hidden'); loadWorksPage(); }
}

window.editWork = async (id) => {
    let obra = currentWorks.find(w => w.id === id);
    if (obra) populateEditForm(obra);
    else {
        showAlert("Cargando datos...", 'info');
        try { const { data, error } = await client.from('productos').select('*').eq('id', id).single(); if (error) throw error; if (data) populateEditForm(data); else { showAlert(`Error: Obra ID ${id} no encontrada.`, 'error'); showWorksList(); }
        } catch (err) { console.error(err); showAlert(err.message, 'error'); showWorksList(); }
    }
}

function populateEditForm(obra) {
    workToEdit = obra; isEditMode = true;
    const formTitle = document.getElementById('form-title'); if (formTitle) formTitle.textContent = "Editar Obra";
    if (submitButton) submitButton.textContent = "Guardar Cambios";
    const fields = ['titulo', 'descripcion', 'anio', 'tecnica', 'medidas', 'categoria', 'serie'];
    fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = obra[f] || ''; });
    const priceEl = document.getElementById('price'); if (priceEl) priceEl.value = obra.price !== null ? obra.price : '';
    const isAvailableEl = document.getElementById('is_available'); if (isAvailableEl) isAvailableEl.checked = obra.is_available === true;
    const showPriceEl = document.getElementById('show_price'); if (showPriceEl) showPriceEl.checked = obra.show_price === true;
    if (obra.imagenes && obra.imagenes.length > 0) { if (currentImagesContainer) currentImagesContainer.classList.remove('hidden'); renderCurrentImages(obra.imagenes); } 
    else { if (currentImagesContainer) currentImagesContainer.classList.add('hidden'); if (currentImagesList) { currentImagesList.innerHTML = ''; currentImagesList.removeAttribute('data-current-images'); }}
    if (obraFormContainer) obraFormContainer.classList.remove('hidden');
    if (worksContainer) worksContainer.classList.add('hidden');
    const showAddBtn = document.getElementById('show-add-form-button'); if (showAddBtn) showAddBtn.classList.add('hidden');
}

function renderCurrentImages(images) {
    if (!currentImagesList) return;
    currentImagesList.innerHTML = ''; 
    currentImagesList.dataset.currentImages = JSON.stringify(images); 
    images.forEach((img, index) => {
        if (!img || !img.path) { console.warn("Invalid image data:", img); return; }
        const imageUrl = getPublicImageUrl(img.path);
        const imgItem = document.createElement('div');
        imgItem.className = 'relative group w-20 h-20 cursor-grab border border-border-default rounded-md overflow-hidden'; // Adjusted size
        imgItem.dataset.path = img.path; imgItem.dataset.name = img.name || `img_${index + 1}`;
        imgItem.innerHTML = `<img src="${imageUrl}" alt="${img.name || 'Actual'}" class="w-full h-full object-cover pointer-events-none"><div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"><button type="button" class="text-white delete-image-btn p-1 rounded-full bg-black/30 hover:bg-red-500" title="Marcar para eliminar"><svg class="h-4 w-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`;
        const deleteButton = imgItem.querySelector('.delete-image-btn');
        if (deleteButton) deleteButton.addEventListener('click', (e) => { e.stopPropagation(); removeCurrentImage(imgItem, img.path); });
        currentImagesList.appendChild(imgItem);
    });
    if (currentImagesList.sortableInstance) currentImagesList.sortableInstance.destroy();
    if (images.length > 0) currentImagesList.sortableInstance = new Sortable(currentImagesList, { animation: 150, ghostClass: 'opacity-50', onEnd: updateCurrentImagesData });
}

function removeCurrentImage(imageElement, path) { imageElement.remove(); updateCurrentImagesData(); showAlert("Imagen marcada para eliminar.", 'info'); }

function updateCurrentImagesData() {
    if (!currentImagesList) return;
    const updatedImages = Array.from(currentImagesList.children).map(item => ({ path: item.dataset.path, name: item.dataset.name }));
    currentImagesList.dataset.currentImages = JSON.stringify(updatedImages);
}

window.deleteWork = async (id, button) => {
    if (!confirm("¿Eliminar esta obra? Esta acción es irreversible.")) return;
    const originalText = button.textContent; button.textContent = "Borrando..."; button.disabled = true;
    try {
        let obra = currentWorks.find(w => w.id === id);
        if (!obra) { const { data: d, error: e } = await client.from('productos').select('id,imagenes').eq('id', id).single(); if (e || !d) throw new Error("Obra no encontrada."); obra = d; }
        const { error: dbError } = await client.from('productos').delete().eq('id', id); if (dbError) throw dbError;
        const filePaths = (obra.imagenes || []).map(img => img.path).filter(Boolean);
        let alertMsg = "Obra eliminada."; let alertType = 'success';
        if (filePaths.length > 0) {
            const { error: storageError } = await client.storage.from(BUCKET_NAME).remove(filePaths);
            if (storageError) { console.warn("Error deleting images:", storageError); alertMsg = "Obra eliminada, error al borrar imágenes."; alertType = 'error'; } 
            else { alertMsg = "Obra eliminada (con imágenes)."; }
        }
        showAlert(alertMsg, alertType);
        const itemInDom = document.getElementById(`obra-item-${id}`); if(itemInDom) itemInDom.remove();
        currentWorks = currentWorks.filter(w => w.id !== id);
        if (worksList && worksList.children.length === 0) renderWorksList([], true); 
    } catch (error) {
        console.error("Error deleting work:", error); showAlert("Error al eliminar: " + error.message, 'error');
        button.textContent = originalText; button.disabled = false; 
    } 
}

let sortableInstance = null; 

async function saveOrder() { 
    if (!sortableInstance || currentSearchQuery || !saveOrderButton) { if(!currentSearchQuery) showAlert("Activa la búsqueda para guardar.", "error"); return; }
    saveOrderButton.textContent = "Guardando..."; saveOrderButton.disabled = true;
    const orderedItems = Array.from(worksList.children).map((card, index) => ({ id: parseInt(card.dataset.id), orden: index }));
    try {
        for (const item of orderedItems) { const { error } = await client.from('productos').update({ orden: item.orden }).eq('id', item.id); if (error) throw error; }
        orderedItems.forEach(item => { const p = currentWorks.find(prod => prod.id === item.id); if(p) p.orden = item.orden; });
        currentWorks.sort((a, b) => (a.orden || 0) - (b.orden || 0));
        showAlert("Orden guardado.", 'success');
    } catch (error) {
        console.error("Error saving order:", error); showAlert(`Error al guardar: ${error.message}`, 'error');
        if (saveOrderButton) saveOrderButton.disabled = false; 
    } finally {
        if (saveOrderButton) { saveOrderButton.textContent = "Guardar Orden"; saveOrderButton.disabled = true; }
    }
}

function initSortable() {
    if (sortableInstance) sortableInstance.destroy();
    if (!worksList) return;
    sortableInstance = new Sortable(worksList, { animation: 150, handle: '.drag-handle', ghostClass: 'opacity-50', disabled: currentSearchQuery !== '', onEnd: () => { if(saveOrderButton && !currentSearchQuery) saveOrderButton.disabled = false; } });
}

async function checkAuth() {
    try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (session) { showAdminView(); if (worksContainer && !document.getElementById(loadMoreTrigger.id)) worksContainer.appendChild(loadMoreTrigger); setupInfiniteScroll(); if(loadMoreTrigger) loadMoreTrigger.classList.add('hidden'); await loadWorksPage(); initSortable(); handleUrlParameters(); } 
        else { showLoginView(); }
    } catch(error) { console.error("Auth check failed:", error); showLoginView(); showAlert("Error auth: " + (error.message || error), 'error'); }
}

function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const workIdToEdit = params.get('edit');
    if (workIdToEdit) { const workId = parseInt(workIdToEdit, 10); if(!isNaN(workId)) window.editWork(workId); window.history.replaceState({}, document.title, window.location.pathname); }
}

async function handleLogin(event) {
    event.preventDefault();
    const emailEl = document.getElementById('email'); const passwordEl = document.getElementById('password');
    const loginButton = event.target.querySelector('button[type="submit"]');
    if (!emailEl || !passwordEl || !loginButton) return; 
    const email = emailEl.value; const password = passwordEl.value;
    loginButton.textContent = "Ingresando..."; loginButton.disabled = true;
    try { const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; } 
    catch (error) { showAlert("Error login: " + error.message, 'error'); loginButton.textContent = "Ingresar"; loginButton.disabled = false; }
}

async function handleLogout() {
    try { const { error } = await client.auth.signOut(); if (error) throw error; } 
    catch (error) { console.error("Error logging out:", error); showAlert("Error logout: " + error.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const showAddButton = document.getElementById('show-add-form-button');
    const cancelEditButton = document.getElementById('cancel-edit-button');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (obraForm) obraForm.addEventListener('submit', handleSubmit);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (showAddButton) showAddButton.addEventListener('click', showAddForm);
    if (cancelEditButton) cancelEditButton.addEventListener('click', () => showWorksList(false));
    if (searchInput) searchInput.addEventListener('input', handleSearchChange);
    if (saveOrderButton) saveOrderButton.addEventListener('click', saveOrder); 
    checkAuth(); 
});

client.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    if (event === 'SIGNED_IN') { checkAuth(); } // No reload, just check auth state
    else if (event === 'SIGNED_OUT') { currentWorks = []; currentPage = 0; allDataLoaded = false; isLoading = false; currentSearchQuery = ''; showLoginView(); showAlert("Sesión cerrada.", 'info'); }
});