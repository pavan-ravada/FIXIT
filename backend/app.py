from flask import Flask
import os
from flask_cors import CORS

from routes.owner import owner_bp
from routes.mechanic import mechanic_bp
from routes.admin import admin_bp

app = Flask(__name__)

# Allow frontend on 5001
from flask_cors import CORS

CORS(
    app,
    origins=[
        "http://localhost:5001",
        "http://chimerical-dasik-6feae3.netlify.app/"
    ],
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
)


app.register_blueprint(owner_bp, url_prefix="/owner")
app.register_blueprint(mechanic_bp, url_prefix="/mechanic")
app.register_blueprint(admin_bp, url_prefix="/admin")

@app.route("/")
def health():
    return {"status": "FixIt backend running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port)