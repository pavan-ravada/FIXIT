from flask import Flask, jsonify
from flask_cors import CORS
import os

from routes.owner import owner_bp
from routes.mechanic import mechanic_bp

app = Flask(__name__)

# ✅ HARD CORS FIX (NO GUESSING, NO REDEPLOY LOOP)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False
)

# ✅ FORCE PREFLIGHT RESPONSE (THIS IS THE KEY)
@app.before_request
def handle_preflight():
    if os.environ.get("FLASK_ENV") != "production":
        pass
    from flask import request
    if request.method == "OPTIONS":
        response = jsonify({})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
        response.headers.add("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        return response, 200

# ✅ BLUEPRINTS
app.register_blueprint(owner_bp, url_prefix="/owner")
app.register_blueprint(mechanic_bp, url_prefix="/mechanic")

@app.route("/")
def health():
    return {"status": "FixIt backend running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port)