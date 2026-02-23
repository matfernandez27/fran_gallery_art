// Importamos la conexión a la base de datos y las herramientas de Firestore
import { db } from "../src/firebaseConfig.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Capturamos el contenedor donde se van a mostrar las obras.
// IMPORTANTE: Asegurate de tener un <div id="contenedor-obras"></div> en tu index.html
const contenedor = document.getElementById("contenedor-obras");

// Función para traer y mostrar las obras
async function cargarObras() {
  try {
    // 2. Apuntamos a tu Collection en Firestore (ajustá "obras" si tu tabla se llamaba distinto)
    const obrasRef = collection(db, "obras"); 
    const snapshot = await getDocs(obrasRef);
    
    // 3. Limpiamos el contenedor (ideal por si tenés un texto de "Cargando..." en el HTML)
    if (contenedor) {
        contenedor.innerHTML = "";
    }
    
    // 4. Recorremos cada documento (cada fila de tu CSV migrado)
    snapshot.forEach((doc) => {
      const obra = doc.data();
      console.log("Obra cargada:", obra); // Para que revises en la consola que llegan bien los datos
      
      // 5. Armamos la tarjeta HTML. 
      // Ajustá "obra.titulo", "obra.precio", etc., para que coincidan EXACTO con los nombres de tus columnas del CSV.
      const tarjetaHTML = `
        <div class="tarjeta-obra">
          <img src="${obra.imagen || ''}" alt="${obra.titulo || 'Obra'}" style="width: 100%; border-radius: 8px;">
          <h3>${obra.titulo || 'Sin título'}</h3>
          <p>Precio: $${obra.precio || 'Consultar'}</p>
        </div>
      `;
      
      // 6. Inyectamos la tarjeta en el HTML
      if (contenedor) {
          contenedor.innerHTML += tarjetaHTML;
      }
    });

  } catch (error) {
    console.error("Error al cargar las obras de Firebase:", error);
  }
}

// Ejecutamos la función al cargar la página
cargarObras();