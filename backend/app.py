from flask import Flask
from flask_cors import CORS

from routes.owner import owner_bp
from routes.mechanic import mechanic_bp
from routes.admin import admin_bp

app = Flask(__name__)

# Allow frontend on 5001
CORS(
    app,
    resources={r"/*": {"origins": "http://localhost:5001"}},
    supports_credentials=True
)

app.register_blueprint(owner_bp, url_prefix="/owner")
app.register_blueprint(mechanic_bp, url_prefix="/mechanic")
app.register_blueprint(admin_bp, url_prefix="/admin")

@app.route("/")
def health():
    return {"status": "FixIt backend running"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)
