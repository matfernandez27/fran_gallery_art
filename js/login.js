// js/login.js

import { auth } from "../src/firebaseConfig.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Capturamos el formulario (asegurate de que tu <form> tenga este ID o ajustalo)
const loginForm = document.getElementById("login-form") || document.querySelector("form");

// Redirect if already logged in
function checkAuthAndRedirect() {
    // Firebase usa onAuthStateChanged para escuchar el estado de la sesión
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.href = './admin.html'; // Redirect to admin if session exists
        }
    });
}

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("login-email"); 
        const passwordInput = document.getElementById("login-password"); 
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
            // Reemplazamos Supabase por Firebase signInWithEmailAndPassword
            await signInWithEmailAndPassword(auth, email, password);
            
            // Redirect immediately after successful sign-in attempt
            window.location.href = './admin.html'; 
            
        } catch (error) {
            console.error("Error auth Firebase:", error);
            
            // Mantenemos tu alerta personalizada (con un fallback por si falla)
            if (typeof showAlert === "function") {
                showAlert(`Error: credenciales inválidas.`, 'error');
            } else {
                alert(`Error: credenciales inválidas.`);
            }
            
            loginButton.textContent = "Acceder"; // Reset button text on error
            loginButton.disabled = false; // Re-enable button on error
        } 
    });
} else {
    console.error("Login form not found in the DOM.");
}

// Check auth status when the page loads
document.addEventListener('DOMContentLoaded', checkAuthAndRedirect);