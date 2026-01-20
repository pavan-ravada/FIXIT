from flask import Flask
import os
from flask_cors import CORS

from routes.owner import owner_bp
from routes.mechanic import mechanic_bp

app = Flask(__name__)

# ✅ GLOBAL CORS (THIS FIXES ALL PREFLIGHT ISSUES)
CORS(
    app,
    resources={r"/*": {
        "origins": [
            "http://localhost:5001",
            "https://stellar-blancmange-5a0020.netlify.app"
        ]
    }},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
)

# ✅ BLUEPRINTS
app.register_blueprint(owner_bp, url_prefix="/owner")
app.register_blueprint(mechanic_bp, url_prefix="/mechanic")

@app.route("/")
def health():
    return {"status": "FixIt backend running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port)