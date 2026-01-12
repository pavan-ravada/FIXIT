from google.cloud import firestore
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_PATH = os.path.join(BASE_DIR, "firebase_key.json")

def get_db():
    return firestore.Client.from_service_account_json(KEY_PATH)
