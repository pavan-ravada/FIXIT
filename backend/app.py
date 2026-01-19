from flask import Flask
from flask_cors import CORS
import os

from routes.owner import owner_bp
from routes.mechanic import mechanic_bp

app = Flask(__name__)

<<<<<<< HEAD
# Allow frontend on 5001
from flask_cors import CORS

from flask_cors import CORS

CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True
=======
# ✅ GLOBAL CORS
CORS(
    app,
    resources={r"/*": {
        "origins": [
            "http://localhost:5001",
            "https://chimerical-dasik-6feae3.netlify.app"
        ]
    }},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
>>>>>>> e242dfc (Deploy public FIXIT app without admin (admin local only))
)

# ✅ ONLY PUBLIC BLUEPRINTS
app.register_blueprint(owner_bp, url_prefix="/owner")
app.register_blueprint(mechanic_bp, url_prefix="/mechanic")

@app.route("/")
def health():
    return {"status": "FixIt backend running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port)