from google.cloud import firestore
import os

# Point to your Firebase service account key
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "firebase_key.json"

# Create Firestore client
db = firestore.Client()

def get_db():
    return db
