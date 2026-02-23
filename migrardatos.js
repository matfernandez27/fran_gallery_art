const admin = require("firebase-admin");
const fs = require("fs");
const csv = require("csv-parser");

// 1. Conectamos con tus credenciales
const serviceAccount = require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 2. Definimos de qué archivo CSV vamos a leer y a qué Collection va
const nombreArchivoCSV = "productos_rows.csv"; // <-- CAMBIÁ ESTO por el nombre de tu archivo descargado
const nombreCollection = "obras"; // <-- La Collection que creamos antes en Firestore

console.log("Iniciando la migración...");

// 3. Leemos el CSV y subimos cada fila a Firestore
fs.createReadStream(nombreArchivoCSV)
  .pipe(csv())
  .on("data", async (row) => {
    try {
      // Creamos un nuevo Document en la Collection por cada fila del CSV
      await db.collection(nombreCollection).add(row);
      console.log(`Subiendo documento...`);
    } catch (error) {
      console.error("Error al subir el documento:", error);
    }
  })
  .on("end", () => {
    console.log("¡La lectura del archivo CSV terminó! Esperá unos segundos a que finalicen las subidas.");
  });