import urllib.request
import urllib.parse
import json
import http.cookiejar
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
    print("--- 1. Logging in as Admin ---")
    code, res = request("/api/login", "POST", {"username": "admin", "password": "admin123"})
    if code != 200:
        print(f"Failed to login as admin: {res}")
        sys.exit(1)

    print("\n--- 2. Setting Tiered Loyalty Parameters ---")
    tiered_settings = {
        "gst_rate": 0.0, # Disable GST for simpler calculations in this test
        "delivery_fee_standard": 0.0, # Disable delivery fees
        "delivery_fee_threshold": 9999.0,
        "other_charges": 0.0,
        "loyalty_enabled": "1",
        "loyalty_redeem_ratio": 10.0,
        "loyalty_min_order_to_earn": 0.0,
        "loyalty_min_order_to_redeem": 0.0,
        "loyalty_welcome_points": 100,
        "loyalty_max_redemption_percent": 100.0,
        "loyalty_tier1_limit": 1000.0,
        "loyalty_tier1_rate": 5.0, # 5 points per 100 Rs below 1000
        "loyalty_tier2_limit": 3000.0,
        "loyalty_tier2_rate": 10.0, # 10 points per 100 Rs below 3000
        "loyalty_tier3_limit": 5000.0,
        "loyalty_tier3_rate": 15.0, # 15 points per 100 Rs below 5000
        "loyalty_tier4_limit": 7000.0,
        "loyalty_tier4_rate": 20.0, # 20 points per 100 Rs below 7000
        "loyalty_tier5_limit": 10000.0,
        "loyalty_tier5_rate": 25.0, # 25 points per 100 Rs below 10000
        "loyalty_tier6_limit": 15000.0,
        "loyalty_tier6_rate": 30.0, # 30 points per 100 Rs below 15000
        "loyalty_tier7_rate": 35.0 # 35 points per 100 Rs >= 15000
    }
    code, settings_res = request("/api/settings", "PUT", tiered_settings)
    assert code == 200
    assert settings_res["loyalty_tier1_limit"] == 1000.0
    assert settings_res["loyalty_tier1_rate"] == 5.0
    assert settings_res["loyalty_tier2_limit"] == 3000.0
    assert settings_res["loyalty_tier2_rate"] == 10.0
    assert settings_res["loyalty_tier3_limit"] == 5000.0
    assert settings_res["loyalty_tier3_rate"] == 15.0
    assert settings_res["loyalty_tier4_limit"] == 7000.0
    assert settings_res["loyalty_tier4_rate"] == 20.0
    assert settings_res["loyalty_tier5_limit"] == 10000.0
    assert settings_res["loyalty_tier5_rate"] == 25.0
    assert settings_res["loyalty_tier6_limit"] == 15000.0
    assert settings_res["loyalty_tier6_rate"] == 30.0
    assert settings_res["loyalty_tier7_rate"] == 35.0
    print("Settings verified on PUT response")

    # Double check settings via GET
    code, settings_res = request("/api/settings", "GET")
    assert code == 200
    assert settings_res["loyalty_tier1_limit"] == 1000.0
    assert settings_res["loyalty_tier1_rate"] == 5.0
    assert settings_res["loyalty_tier2_limit"] == 3000.0
    assert settings_res["loyalty_tier2_rate"] == 10.0
    assert settings_res["loyalty_tier3_limit"] == 5000.0
    assert settings_res["loyalty_tier3_rate"] == 15.0
    assert settings_res["loyalty_tier4_limit"] == 7000.0
    assert settings_res["loyalty_tier4_rate"] == 20.0
    assert settings_res["loyalty_tier5_limit"] == 10000.0
    assert settings_res["loyalty_tier5_rate"] == 25.0
    assert settings_res["loyalty_tier6_limit"] == 15000.0
    assert settings_res["loyalty_tier6_rate"] == 30.0
    assert settings_res["loyalty_tier7_rate"] == 35.0
    print("Settings verified on GET response")

    # Find a product to purchase
    code, prod_res = request("/api/products", "GET")
    assert code == 200
    products = prod_res.get("products", [])
    if not products:
        print("No products found! Creating a test product.")
        code, product = request("/api/products", "POST", {
            "name": "Test Saree",
            "price": 1000.0,
            "category": "saree",
            "description": "Test product",
            "stock": "In stock",
            "images": []
        })
        assert code == 201
        product_id = product["id"]
        product_price = product["price"]
    else:
        # We can dynamically update product price for testing different tiers
        product_id = products[0]["id"]

    # Set user points to 1000 initially via Admin Adjust Points API
    print("\n--- 3. Setting Customer Points to 1000 ---")
    # Customer ID is typically 2 (username 'customer')
    code, adjust_res = request("/api/admin/customers/2/adjust-points", "POST", {"action": "set", "value": 1000})
    if code != 200:
        print(f"Failed to adjust points: {adjust_res}")
        sys.exit(1)
    
    # Logout admin
    request("/api/logout", "POST")

    # Login as customer
    print("\n--- 4. Logging in as Customer ---")
    code, res = request("/api/login", "POST", {"username": "customer", "password": "customer123"})
    assert code == 200
    
    # Check profile points
    code, profile = request("/api/profile", "GET")
    assert code == 200
    print(f"Initial customer points: {profile.get('loyalty_points')}")
    assert profile.get("loyalty_points") == 1000

    order_data = {
        "customer_name": "Test User",
        "phone": "9876543210",
        "address": "123 Loyalty Road",
        "payment_mode": "Cash on delivery",
        "save_profile": False,
        "redeemed_points": 0,
        "items": [{"product_id": product_id, "quantity": 1}]
    }

    # Helper function to change product price as admin and then place order as customer
    def test_tier_case(case_num, price, expected_points):
        print(f"\n--- TEST CASE {case_num}: Subtotal {price} ---")
        request("/api/logout", "POST")
        request("/api/login", "POST", {"username": "admin", "password": "admin123"})
        code, prod_res = request("/api/products", "GET")
        product = next((p for p in prod_res.get("products", []) if p["id"] == product_id), None)
        assert product is not None
        product["price"] = price
        product["stock"] = "In stock"
        code, _ = request(f"/api/products/{product_id}", "PUT", product)
        assert code == 200
        
        # Login back as customer and order
        request("/api/logout", "POST")
        request("/api/login", "POST", {"username": "customer", "password": "customer123"})
        
        code, order_res = request("/api/orders", "POST", order_data)
        assert code == 200
        print(f"Order total: {order_res['total']}, earned_points: {order_res.get('earned_points')}")
        assert order_res.get("earned_points") == expected_points
        return order_res.get("earned_points")

    # Run the 7 test cases
    # Test Case 1: Subtotal < 1000 (Tier 1: 5.0%) -> 800 * 5 // 100 = 40
    test_tier_case(1, 800.0, 40)
    
    # Test Case 2: 1000 <= Subtotal < 3000 (Tier 2: 10.0%) -> 2000 * 10 // 100 = 200
    test_tier_case(2, 2000.0, 200)

    # Test Case 3: 3000 <= Subtotal < 5000 (Tier 3: 15.0%) -> 4000 * 15 // 100 = 600
    test_tier_case(3, 4000.0, 600)

    # Test Case 4: 5000 <= Subtotal < 7000 (Tier 4: 20.0%) -> 6000 * 20 // 100 = 1200
    test_tier_case(4, 6000.0, 1200)

    # Test Case 5: 7000 <= Subtotal < 10000 (Tier 5: 25.0%) -> 8000 * 25 // 100 = 2000
    test_tier_case(5, 8000.0, 2000)

    # Test Case 6: 10000 <= Subtotal < 15000 (Tier 6: 30.0%) -> 12000 * 30 // 100 = 3600
    test_tier_case(6, 12000.0, 3600)

    # Test Case 7: Subtotal >= 15000 (Tier 7: 35.0%) -> 20000 * 35 // 100 = 7000
    test_tier_case(7, 20000.0, 7000)

    # Clean up settings and reset to standard defaults
    print("\n--- Cleaning up settings ---")
    request("/api/logout", "POST")
    request("/api/login", "POST", {"username": "admin", "password": "admin123"})
    default_settings = {
        "gst_rate": 5.0,
        "delivery_fee_standard": 99.0,
        "delivery_fee_threshold": 999.0,
        "other_charges": 0.0,
        "loyalty_enabled": "1",
        "loyalty_redeem_ratio": 10.0,
        "loyalty_min_order_to_earn": 0.0,
        "loyalty_min_order_to_redeem": 0.0,
        "loyalty_welcome_points": 100,
        "loyalty_max_redemption_percent": 100.0,
        "loyalty_tier1_limit": 1000.0,
        "loyalty_tier1_rate": 5.0,
        "loyalty_tier2_limit": 3000.0,
        "loyalty_tier2_rate": 10.0,
        "loyalty_tier3_limit": 5000.0,
        "loyalty_tier3_rate": 15.0,
        "loyalty_tier4_limit": 7000.0,
        "loyalty_tier4_rate": 20.0,
        "loyalty_tier5_limit": 10000.0,
        "loyalty_tier5_rate": 25.0,
        "loyalty_tier6_limit": 15000.0,
        "loyalty_tier6_rate": 30.0,
        "loyalty_tier7_rate": 35.0
    }
    request("/api/settings", "PUT", default_settings)
    print("Clean up done!")
    print("\nALL TIERED LOYALTY TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
