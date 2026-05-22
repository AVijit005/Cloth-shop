import urllib.request
import urllib.parse
import json
import http.cookiejar
import uuid
import sys

BASE_URL = "http://127.0.0.1:5000"

# Set up cookie jar to maintain session
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def request(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    req_data = json.dumps(data).encode("utf-8") if data is not None else None
    
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with opener.open(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}

def run_tests():
    print("--- 1. Registering New Customer ---")
    username = f"quest_user_{uuid.uuid4().hex[:6]}"
    code, res = request("/api/register", "POST", {
        "username": username,
        "password": "password123",
        "full_name": "Quest Tester User"
    })
    print(f"Register status: {code}")
    assert code == 200
    
    print("\n--- 2. Fetching Initial Quests List ---")
    code, res = request("/api/gamification/quests", "GET")
    print(f"Quests list status: {code}")
    assert code == 200
    quests = res.get("quests", [])
    print(f"Number of quests: {len(quests)}")
    assert len(quests) == 3
    
    # Assert all quests are at progress 0 and claimed = false
    active_keys = {"write_review", "place_order", "high_spender"}
    for q in quests:
        print(f"Quest: {q['quest_key']} | Progress: {q['progress']}/{q['target']} | Completed: {q['completed']} | Claimed: {q['claimed']}")
        assert q["quest_key"] in active_keys
        assert q["progress"] == 0
        assert q["completed"] is False
        assert q["claimed"] is False

    print("\n--- 3. Testing Review Quest Trigger ---")
    review_data = {
        "product_id": 1,
        "rating": 5,
        "sizing_fit": "True to size",
        "comment": "Absolutely beautiful design and quality."
    }
    code, rev_res = request("/api/reviews", "POST", review_data)
    print(f"Review post status: {code}")
    assert code == 200
    
    # Verify quest progress
    code, res = request("/api/gamification/quests", "GET")
    quests = res.get("quests", [])
    write_review_quest = next(q for q in quests if q["quest_key"] == "write_review")
    print(f"write_review progress after review: {write_review_quest['progress']}/{write_review_quest['target']} (Completed: {write_review_quest['completed']})")
    assert write_review_quest["progress"] == 1
    assert write_review_quest["completed"] is True

    print("\n--- 4. Claiming Review Quest Reward ---")
    code, claim_res = request("/api/gamification/quests/claim", "POST", {"quest_key": "write_review"})
    print(f"Claim review status: {code}, response: {claim_res}")
    assert code == 200
    assert claim_res["ok"] is True
    assert claim_res["new_points_balance"] > 100 # Default welcome is 100 + reward

    # Try claiming again
    code, claim_res = request("/api/gamification/quests/claim", "POST", {"quest_key": "write_review"})
    print(f"Double-claim status: {code}, response: {claim_res}")
    assert code == 400
    assert "already claimed" in claim_res.get("error", "").lower()

    print("\nSUCCESS: All gamification and loyalty quests tests passed successfully!")

if __name__ == "__main__":
    run_tests()
