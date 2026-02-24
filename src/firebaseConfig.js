import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ... aquí sigue tu configuración normal con las keys

const firebaseConfig = {
  apiKey: "AIzaSyB5jPmfbrY0U6bEX_Wp5JUVO7Cgn1udWpA",
  authDomain: "franfafgallery.firebaseapp.com",
  projectId: "franfafgallery",
  storageBucket: "franfafgallery.firebasestorage.app",
  messagingSenderId: "169862029969",
  appId: "1:169862029969:web:f9ac670bcf77e09d53d530",
  measurementId: "G-7EJY7X2T16"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);