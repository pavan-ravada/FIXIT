from flask import Blueprint, jsonify,request
from firebase import get_db
from datetime import datetime

admin_bp = Blueprint("admin", __name__)
db = get_db()

# -----------------------------
# ADMIN LOGIN
# -----------------------------
@admin_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    phone = data.get("phone")
    password = data.get("password")

    if not phone or not password:
        return jsonify({"error": "Phone and password required"}), 400

    docs = (
        db.collection("admins")
        .where("phone", "==", phone)
        .limit(1)
        .get()
    )

    if not docs:
        return jsonify({"error": "Admin not found"}), 404

    admin = docs[0].to_dict()

    if admin.get("password") != password:
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({
        "message": "Admin login successful",
        "admin_phone": phone
    }), 200

# -----------------------------
# 1️⃣ GET PENDING MECHANICS
# -----------------------------
@admin_bp.route("/mechanics/pending", methods=["GET"])
def get_pending_mechanics():
    docs = (
        db.collection("mechanics")
        .where("verified", "==", False)
        .get()
    )

    pending = []
    for d in docs:
        m = d.to_dict()
        pending.append({
            "phone": m.get("phone"),
            "name": m.get("name"),
            "created_at": m.get("created_at")
        })

    return jsonify({
        "pending_mechanics": pending
    }), 200


# -----------------------------
# 2️⃣ VERIFY MECHANIC (EXISTS)
# -----------------------------
@admin_bp.route("/verify-mechanic/<mechanic_phone>", methods=["POST"])
def verify_mechanic(mechanic_phone):
    docs = (
        db.collection("mechanics")
        .where("phone", "==", mechanic_phone)
        .limit(1)
        .get()
    )

    if not docs:
        return jsonify({"error": "Mechanic not found"}), 404

    docs[0].reference.update({
        "verified": True,
        "is_available": False
    })

    return jsonify({
        "message": "Mechanic verified successfully",
        "mechanic_phone": mechanic_phone
    }), 200


# -----------------------------
# 3️⃣ REJECT / DELETE MECHANIC
# -----------------------------
@admin_bp.route("/reject-mechanic/<mechanic_phone>", methods=["POST"])
def reject_mechanic(mechanic_phone):
    docs = (
        db.collection("mechanics")
        .where("phone", "==", mechanic_phone)
        .limit(1)
        .get()
    )

    if not docs:
        return jsonify({"error": "Mechanic not found"}), 404

    docs[0].reference.delete()

    return jsonify({
        "message": "Mechanic rejected and removed",
        "mechanic_phone": mechanic_phone
    }), 200


# -----------------------------
# 4️⃣ VIEW ALL MECHANICS
# -----------------------------
@admin_bp.route("/mechanics", methods=["GET"])
def get_all_mechanics():
    docs = db.collection("mechanics").get()

    mechanics = []
    for d in docs:
        m = d.to_dict()
        mechanics.append({
            "phone": m.get("phone"),
            "name": m.get("name"),
            "verified": m.get("verified"),
            "is_available": m.get("is_available"),
            "active_request_id": m.get("active_request_id")
        })

    return jsonify({
        "mechanics": mechanics
    }), 200


# -----------------------------
# 5️⃣ VIEW ALL REQUESTS (MONITORING)
# -----------------------------
@admin_bp.route("/requests", methods=["GET"])
def get_all_requests():
    docs = db.collection("requests").order_by(
        "created_at", direction="DESCENDING"
    ).get()

    requests = []
    for d in docs:
        r = d.to_dict()
        requests.append({
            "request_id": d.id,
            "owner_phone": r.get("owner_phone"),
            "mechanic_phone": r.get("mechanic_phone"),
            "vehicle_type": r.get("vehicle_type"),
            "service_type": r.get("service_type"),
            "status": r.get("status"),
            "created_at": r.get("created_at")
        })

    return jsonify({
        "requests": requests
    }), 200


