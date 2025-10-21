// js/login.js

// Inicialización de Supabase
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

const loginForm = document.getElementById("login-form");
const alertDiv = document.getElementById("alert");

function showAlert(message, type = 'success') {
    if (!alertDiv) return;
    alertDiv.textContent = message;
    // Base classes + positioning
    alertDiv.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[1001] px-6 py-3 rounded-md shadow-lg text-sm font-medium transition-opacity duration-300 opacity-0 w-[90%] max-w-md'; 
    
    if (type === 'error') alertDiv.classList.add('bg-red-100', 'text-red-700');
    else alertDiv.classList.add('bg-green-100', 'text-green-700');
    
    alertDiv.classList.remove('hidden');
    void alertDiv.offsetWidth; // Force reflow
    alertDiv.classList.add('opacity-100');
    
    setTimeout(() => {
        alertDiv.classList.remove('opacity-100');
        setTimeout(() => alertDiv.classList.add('hidden'), 300); // Hide after fade out
    }, 4000); // Shorter duration for login alerts
}

// Redirect if already logged in
async function checkAuthAndRedirect() {
    try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            window.location.href = './admin.html'; // Redirect to admin if session exists
        }
    } catch (e) {
        console.error("Error checking session on login page:", e);
    }
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("login-email"); // Use updated ID if changed in HTML
    const passwordInput = document.getElementById("login-password"); // Use updated ID if changed in HTML
    const loginButton = document.getElementById("login-button");
    
    // Basic check if elements exist
    if (!emailInput || !passwordInput || !loginButton) {
        console.error("Login form elements not found!");
        return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;
    
    loginButton.textContent = "Accediendo...";
    loginButton.disabled = true;

    try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        // Don't show success here, rely on onAuthStateChange or checkAuthAndRedirect
        // showAlert("¡Acceso exitoso! Redirigiendo...", 'success'); 
        
        // Redirect immediately after successful sign-in attempt
        window.location.href = './admin.html'; 
        
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
        loginButton.textContent = "Acceder"; // Reset button text on error
        loginButton.disabled = false; // Re-enable button on error
    } 
    // No need to reset button on success because we redirect
});

// Check auth status when the page loads
document.addEventListener('DOMContentLoaded', checkAuthAndRedirect);