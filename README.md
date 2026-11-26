# Galería de Francisco Fernández

Sitio web estático (HTML + JavaScript modular) con datos en **Firebase** (Firestore para las obras,
Storage para las imágenes, Authentication para el panel). Estilos con **Tailwind CSS** compilado localmente.

> 🔐 **Antes que nada, leé [SECURITY.md](SECURITY.md)**: hay pasos de seguridad que solo se pueden hacer desde tu cuenta de Firebase.

## Estructura

```
index.html                  Galería pública (carrusel, filtros, visor con zoom)
biografia-completa.html     Biografía
admin.html                  Panel de administración (login integrado)
login.html                  Redirige a admin.html (versión anterior)
404.html                    Página de error
js/main.js                  Lógica de la galería pública
js/admin.js                 Lógica del panel
js/utils.js, js/config.js   Utilidades y configuración (WhatsApp, tamaño de página…)
src/firebaseConfig.js       Inicialización de Firebase
css/tailwind.css            ← generado (npm run build:css). No se edita a mano
css/site.css, css/admin.css Estilos propios
vendor/                     Panzoom y Sortable (versión fija, copiadas con `npm run vendor`)
firestore.rules, storage.rules, firebase.json   Seguridad y hosting
scripts/admin-tools/        Alta/baja de administradores y auditoría de cuentas
scripts/legacy/             Scripts de migraciones antiguas (no forman parte del sitio)
tests/rules/                Pruebas de las reglas de seguridad (emulador de Firebase)
```

## Desarrollo local

```bash
npm install            # una sola vez
npm run build:css      # recompila Tailwind (hacelo cada vez que cambies clases en HTML/JS)
npm run serve          # http://localhost:8000
```

> Si agregás o cambiás clases de Tailwind en los HTML o en `js/*.js`, volvé a correr `npm run build:css`
> y subí también `css/tailwind.css`.

## Datos de una obra (colección `productos`)

`titulo`, `descripcion`, `tecnica`, `medidas`, `anio`, `categoria`, `serie`, `price`, `currency` (`ARS`/`USD`),
`is_available` (si es `false` se muestra "Privada"), `show_price`, `orden` (menor = aparece antes) e
`imagenes: [{ path, url, name }]` (la primera es la portada).

## Panel de administración

Entrá a `/admin.html` con una cuenta que tenga permiso de administrador (ver SECURITY.md).

- **Reordenar:** arrastrá el ícono ≡ y tocá *Guardar orden*. *↑ Inicio* manda una obra al principio.
- **Imágenes:** arrastrá para cambiar la portada, ⟳ rota, ✕ quita. Las nuevas se optimizan solas (WebP, máx. 2400 px).
- **Revisar imágenes:** comprueba todas las imágenes y marca con ⚠ las obras que tienen archivos que ya no existen.
- Las obras nuevas aparecen **primero** en el sitio.

## Despliegue (Firebase Hosting)

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting            # el sitio
npx firebase-tools deploy --only firestore:rules,storage   # las reglas (ver SECURITY.md)
```

`firebase.json` excluye del hosting `scripts/`, `node_modules`, los `*.rules` y archivos de configuración.

## Pruebas

```bash
cd tests/rules && npm install && npm test
```
Levanta el emulador de Firebase (necesita Java) y verifica 31 casos: quién puede leer/crear/editar/borrar
en Firestore y Storage. **No toca producción.**
