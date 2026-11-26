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
La sesión queda abierta en ese navegador hasta que toques *Cerrar sesión*.

- **Orden de las obras:** el número `#N` de cada fila es su posición en el sitio. Se cambia de tres formas:
  arrastrando el ícono ≡ (y *Guardar orden*), con *↑ Inicio*, o con el campo **Posición en el sitio** del formulario
  (1 = primera; las demás se corren solas).
- **Fotos de cada obra** (en el formulario): todas en una sola grilla. La **primera es la portada**.
  Arrastrá una foto o usá ◀ ▶ para moverla, ★ para hacerla portada, ⟳ para rotarla, ✕ para quitarla.
  Para agregar, arrastrá archivos a la zona punteada o tocala (varias a la vez). Las nuevas se optimizan solas
  (WebP, máx. 2400 px). Nada se aplica hasta que guardás; *Cancelar* descarta todo.
- **Obras nuevas:** aparecen **primeras** en el sitio (y en el carrusel). Después podés cambiarles la posición.
- **Revisar imágenes:** comprueba todas las fotos y marca con ⚠ las obras con archivos que ya no existen.

### Menú oculto del administrador en el sitio

Si abrís el sitio con la sesión de administrador iniciada, arriba aparece una barra que **los visitantes no ven**:

| Botón | Qué hace |
|---|---|
| **Panel** | Va al panel de administración |
| **Editar orden** | Muestra todas las obras con un asa para arrastrarlas; *Guardar orden* (barra fija abajo) lo publica |
| **Ocultar precios** | Modo presentación: oculta los precios solo en tu navegador (no cambia nada para los demás) |
| **Cerrar sesión** | Cierra la sesión de administrador |

Además, cada obra muestra un botón **✎ Editar** que abre directamente esa obra en el panel.

## Experiencia del visitante

Filtros por categoría (chips), serie y "solo obras disponibles", con enlaces compartibles (`?cat=pintura&disp=1`);
visor con zoom (rueda, botones, doble clic/doble toque), cambio de foto con flechas o deslizando, navegación entre obras,
botón de compartir (con enlace directo `#obra/<id>`), consulta por WhatsApp con el enlace de la obra incluido,
menú móvil, botón "volver arriba" y carga con fundido suave.

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
