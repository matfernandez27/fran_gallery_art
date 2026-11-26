// Utilidades compartidas entre la galería pública y el panel de administración.
import { SITE } from './config.js';

/** Escapa texto para insertarlo de forma segura en HTML (previene XSS e HTML roto). */
export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/** Normaliza texto para comparar/buscar: sin tildes, minúsculas y sin espacios sobrantes. */
export function norm(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

/** Texto limpio (sin espacios al principio/final). */
export function clean(value) {
    return String(value ?? '').trim();
}

/** Primera letra en mayúscula. */
export function capitalize(value) {
    const s = clean(value);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatPrice(price, currency) {
    const n = Number(price);
    if (!n) return '';
    const symbol = currency === 'USD' ? 'U$D' : '$';
    return `${symbol} ${n.toLocaleString('es-AR')}`;
}

/** Enlace de WhatsApp con el mensaje correctamente codificado. */
export function whatsappLink(message = SITE.whatsappIntro) {
    return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Imagen de reemplazo (SVG embebido: no depende de ningún servidor externo). */
export const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
    '<rect width="400" height="500" fill="#efede8"/>' +
    '<g fill="none" stroke="#a8a396" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="150" y="205" width="100" height="80" rx="6"/><circle cx="178" cy="233" r="9"/>' +
    '<path d="M154 278l32-30 22 20 14-12 28 24"/></g>' +
    '<text x="200" y="330" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#8b8678">Imagen no disponible</text>' +
    '</svg>'
);

/** Lista de URLs de imágenes válidas de una obra (ignora entradas sin url). */
export function imageUrls(obra) {
    const list = Array.isArray(obra?.imagenes) ? obra.imagenes : [];
    return list.map((i) => i && i.url).filter((u) => typeof u === 'string' && u.trim() !== '');
}

/**
 * Si una imagen falla al cargar, prueba con las alternativas indicadas en
 * `data-fallbacks` (JSON) y, si ninguna carga, muestra la imagen de reemplazo.
 * Se instala una sola vez sobre un contenedor (los eventos "error" no burbujean,
 * por eso se usa la fase de captura).
 */
export function installImageFallback(root) {
    if (!root) return;
    root.addEventListener('error', (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || img.dataset.failed === '1') return;
        let rest = [];
        try { rest = JSON.parse(img.dataset.fallbacks || '[]'); } catch { rest = []; }
        const next = rest.shift();
        if (next) {
            img.dataset.fallbacks = JSON.stringify(rest);
            img.src = next;
        } else {
            img.dataset.failed = '1';
            img.src = PLACEHOLDER_IMG;
        }
    }, true);
}

/** Ordena obras: primero por `orden` manual, luego las más nuevas, luego por título. */
export function sortWorks(works) {
    return [...works].sort((a, b) => {
        const oA = Number.isFinite(a.orden) ? a.orden : 99999;
        const oB = Number.isFinite(b.orden) ? b.orden : 99999;
        if (oA !== oB) return oA - oB;
        const yA = Number(a.anio) || 0;
        const yB = Number(b.anio) || 0;
        if (yA !== yB) return yB - yA;
        return clean(a.titulo).localeCompare(clean(b.titulo), 'es');
    });
}

/** Ejecuta una promesa con un tiempo máximo de espera. */
export function withTimeout(promise, ms, message = 'Tiempo de espera agotado') {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
