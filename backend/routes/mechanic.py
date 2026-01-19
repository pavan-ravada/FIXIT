from flask import Blueprint, request, jsonify
from firebase import get_db
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import random
from google.cloud import firestore
from utils.request_logic import maybe_expand_radius
from math import radians, cos, sin, asin, sqrt


mechanic_bp = Blueprint("mechanic", __name__)
db = get_db()

# -----------------------------
# MECHANIC REGISTRATION
# -----------------------------
@mechanic_bp.route("/register", methods=["POST"])
def mechanic_register():
    data = request.get_json()

    name = data.get("name")
    phone = data.get("phone")
    password = data.get("password")
    confirm_password = data.get("confirm_password")

    vehicle_types = data.get("vehicle_types")
    service_types = data.get("service_types")

    if not all([name, phone, password, confirm_password]):
        return jsonify({"error": "All fields are required"}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    if not vehicle_types or not service_types:
        return jsonify({
            "error": "Vehicle types and service types are required"
        }), 400

    if not isinstance(vehicle_types, list) or not isinstance(service_types, list):
        return jsonify({
            "error": "Vehicle types and service types must be arrays"
        }), 400

    # Validate vehicle types
    valid_vehicles = ["BIKE", "CAR", "AUTO", "BUS", "LORRY"]
    normalized_vehicles = [v.upper() for v in vehicle_types]
    invalid_vehicles = [v for v in normalized_vehicles if v not in valid_vehicles]
    if invalid_vehicles:
        return jsonify({
            "error": f"Invalid vehicle types: {invalid_vehicles}. Must be one of: {', '.join(valid_vehicles)}"
        }), 400

    # Validate service types
    valid_services = ["PUNCTURE", "BATTERY", "ENGINE", "TRANSMISSION", "LIGHTS", "BRAKE"]
    normalized_services = [s.upper() for s in service_types]
    invalid_services = [s for s in normalized_services if s not in valid_services]
    if invalid_services:
        return jsonify({
            "error": f"Invalid service types: {invalid_services}. Must be one of: {', '.join(valid_services)}"
        }), 400

    mechanics_ref = db.collection("mechanics")
    existing = mechanics_ref.where("phone", "==", phone).limit(1).get()

    if existing:
        return jsonify({"error": "Mechanic already exists"}), 409

    mechanics_ref.add({
        "name": name,
        "phone": phone,
        "password_hash": generate_password_hash(password),

        "verified": False,
        "is_available": False,

        # ✅ STORE SKILLS FROM FRONTEND (normalized to uppercase)
        "skills": {
            "vehicle_types": normalized_vehicles,
            "service_types": normalized_services
        },

        "location": None,
        "active_request_id": None,
        "created_at": datetime.utcnow()
    })

    return jsonify({
        "message": "Mechanic registered. Awaiting admin verification."
    }), 201



# -----------------------------
# MECHANIC LOGIN
# -----------------------------
@mechanic_bp.route("/login", methods=["POST"])
def mechanic_login():
    data = request.get_json()

    phone = data.get("phone")
    password = data.get("password")

    if not phone or not password:
        return jsonify({"error": "Phone and password required"}), 400

    mechanics_ref = db.collection("mechanics")
    docs = mechanics_ref.where("phone", "==", phone).limit(1).get()

    if not docs:
        return jsonify({"error": "Mechanic not found"}), 404

    mechanic_doc = docs[0]
    mechanic = mechanic_doc.to_dict()

    if not check_password_hash(mechanic["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    if not mechanic["verified"]:
        return jsonify({
            "error": "Mechanic not verified by admin"
        }), 403

    return jsonify({
        "message": "Login successful",
        "mechanic_phone": phone
    }), 200

# -----------------------------
# TOGGLE MECHANIC AVAILABILITY
# -----------------------------
@mechanic_bp.route("/availability", methods=["POST"])
def toggle_availability():
    data = request.get_json()

    phone = data.get("phone")
    is_available = data.get("is_available")
    lat = data.get("lat")
    lng = data.get("lng")

    if phone is None or is_available is None:
        return jsonify({"error": "Phone and availability required"}), 400

    mechanics_ref = db.collection("mechanics")
    docs = mechanics_ref.where("phone", "==", phone).limit(1).get()

    if not docs:
        return jsonify({"error": "Mechanic not found"}), 404

    mechanic_doc = docs[0]
    mechanic = mechanic_doc.to_dict()

    if not mechanic.get("verified"):
        return jsonify({"error": "Mechanic not verified"}), 403

    update_data = {
        "is_available": is_available
    }

    # ✅ If mechanic goes ONLINE, store location
    if is_available:
        if lat is None or lng is None:
            return jsonify({
                "error": "Location required to go online"
            }), 400

        update_data["location"] = {
            "lat": lat,
            "lng": lng,
            "updated_at": firestore.SERVER_TIMESTAMP
        }

    mechanic_doc.reference.update(update_data)

    return jsonify({
        "message": "Availability updated",
        "is_available": is_available
    }), 200

# Utility: distance between two lat/lng points (km)
def haversine(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return 6371 * c  # km


# -----------------------------
# FETCH NEARBY REQUESTS
# -----------------------------

@mechanic_bp.route("/requests", methods=["GET"])
def fetch_nearby_requests():
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "Phone required"}), 400

    # Fetch mechanic
    mech_docs = (
        db.collection("mechanics")
        .where("phone", "==", phone)
        .limit(1)
        .get()
    )

    if not mech_docs:
        return jsonify({"error": "Mechanic not found"}), 404

    mechanic = mech_docs[0].to_dict()

    # Eligibility checks
    if not mechanic.get("verified") or not mechanic.get("is_available"):
        return jsonify({"error": "Mechanic not eligible"}), 403

    mech_loc = mechanic.get("location")
    if not mech_loc:
        return jsonify({"error": "Mechanic location not set"}), 400

    # ✅ READ & NORMALIZE SKILLS (CORE FIX)
    skills = mechanic.get("skills", {})

    vehicle_types = [
        v.upper() for v in skills.get("vehicle_types", [])
    ]

    service_types = [
        s.upper() for s in skills.get("service_types", [])
    ]

    if not vehicle_types or not service_types:
        return jsonify({
            "error": "Mechanic skills not configured"
        }), 400

    results = []

    # Fetch all SEARCHING requests
    req_docs = (
        db.collection("requests")
        .where("status", "==", "SEARCHING")
        .get()
    )

    for doc in req_docs:
        req = doc.to_dict()

        # 🔁 Auto-timeout + radius expansion
        maybe_expand_radius(doc.reference, req)

        # Re-fetch updated request
        req = doc.reference.get().to_dict()
        if req.get("status") != "SEARCHING":
            continue

        owner_loc = req.get("owner_location")
        if not owner_loc:
            continue

        # ✅ NORMALIZE REQUEST VALUES
        req_vehicle = req.get("vehicle_type", "").upper()
        req_service = req.get("service_type", "").upper()

        # ✅ SKILL MATCH (CASE SAFE)
        if req_vehicle not in vehicle_types:
            continue

        if req_service not in service_types:
            continue

        # Distance check
        distance = haversine(
            mech_loc["lat"], mech_loc["lng"],
            owner_loc["lat"], owner_loc["lng"]
        )

        if distance <= req.get("search_radius_km", 3):
            results.append({
                "request_id": doc.id,
                "vehicle_type": req.get("vehicle_type"),
                "service_type": req.get("service_type"),
                "distance_km": round(distance, 2),
                "issue_description": req.get("description", "")
            })

    return jsonify({"requests": results}), 200




# -----------------------------
# ACCEPT REQUEST
# -----------------------------
@mechanic_bp.route("/accept/<request_id>", methods=["POST"])
def accept_request(request_id):
    data = request.get_json()
    phone = data.get("phone")

    if not phone:
        return jsonify({"error": "Mechanic phone required"}), 400

    # Fetch mechanic
    mechanics_ref = db.collection("mechanics")
    mech_docs = mechanics_ref.where("phone", "==", phone).limit(1).get()

    if not mech_docs:
        return jsonify({"error": "Mechanic not found"}), 404

    mechanic_doc = mech_docs[0]
    mechanic = mechanic_doc.to_dict()

    if not mechanic.get("verified") or not mechanic.get("is_available"):
        return jsonify({"error": "Mechanic not eligible"}), 403

    if mechanic.get("active_request_id"):
        return jsonify({"error": "Mechanic already has an active job"}), 409

    # Fetch request
    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return jsonify({"error": "Request not found"}), 404

    req = req_doc.to_dict()

    if req.get("status") != "SEARCHING":
        return jsonify({
            "error": f"Request cannot be accepted. Current status: {req.get('status')}"
        }), 409

    # 🔐 Generate OTP
    otp = str(random.randint(100000, 999999))

    # ✅ UPDATE REQUEST (LOCK IT)
    req_ref.update({
        "mechanic_phone": phone,
        "status": "ACCEPTED",
        "otp": otp,
        "otp_verified": False,
        "accepted_at": datetime.utcnow()
    })

    # ✅ UPDATE MECHANIC
    mechanic_doc.reference.update({
        "active_request_id": request_id,
        "is_available": False
    })

    # 🔥🔥🔥 CRITICAL FIX (STEP 4) 🔥🔥🔥
    # ✅ SYNC OWNER ACTIVE REQUEST
    owner_phone = req.get("owner_phone")

    owner_docs = (
        db.collection("owners")
        .where("phone", "==", owner_phone)
        .limit(1)
        .get()
    )

    if owner_docs:
        owner_docs[0].reference.update({
            "active_request_id": request_id
        })

    return jsonify({
        "message": "Request accepted",
        "request_id": request_id,
        "otp": otp,          # OTP stays valid until verified
        "otp_generated": True
    }), 200



# -----------------------------
# MECHANIC JOB HISTORY
# -----------------------------
@mechanic_bp.route("/jobs/history", methods=["GET"])
def mechanic_history():
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "Phone required"}), 400

    reqs = (
        db.collection("requests")
        .where("mechanic_phone", "==", phone)
        .where("status", "==", "COMPLETED")
        .order_by("completed_at", direction="DESCENDING")
        .get()
    )

    history = []
    for d in reqs:
        r = d.to_dict()
        history.append({
            "request_id": d.id,
            "vehicle_type": r.get("vehicle_type"),
            "service_type": r.get("service_type"),
            "rating": r.get("rating"),
            "feedback": r.get("feedback"),
            "completed_at": r.get("completed_at")
        })

    return jsonify({"history": history}), 200

#UPDATE-LOCATION
@mechanic_bp.route("/update-location", methods=["POST"])
def update_location():
    data = request.get_json()

    request_id = data.get("request_id")
    phone = data.get("phone")
    lat = data.get("lat")
    lng = data.get("lng")

    if not request_id or not phone or lat is None or lng is None:
        return jsonify({"error": "Missing fields"}), 400

    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return jsonify({"error": "Request not found"}), 404

    req = req_doc.to_dict()

    # 🔐 Only assigned mechanic can update location
    if req.get("mechanic_phone") != phone:
        return jsonify({"error": "Unauthorized mechanic"}), 403

    # ✅ TRACKING ALLOWED BEFORE & AFTER OTP
    if req.get("status") not in ["ACCEPTED", "IN_PROGRESS"]:
        return jsonify({"error": "Tracking not allowed"}), 403

    # ✅ UPDATE ONLY LOCATION (NO STATUS CHANGE)
    req_ref.update({
        "mechanic_location": {
            "lat": lat,
            "lng": lng,
            "updated_at": datetime.utcnow().isoformat()
        }
    })

    return jsonify({"message": "Location updated"}), 200


#LOGOUT
@mechanic_bp.route("/logout", methods=["POST"])
def mechanic_logout():
    data = request.get_json()
    phone = data.get("phone")

    if not phone:
        return jsonify({"error": "Phone required"}), 400

    docs = db.collection("mechanics").where("phone", "==", phone).limit(1).get()
    if not docs:
        return jsonify({"error": "Mechanic not found"}), 404

    mechanic_doc = docs[0]
    mechanic = mechanic_doc.to_dict()

    # ❌ Block logout if active job exists
    if mechanic.get("active_request_id"):
        return jsonify({
            "error": "Cannot logout during active job"
        }), 409

    # Make mechanic unavailable
    mechanic_doc.reference.update({
        "is_available": False
    })

    return jsonify({
        "message": "Mechanic logged out successfully"
    }), 200


@mechanic_bp.route("/configure", methods=["POST"])
def configure_mechanic():
    data = request.get_json()

    phone = data.get("phone")
    vehicle_types = data.get("vehicle_types")
    service_types = data.get("service_types")

    # Basic validation
    if not phone or not vehicle_types or not service_types:
        return jsonify({
            "error": "Phone, vehicle_types and service_types are required"
        }), 400

    if not isinstance(vehicle_types, list) or not isinstance(service_types, list):
        return jsonify({
            "error": "vehicle_types and service_types must be arrays"
        }), 400

    # Validate vehicle types
    valid_vehicles = ["BIKE", "CAR", "AUTO", "BUS", "LORRY"]
    normalized_vehicles = [v.upper() for v in vehicle_types]
    invalid_vehicles = [v for v in normalized_vehicles if v not in valid_vehicles]
    if invalid_vehicles:
        return jsonify({
            "error": f"Invalid vehicle types: {invalid_vehicles}. Must be one of: {', '.join(valid_vehicles)}"
        }), 400

    # Validate service types
    valid_services = ["PUNCTURE", "BATTERY", "ENGINE", "TRANSMISSION", "LIGHTS", "BRAKE"]
    normalized_services = [s.upper() for s in service_types]
    invalid_services = [s for s in normalized_services if s not in valid_services]
    if invalid_services:
        return jsonify({
            "error": f"Invalid service types: {invalid_services}. Must be one of: {', '.join(valid_services)}"
        }), 400

    # Fetch mechanic
    mech_docs = (
        db.collection("mechanics")
        .where("phone", "==", phone)
        .limit(1)
        .get()
    )

    if not mech_docs:
        return jsonify({"error": "Mechanic not found"}), 404

    mechanic_doc = mech_docs[0]

    # Update skills (normalized to uppercase)
    mechanic_doc.reference.update({
        "skills": {
            "vehicle_types": normalized_vehicles,
            "service_types": normalized_services
        }
    })

    return jsonify({
        "message": "Mechanic configuration updated successfully",
        "skills": {
            "vehicle_types": normalized_vehicles,
            "service_types": normalized_services
        }
    }), 200

@mechanic_bp.route("/request/<request_id>", methods=["GET"])
def get_mechanic_request_status(request_id):
    phone = request.args.get("phone")

    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return {"error": "Request not found"}, 404

    req = req_doc.to_dict()

    if req.get("mechanic_phone") != phone:
        return {"error": "Unauthorized"}, 403

    owner_data = None
    if req.get("owner_phone"):
        owner_docs = (
            db.collection("owners")
            .where("phone", "==", req["owner_phone"])
            .limit(1)
            .get()
        )
        if owner_docs:
            o = owner_docs[0].to_dict()
            owner_data = {
                "name": o.get("name"),
                "phone": o.get("phone")
            }

    return {
        "request_id": request_id,
        "status": req.get("status"),
        "otp": req.get("otp"),
        "otp_verified": req.get("otp_verified"),

        # 🔥 THESE TWO ARE REQUIRED FOR MAP
        "ownerLocation": req.get("owner_location"),
        "mechanicLocation": req.get("mechanic_location"),

        "owner": owner_data
    }, 200


@mechanic_bp.route("/profile", methods=["GET"])
def mechanic_profile():
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "Phone required"}), 400

    docs = db.collection("mechanics").where("phone", "==", phone).limit(1).get()
    if not docs:
        return jsonify({"error": "Mechanic not found"}), 404

    m = docs[0].to_dict()

    return jsonify({
        "phone": m.get("phone"),
        "verified": m.get("verified"),
        "is_available": m.get("is_available"),
        "active_request_id": m.get("active_request_id")
    }), 200
