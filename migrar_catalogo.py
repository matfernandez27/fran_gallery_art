import os
import requests
import subprocess
import time
from supabase import create_client, Client
import firebase_admin
from firebase_admin import credentials, firestore, storage

# ==========================================
# 1. CONFIGURACIÓN DE CREDENCIALES
# ==========================================
# Reemplazá con tus datos de Supabase
SUPABASE_URL = "https://railkoprsjevdyrxalfu.supabase.co"
SUPABASE_KEY = "sb_publishable_n54sFapzE11uFsHrI87n_A_qx5_8bPH"

# Inicializar Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Inicializar Firebase
# Asegurate de que firebase-key.json esté en la misma carpeta
cred = credentials.Certificate("firebase-key.json")
firebase_admin.initialize_app(cred, {
    'storageBucket': 'franfafgallery.firebasestorage.app'
})
db = firestore.client()
bucket = storage.bucket()

# Crear carpeta temporal para las descargas y conversiones
os.makedirs("temp_images", exist_ok=True)

# ==========================================
# 2. LÓGICA DE MIGRACIÓN
# ==========================================
def migrar_datos():
    print("Iniciando migración desde Supabase...")
    
    # Extraer todos los registros de la tabla productos
    respuesta = supabase.table("productos").select("*").execute()
    obras = respuesta.data
    
    if not obras:
        print("No se encontraron obras en Supabase.")
        return

    for obra in obras:
        print(f"\nProcesando obra: {obra.get('titulo', 'Sin título')} (ID: {obra.get('id')})")
        
        imagenes_firebase = []
        imagenes_supabase = obra.get("imagenes", [])
        
        # Procesar cada imagen de la obra
        for idx, img_data in enumerate(imagenes_supabase):
            path_supabase = img_data.get("path")
            if not path_supabase:
                continue
                
            # Obtener URL pública de Supabase
            url_publica = supabase.storage.from_("imagenes").get_public_url(path_supabase)
            
            # Nombres de archivos temporales
            ext_original = path_supabase.split('.')[-1] if '.' in path_supabase else 'jpg'
            temp_input = f"temp_images/temp_{obra['id']}_{idx}.{ext_original}"
            temp_output = f"temp_images/final_{obra['id']}_{idx}.webp"
            
            # Descargar imagen
            print(f"  -> Descargando imagen {idx + 1}...")
            req = requests.get(url_publica)
            with open(temp_input, 'wb') as f:
                f.write(req.content)
                
            # Convertir a WebP con ImageMagick
            print("  -> Convirtiendo a WebP...")
            subprocess.run(["magick", temp_input, "-quality", "80", temp_output], check=True)
            
            # Subir a Firebase Storage
            print("  -> Subiendo a Firebase Storage...")
            nuevo_path_firebase = f"obras/migracion_{obra['id']}_{int(time.time())}_{idx}.webp"
            blob = bucket.blob(nuevo_path_firebase)
            
            # Subir archivo y forzar el content-type a webp
            blob.upload_from_filename(temp_output, content_type="image/webp")
            blob.make_public()
            url_firebase = blob.public_url
            
            # Guardar la estructura de la imagen para el documento
            imagenes_firebase.append({
                "path": nuevo_path_firebase,
                "url": url_firebase,
                "name": f"migracion_{idx}.webp"
            })
            
            # Limpiar temporales
            os.remove(temp_input)
            os.remove(temp_output)
            
        # ==========================================
        # 3. CARGAR DOCUMENTO EN FIRESTORE
        # ==========================================
        # Mapear los datos respetando las propiedades originales
        nuevo_doc = {
            "titulo": obra.get("titulo"),
            "descripcion": obra.get("descripcion"),
            "anio": obra.get("anio"),
            "categoria": obra.get("categoria"),
            "serie": obra.get("serie"),
            "tecnica": obra.get("tecnica"),
            "medidas": obra.get("medidas"),
            "price": obra.get("price"),
            "is_available": obra.get("is_available", True),
            "show_price": obra.get("show_price", False),
            "orden": obra.get("orden", 0),
            "imagenes": imagenes_firebase,
            "migrado_el": firestore.SERVER_TIMESTAMP
        }
        
        # Guardar en la colección 'productos'
        db.collection("productos").add(nuevo_doc)
        print(f"✅ Obra guardada en Firestore con {len(imagenes_firebase)} imágenes.")

    print("\n🚀 ¡Migración completada con éxito!")

if __name__ == "__main__":
    migrar_datos()