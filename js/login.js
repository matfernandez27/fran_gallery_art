// js/login.js

// Inicialización de Supabase
const supabaseUrl = window.supabaseUrl;
const supabaseAnonKey = window.supabaseAnonKey;
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

const loginForm = document.getElementById("login-form");
const alertDiv = document.getElementById("alert");

function showAlert(message, type = 'success') {
    alertDiv.textContent = message;
    alertDiv.classList.remove('hidden');
    alertDiv.classList.remove('bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');

    if (type === 'error') {
        alertDiv.classList.add('bg-red-100', 'text-red-700');
    } else {
        alertDiv.classList.add('bg-green-100', 'text-green-700');
    }
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

async function checkAuth() {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
        window.location.href = './admin.html';
    }
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const loginButton = document.getElementById("login-button");
    
    loginButton.textContent = "Accediendo...";
    loginButton.disabled = true;

    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
        showAlert(`Error de acceso: ${error.message}`, 'error');
    } else {
        showAlert("¡Acceso exitoso! Redirigiendo...", 'success');
        setTimeout(() => {
            window.location.href = './admin.html';
        }, 1000);
    }
    loginButton.textContent = "Acceder";
    loginButton.disabled = false;
});

document.addEventListener('DOMContentLoaded', checkAuth);