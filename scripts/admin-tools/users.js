#!/usr/bin/env node
/**
 * Herramienta para administrar las cuentas del panel (Firebase Authentication).
 * Se ejecuta en TU computadora con una clave de servicio. NO se sube al sitio ni al repositorio.
 *
 * Preparación (una sola vez):
 *   1. Firebase Console > Configuración del proyecto > Cuentas de servicio > "Generar nueva clave privada".
 *   2. Guardá el archivo como  firebase-key.json  en la raíz del proyecto (está en .gitignore).
 *   3. cd scripts/admin-tools && npm install
 *
 * Uso:
 *   node users.js list                     Lista todas las cuentas (para detectar registros ajenos)
 *   node users.js make-admin  <email>      Da permiso de administrador a una cuenta
 *   node users.js remove-admin <email>     Quita el permiso de administrador
 *   node users.js disable <email>          Deshabilita una cuenta (no puede iniciar sesión)
 *   node users.js delete  <email>          Elimina una cuenta
 *
 * Después de make-admin, cerrá sesión y volvé a entrar en el panel para que el permiso se aplique.
 */
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', '..', 'firebase-key.json');
if (!fs.existsSync(keyPath)) {
    console.error(`No se encontró la clave de servicio en: ${keyPath}\nLeé las instrucciones al inicio de este archivo.`);
    process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const auth = admin.auth();

async function listAll() {
    let token;
    const rows = [];
    do {
        const page = await auth.listUsers(1000, token);
        rows.push(...page.users);
        token = page.pageToken;
    } while (token);
    rows.sort((a, b) => new Date(b.metadata.creationTime) - new Date(a.metadata.creationTime));
    console.log(`Total de cuentas: ${rows.length}\n`);
    for (const u of rows) {
        console.log([
            u.customClaims?.admin ? 'ADMIN ' : '      ',
            u.disabled ? 'DESHABILITADA' : 'activa       ',
            (u.email || '(sin email)').padEnd(38),
            'creada ' + u.metadata.creationTime.slice(0, 16),
            '| último acceso ' + (u.metadata.lastSignInTime || 'nunca').slice(0, 16),
            '|', u.uid,
        ].join(' '));
    }
    console.log('\nSi ves cuentas que no reconocés (sobre todo creadas sin que vos las hayas hecho), deshabilitalas o eliminalas con "disable" / "delete".');
}

async function main() {
    const [cmd, email] = process.argv.slice(2);
    if (cmd === 'list') return listAll();
    if (!['make-admin', 'remove-admin', 'disable', 'delete'].includes(cmd) || !email) {
        console.error('Uso: node users.js list | make-admin <email> | remove-admin <email> | disable <email> | delete <email>');
        process.exit(1);
    }
    const user = await auth.getUserByEmail(email);
    if (cmd === 'make-admin') { await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true }); console.log(`Listo: ${email} ahora es administrador. Que cierre sesión y vuelva a entrar.`); }
    if (cmd === 'remove-admin') { const c = { ...(user.customClaims || {}) }; delete c.admin; await auth.setCustomUserClaims(user.uid, c); await auth.revokeRefreshTokens(user.uid); console.log(`Listo: ${email} ya no es administrador.`); }
    if (cmd === 'disable') { await auth.updateUser(user.uid, { disabled: true }); await auth.revokeRefreshTokens(user.uid); console.log(`Listo: ${email} deshabilitada.`); }
    if (cmd === 'delete') { await auth.deleteUser(user.uid); console.log(`Listo: ${email} eliminada.`); }
}
main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
