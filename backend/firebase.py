import os
import json
from google.cloud import firestore
from google.oauth2 import service_account

def get_db():
    firebase_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")

    if not firebase_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT env variable not set")

    creds_dict = json.loads(firebase_json)
    credentials = service_account.Credentials.from_service_account_info(creds_dict)

    return firestore.Client(credentials=credentials, project=creds_dict["project_id"])