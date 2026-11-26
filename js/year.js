// Año actual en el pie de página (archivo aparte para poder usar una CSP sin scripts inline).
const el = document.getElementById('year');
if (el) el.textContent = new Date().getFullYear();
