from flask import Blueprint, request, jsonify
from firebase import get_db
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from datetime import timedelta, timezone
from utils.request_logic import maybe_expand_radius
from flask_cors import CORS
from flask_cors import cross_origin
from google.cloud import firestore


owner_bp = Blueprint("owner", __name__)
CORS(owner_bp)
db = get_db()


# 🔥 RADIUS CONFIG (TEST MODE)
RADIUS_STEPS = [3, 5, 8, 12]
EXPANSION_INTERVAL = 30   # seconds (TEST)

# -----------------------------
# OWNER REGISTRATION
# -----------------------------
@owner_bp.route("/register", methods=["POST", "OPTIONS"])
@cross_origin()
def owner_register():
    data = request.get_json()

    name = data.get("name")
    phone = data.get("phone")
    password = data.get("password")
    confirm_password = data.get("confirm_password")

    if not all([name, phone, password, confirm_password]):
        return jsonify({"error": "All fields are required"}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    owners_ref = db.collection("owners")
    existing = owners_ref.where("phone", "==", phone).limit(1).get()

    if existing:
        return jsonify({"error": "Owner already exists"}), 409

    owners_ref.add({
        "name": name,
        "phone": phone,
        "password_hash": generate_password_hash(password),
        "active_request_id": None,
        "created_at": datetime.utcnow()
    })

    return jsonify({"message": "Owner registered successfully"}), 201

#login route
@owner_bp.route("/login", methods=["POST"])
def owner_login():
    data = request.get_json()

    phone = data.get("phone")
    password = data.get("password")

    if not phone or not password:
        return jsonify({"error": "Phone and password required"}), 400

    owners_ref = db.collection("owners")
    docs = owners_ref.where("phone", "==", phone).limit(1).get()

    if not docs:
        return jsonify({"error": "Owner not found"}), 404

    owner = docs[0].to_dict()

    if not check_password_hash(owner["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({
        "message": "Login successful",
        "owner_phone": phone
    }), 200



@owner_bp.route("/request/create", methods=["POST"])
def create_request():
    data = request.get_json()

    phone = data.get("owner_phone")
    vehicle_type = data.get("vehicle_type")
    service_type = data.get("service_type")
    description = data.get("description")
    lat = data.get("lat")
    lng = data.get("lng")

    if not phone or not vehicle_type or not service_type or lat is None or lng is None:
        return jsonify({"error": "Missing required fields"}), 400

    vehicle_type = vehicle_type.upper()
    service_type = service_type.upper()

    transaction = db.transaction()

    @firestore.transactional
    def txn(transaction):
        # 🔒 LOCK OWNER
        owner_q = (
            db.collection("owners")
            .where("phone", "==", phone)
            .limit(1)
        )

        owner_docs = list(owner_q.stream(transaction=transaction))
        if not owner_docs:
            raise ValueError("Owner not found")

        owner_ref = owner_docs[0].reference
        owner_data = owner_docs[0].to_dict()

        # 🚫 PREVENT MULTIPLE ACTIVE REQUESTS
        if owner_data.get("active_request_id"):
            raise ValueError("Active request already exists")

        now = datetime.now(timezone.utc)

        req_ref = db.collection("requests").document()

        print("🔥 CREATE_REQUEST CALLED")
        print("🔥 RADIUS_STEPS =", RADIUS_STEPS)
        print("🔥 EXPANSION_INTERVAL =", EXPANSION_INTERVAL)
        print("🔥 NOW =", now)


        transaction.set(req_ref, {
            "owner_phone": phone,
            "mechanic_phone": None,

            "vehicle_type": vehicle_type,
            "service_type": service_type,
            "description": description,

            "owner_location": {
                "lat": lat,
                "lng": lng
            },
            "mechanic_location": None,

            # 🔥 REQUIRED FOR RADIUS EXPANSION
            "search_radius_km": RADIUS_STEPS[0],      # 3 km
            "radius_expanded_count": 0,
            "timeout_at": now + timedelta(seconds=EXPANSION_INTERVAL),

            "status": "SEARCHING",

            "otp": None,
            "otp_verified": False,

            "rating": None,
            "feedback": None,

            "created_at": now,
            "completed_at": None
        })

        print("🔥 REQUEST WRITTEN:", req_ref.id)


        transaction.update(owner_ref, {
            "active_request_id": req_ref.id
        })

        return req_ref.id

    try:
        request_id = txn(transaction)
        return jsonify({
            "message": "Request created successfully",
            "request_id": request_id,
            "status": "SEARCHING"
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 409

    except Exception as e:
        print("🔥 CREATE REQUEST ERROR:", e)
        return jsonify({"error": "Failed to create request"}), 500




# -----------------------------
# GET REQUEST STATUS
# -----------------------------
@owner_bp.route("/request/<request_id>", methods=["GET"])
def get_request(request_id):
    # 🔥 FORCE LATEST DATA (NO CACHE)
    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get(retry=None)

    if not req_doc.exists:
        return jsonify({"error": "Request not found"}), 404

    req = req_doc.to_dict()

    # 🔁 Auto timeout / radius expansion
    maybe_expand_radius(req_ref, req)
    req = req_ref.get(retry=None).to_dict()

    mechanic_data = None
    mechanic_location = None

    if req.get("mechanic_phone"):
        mech_docs = (
            db.collection("mechanics")
            .where("phone", "==", req["mechanic_phone"])
            .limit(1)
            .get()
        )

        if mech_docs:
            mechanic = mech_docs[0].to_dict()
            mechanic_data = {
                "name": mechanic.get("name"),
                "phone": mechanic.get("phone")
            }

    # ✅ READ MECHANIC LOCATION DIRECTLY FROM REQUEST
    mechanic_location = req.get("mechanic_location")

    return jsonify({
        "request_id": request_id,
        "status": req.get("status"),

        # 📍 LOCATIONS
        "ownerLocation": req.get("owner_location"),
        "mechanic": mechanic_data,
        "mechanicLocation": mechanic_location,

        # 🔍 SEARCH / RADIUS INFO
        "search_radius_km": req.get("search_radius_km"),
        "radius_expanded_count": req.get("radius_expanded_count", 0),
        "timeout_at": req.get("timeout_at"),
        "created_at": req.get("created_at"),

        # 🔐 OTP
        "allowOtp": (
            req.get("status") == "ACCEPTED"
            and not req.get("otp_verified")
        ),

        # 🔒 ACTION FLAGS
        "canCancel": req.get("status") in ["SEARCHING", "ACCEPTED"],
        "canComplete": req.get("status") == "IN_PROGRESS"
    }), 200




#otp verification
@owner_bp.route("/verify-otp/<request_id>", methods=["POST"])
def verify_otp(request_id):
    data = request.get_json()
    otp = data.get("otp")

    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return {"error": "Request not found"}, 404

    req = req_doc.to_dict()

    if req["otp_verified"]:
        return {"error": "OTP already verified"}, 400

    if req["otp"] != otp:
        return {"error": "Invalid OTP"}, 400

    # 🔒 LOCK JOB
    req_ref.update({
        "otp_verified": True,
        "status": "IN_PROGRESS",
        "started_at": datetime.utcnow()
    })

    return {"message": "OTP verified. Service started"}, 200



@owner_bp.route("/complete/<request_id>", methods=["POST", "OPTIONS"])
@cross_origin()
def complete_job(request_id):
    data = request.get_json()
    phone = data.get("owner_phone")

    if not phone:
        return {"error": "Owner phone required"}, 400

    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return {"error": "Request not found"}, 404

    req = req_doc.to_dict()

    if req.get("status") != "IN_PROGRESS":
        return {"error": "Job can only be completed after OTP verification"}, 403

    if req.get("owner_phone") != phone:
        return {"error": "Unauthorized owner"}, 403

    # ✅ COMPLETE JOB
    req_ref.update({
        "status": "COMPLETED",
        "completed_at": datetime.utcnow()
    })

    # ✅ RELEASE MECHANIC
    if req.get("mechanic_phone"):
        mech_docs = (
            db.collection("mechanics")
            .where("phone", "==", req["mechanic_phone"])
            .limit(1)
            .get()
        )
        if mech_docs:
            mech_docs[0].reference.update({
                "is_available": True,
                "active_request_id": None
            })

    # ✅ CLEAR OWNER ACTIVE REQUEST
    owner_docs = (
        db.collection("owners")
        .where("phone", "==", phone)
        .limit(1)
        .get()
    )
    if owner_docs:
        owner_docs[0].reference.update({
            "active_request_id": None
        })

    return {"message": "Job completed successfully"}, 200


@owner_bp.route("/request/feedback/<request_id>", methods=["POST"])
def submit_feedback(request_id):
    data = request.get_json()
    rating = data.get("rating")
    feedback = data.get("feedback")

    if rating is None:
        return jsonify({"error": "Rating required"}), 400

    if not (1 <= int(rating) <= 5):
        return jsonify({"error": "Rating must be between 1 and 5"}), 400

    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return jsonify({"error": "Request not found"}), 404

    req = req_doc.to_dict()

    if req.get("status") != "COMPLETED":
        return jsonify({"error": "Feedback allowed only after completion"}), 409

    if req.get("rating") is not None:
        return jsonify({"error": "Feedback already submitted"}), 409

    req_ref.update({
        "rating": int(rating),
        "feedback": feedback,
        "rated_at": datetime.utcnow()
    })

    return jsonify({"message": "Feedback submitted successfully"}), 200


# -----------------------------
# OWNER REQUEST HISTORY
# -----------------------------
@owner_bp.route("/requests/history", methods=["GET"])
def owner_history():
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "Phone required"}), 400

    reqs = (
        db.collection("requests")
        .where("owner_phone", "==", phone)
        .where("status", "in", ["COMPLETED", "CANCELLED", "TIMEOUT"])
        .order_by("created_at", direction="DESCENDING")
        .get()
    )

    history = []
    for d in reqs:
        r = d.to_dict()
        history.append({
            "request_id": d.id,
            "vehicle_type": r.get("vehicle_type"),
            "service_type": r.get("service_type"),
            "status": r.get("status"),
            "rating": r.get("rating"),
            "feedback": r.get("feedback"),
            "completed_at": r.get("completed_at")
        })

    return jsonify({"history": history}), 200


@owner_bp.route("/request/location/<request_id>", methods=["GET"])
def get_mechanic_location(request_id):
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "Phone required"}), 400

    ref = db.collection("requests").document(request_id)
    doc = ref.get()

    if not doc.exists:
        return jsonify({"error": "Request not found"}), 404

    req = doc.to_dict()

    if req.get("owner_phone") != phone:
        return jsonify({"error": "Unauthorized"}), 403

    if req.get("status") not in ["ACCEPTED", "IN_PROGRESS"]:
        return jsonify({"error": "Tracking not allowed"}), 400

    loc = req.get("mechanic_location")
    if not loc:
        return jsonify({"error": "Location not available"}), 404

    return jsonify(loc), 200


# -----------------------------
# CANCEL REQUEST (OWNER)
# -----------------------------
@owner_bp.route("/request/cancel/<request_id>", methods=["POST"])
def cancel_request(request_id):
    data = request.get_json()
    phone = data.get("phone")

    req_ref = db.collection("requests").document(request_id)
    req_doc = req_ref.get()

    if not req_doc.exists:
        return {"error": "Request not found"}, 404

    req = req_doc.to_dict()

    if req["status"] == "IN_PROGRESS":
        return {"error": "Cannot cancel after service has started"}, 403

    if req["status"] in ["COMPLETED", "CANCELLED"]:
        return {"error": "Request already closed"}, 400

    # ✅ CANCEL REQUEST
    req_ref.update({
        "status": "CANCELLED",
        "cancelled_by": "OWNER"
    })


    # ✅ CLEAR OWNER ACTIVE REQUEST
    owner_ref = (
        db.collection("owners")
        .where("phone", "==", phone)
        .limit(1)
        .get()
    )
    if owner_ref:
        owner_ref[0].reference.update({
            "active_request_id": None
        })

    # Release mechanic if assigned
    if req.get("mechanic_phone"):
        mech_ref = (
            db.collection("mechanics")
            .where("phone", "==", req["mechanic_phone"])
            .limit(1)
            .get()
        )
        if mech_ref:
            mech_ref[0].reference.update({
                "is_available": True,
                "active_request_id": None
            })

    return {"message": "Request cancelled"}, 200



@owner_bp.route("/cancel/<request_id>", methods=["POST"])
def cancel_request_alias(request_id):
    return cancel_request(request_id)


@owner_bp.route("/logout", methods=["POST"])
def owner_logout():
    data = request.get_json()
    phone = data.get("phone")

    if not phone:
        return jsonify({"error": "Phone required"}), 400

    docs = db.collection("owners").where("phone", "==", phone).limit(1).get()
    if not docs:
        return jsonify({"error": "Owner not found"}), 404

    # Stateless logout → nothing to clear in DB
    return jsonify({
        "message": "Owner logged out successfully"
    }), 200


@owner_bp.route("/profile", methods=["GET"])
def owner_profile():
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "Phone required"}), 400

    docs = db.collection("owners").where("phone", "==", phone).limit(1).get()
    if not docs:
        return jsonify({"error": "Owner not found"}), 404

    owner = docs[0].to_dict()

    return jsonify({
        "phone": owner.get("phone"),
        "active_request_id": owner.get("active_request_id")
    }), 200
