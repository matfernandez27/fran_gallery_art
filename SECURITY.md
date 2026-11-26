# Seguridad — qué hay que hacer (y en qué orden)

## ⚠️ Hallazgo crítico (auditoría de noviembre 2026)

Con la configuración anterior, **cualquier persona podía registrarse** usando la API key pública
(que está en el código, como en toda app web de Firebase) y, con esa cuenta de cualquier desconocido,
**editar o borrar todas las obras y subir archivos a Storage**. Se comprobó creando una cuenta de prueba
(luego eliminada, junto con los datos de prueba). Además el listado completo del bucket de Storage era público.

El código de este repositorio ya está corregido, pero **las reglas viven en Firebase**: hasta que las
despliegues, el agujero sigue abierto en producción.

## Pasos (hacelos en este orden: así no te bloqueás a vos mismo)

Necesitás **Node.js** instalado y una *clave de servicio* (solo la usás en tu computadora, nunca se sube):
Firebase Console → ⚙ Configuración del proyecto → *Cuentas de servicio* → **Generar nueva clave privada**.
Guardá el archivo como `firebase-key.json` en la raíz del proyecto (ya está en `.gitignore`).

1. **Revisá las cuentas existentes** y borrá las que no reconozcas:
   ```bash
   cd scripts/admin-tools && npm install
   node users.js list
   ```
   Para eliminar una: `node users.js delete <email>`.

2. **Dale permiso de administrador a tu cuenta** (la que usás en `admin.html`):
   ```bash
   node users.js make-admin tu-email@ejemplo.com
   ```

3. **Desplegá las reglas** (desde la raíz del proyecto):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage
   ```

4. **Cerrá sesión y volvé a entrar** en `admin.html` (para que el permiso se aplique). Probá guardar una obra.
   Si algo falla, el panel muestra el motivo; las reglas se pueden revertir desde Firebase Console → Firestore → Reglas.

5. **Restringí la API key** en Google Cloud Console → APIs y servicios → Credenciales → *Browser key*:
   - *Restricciones de aplicaciones* → Sitios web (HTTP referrers): tu dominio, `franfafgallery.firebaseapp.com/*` y `localhost` para desarrollo.
   - *Restricciones de API*: Identity Toolkit API, Token Service API, Cloud Firestore API, Cloud Storage for Firebase API.

6. **Presupuesto y alertas** (Facturación → Presupuestos y alertas): el sitio dejó de mostrar imágenes
   porque la cuenta de facturación se cerró. Una alerta de USD 5 avisa antes de que algo se corte o se dispare.

7. *(Opcional, recomendado)* Activá **Firebase App Check** y, si pasás a **Identity Platform**, desactivá el
   registro de usuarios (*Authentication → Configuración → Acciones del usuario → Habilitar creación*).
   Con el plan básico no se puede apagar el registro, pero con las reglas nuevas registrarse **no da ningún permiso**.

## Qué se mejoró en el código

| Área | Antes | Ahora |
|---|---|---|
| Permisos de escritura | Cualquier usuario registrado | Solo cuentas con permiso `admin` (reglas + panel) |
| Storage | Listado público, sin límites de tipo/tamaño | Sin listado, solo imágenes (WebP/JPEG/PNG/GIF/AVIF) < 15 MB, solo admin |
| Datos | Sin validación en el servidor | Esquema, tipos y largos validados en las reglas |
| XSS | Títulos y descripciones se insertaban como HTML | Todo se escapa; sin `onclick` inline |
| CSP | Ninguna (y scripts de terceros sin versión fija) | CSP estricta: sin scripts/estilos inline ni `eval`; solo Google/Firebase |
| Scripts de terceros | Tailwind (CDN sin versión), Panzoom, Sortable desde CDN | Tailwind compilado y librerías **dentro del repo** con versión fija |
| Encabezados | Ninguno | HSTS, `nosniff`, `X-Frame-Options`, `Permissions-Policy`, COOP (en `firebase.json`) |
| Sesión del panel | Sin controles | Se mantiene en ese navegador hasta "Cerrar sesión" (así aparece el menú oculto en el sitio); el panel la cierra solo a los 30 min sin actividad. **En una computadora compartida, cerrá sesión siempre.** |
| Login | Mensajes distintos según el error | Mensaje genérico; recuperación de clave sin revelar si el email existe |
| Archivos sensibles | CSV con todo el catálogo y scripts en la raíz publicada | Movidos a `scripts/` (excluido del hosting); sin claves en el código |
| Dependencias | 6 dependencias, casi todas sin uso (react, openrouter…) | Solo herramientas de compilación; `npm audit`: 0 vulnerabilidades |

## Riesgos conocidos que quedan (decisión tuya)

- **Los precios "ocultos" no son privados.** Si una obra tiene `show_price = false`, el sitio no muestra el precio,
  pero el campo `price` sigue en el documento y cualquiera puede leerlo consultando Firestore (hoy hay 4 obras con un precio cargado pero oculto).
  Si necesitás que sean realmente privados, hay que guardarlos en otra colección solo-admin. Puedo hacerlo.
- **Las imágenes migradas** (`https://storage.googleapis.com/...`) las sirve el bucket directamente: son públicas por diseño.
- **Si el sitio no se despliega con Firebase Hosting** (GitHub Pages, Netlify…), los encabezados de `firebase.json`
  no se aplican (la CSP sí, porque también está en cada HTML con `<meta>`). Replicalos en tu hosting.
- La clave `sb_publishable_…` de Supabase estuvo en el historial de git (`migrar_catalogo.py`). Es una clave pública,
  pero si ese proyecto de Supabase sigue activo, conviene rotarla o eliminar el proyecto.
