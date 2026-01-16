from datetime import datetime, timezone, timedelta
from firebase import get_db

db = get_db()

RADIUS_STEPS = [3, 300, 8, 12]   # km
MAX_EXPANSIONS = 3            # 2 expansions → 15 minutes total
EXPANSION_INTERVAL = 30


def maybe_expand_radius(req_ref, req):
    """
    Handles:
    1. Progressive radius expansion
    2. Final timeout after max expansions
    """

    if req.get("status") != "SEARCHING":
        return

    now = datetime.now(timezone.utc)

    timeout_at = req.get("timeout_at")
    if not timeout_at:
        return

    count = req.get("radius_expanded_count", 0)

    # ⏱️ TIME WINDOW EXPIRED
    if now > timeout_at:

        # 🔁 EXPAND RADIUS (if allowed)
        if count < MAX_EXPANSIONS:
            new_radius = RADIUS_STEPS[count + 1]

            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"📌 REQUEST ID: {req_ref.id}")
            print(f"⏱️ NOW: {now}")
            print(f"⏰ PREVIOUS TIMEOUT_AT: {timeout_at}")
            print(f"📏 CURRENT RADIUS: {req.get('search_radius_km')} km")
            print(f"🔁 EXPANSION COUNT: {count}")
            print(f"🚀 EXPANDING TO: {new_radius} km")

            req_ref.update({
                "search_radius_km": new_radius,
                "radius_expanded_count": count + 1,
                "timeout_at": now + timedelta(seconds=EXPANSION_INTERVAL)
            })
            return

        # ⛔ FINAL TIMEOUT
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"📌 REQUEST ID: {req_ref.id}")
        print("⛔ FINAL TIMEOUT REACHED")

        req_ref.update({
            "status": "TIMEOUT",
            "timed_out_at": now
        })

        # 🔓 Clear owner active request
        owner_phone = req.get("owner_phone")
        if owner_phone:
            owner_docs = (
                db.collection("owners")
                .where("phone", "==", owner_phone)
                .limit(1)
                .get()
            )
            if owner_docs:
                owner_docs[0].reference.update({
                    "active_request_id": None
                })

        return

