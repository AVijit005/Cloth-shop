import urllib.request
import urllib.parse
import json
import http.cookiejar
import uuid

BASE_URL = "http://127.0.0.1:5000"

def verify_latest_user():
    import re, os
    log_path = "logs/email_log.txt"
    if not os.path.exists(log_path):
        print("Warning: email_log.txt not found!")
        return False
    with open(log_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Find all /verify-email?token=... links
    links = re.findall(r"/verify-email\?token=[a-zA-Z0-9_\-]+", content)
    if not links:
        print("Warning: No verification links found in email_log.txt!")
        return False
    latest_link = links[-1]
    print(f"Triggering verification via: {latest_link}")
    req = urllib.request.Request(f"{BASE_URL}{latest_link}", headers={"Content-Type": "application/json"}, method="GET")
    try:
        with opener.open(req) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"Verification fetch error: {e}")
        return False

# Set up cookie jar to maintain session
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def request(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    headers = {
        "Content-Type": "application/json",
        "X-Bypass-CSRF": "94c25f448c5b9671607efcfab3de84d262b95fae223d778d9bfa33f95e510860"
    }
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

def reset_product_1_stock():
    cj_admin = http.cookiejar.CookieJar()
    opener_admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj_admin))
    
    def admin_req(path, method="GET", data=None):
        url = f"{BASE_URL}{path}"
        headers = {
            "Content-Type": "application/json",
            "X-Bypass-CSRF": "94c25f448c5b9671607efcfab3de84d262b95fae223d778d9bfa33f95e510860"
        }
        req_data = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
        with opener_admin.open(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}

    print("Resetting product 1 stock to 'In stock'...")
    admin_req("/api/login", "POST", {"username": "admin", "password": "admin123"})
    _, res = admin_req("/api/products")
    prod = next((p for p in res["products"] if p["id"] == 1), None)
    if prod:
        prod["stock"] = "In stock"
        admin_req("/api/products/1", "PUT", prod)
        print("Product 1 reset success")

def run_tests():
    reset_product_1_stock()
    # 1. Test registration validations
    print("--- 1. Testing Registration Validation ---")
    
    # Missing fields
    code, res = request("/api/register", "POST", {"username": "testuser"})
    print(f"Missing fields code: {code}, res: {res}")
    assert code == 400
    
    # Password too short/weak format
    code, res = request("/api/register", "POST", {
        "username": "testuser",
        "password": "123",
        "full_name": "Test User",
        "email": "test@example.com"
    })
    print(f"Short password code: {code}, res: {res}")
    assert code == 400
    assert "at least 8 characters" in res.get("error", "")

    # Weak format (no uppercase/special character)
    code, res = request("/api/register", "POST", {
        "username": "testuser",
        "password": "password123",
        "full_name": "Test User",
        "email": "test@example.com"
    })
    print(f"Weak password format code: {code}, res: {res}")
    assert code == 400
    assert "uppercase" in res.get("error", "") or "special character" in res.get("error", "")

    # Successful registration
    username = f"user_{uuid.uuid4().hex[:6]}"
    print(f"Registering user: {username}")
    code, res = request("/api/register", "POST", {
        "username": username,
        "password": "Password123!",
        "full_name": "Dynamic Test User",
        "email": f"{username}@example.com"
    })
    print(f"Registration code: {code}, res: {res}")
    assert code == 200
    assert res["user"]["username"] == username
    assert res["user"]["role"] == "customer"
    
    # Verify the email
    success = verify_latest_user()
    assert success is True
    print("User email verified successfully!")
    
    # Try register duplicate username
    code, res = request("/api/register", "POST", {
        "username": username,
        "password": "Password123!",
        "full_name": "Dynamic Test User",
        "email": f"another_{username}@example.com"
    })
    print(f"Duplicate registration code: {code}, res: {res}")
    assert code == 400
    assert "Username already taken" in res.get("error", "")

    # 2. Testing Multi-address serialization
    print("\n--- 2. Testing Multi-Address Serialization ---")
    
    # Retrieve current profile (should have empty saved_address)
    code, profile = request("/api/profile", "GET")
    print(f"Initial profile code: {code}, profile: {profile}")
    assert code == 200
    assert profile["saved_address"] == ""
    
    # Set multi-address array (JSON-serialized)
    address_book = [
        {"label": "Home", "address": "123 Main St, New York, NY", "name": "Dynamic Test User", "phone": "1234567890"},
        {"label": "Work", "address": "456 Office Rd, San Francisco, CA", "name": "Dynamic Test User Office", "phone": "0987654321"}
    ]
    
    code, update_res = request("/api/profile", "PUT", {
        "saved_name": "Dynamic Test User",
        "saved_phone": "1234567890",
        "saved_address": json.dumps(address_book)
    })
    print(f"Update profile code: {code}, update_res: {update_res}")
    assert code == 200
    
    # Fetch profile to verify serialization
    code, profile = request("/api/profile", "GET")
    print(f"Fetched profile saved_address: {profile['saved_address']}")
    assert code == 200
    parsed_address_book = json.loads(profile["saved_address"])
    assert len(parsed_address_book) == 2
    assert parsed_address_book[0]["label"] == "Home"
    assert parsed_address_book[1]["label"] == "Work"

    # Place order with save_profile: true and a new address
    print("\n--- 3. Testing Order Placement with Address Book Appending ---")
    order_data = {
        "customer_name": "Dynamic Test User Vacation",
        "phone": "5555555555",
        "address": "789 Resort Ave, Miami, FL",
        "payment_mode": "Cash on delivery",
        "save_profile": True,
        "items": [{"product_id": 1, "quantity": 1, "size": "M"}]
    }
    code, order_res = request("/api/orders", "POST", order_data)
    print(f"Place order code: {code}, order_res: {order_res}")
    assert code == 200
    
    # Retrieve profile to verify the new address was appended (now should have 3 addresses)
    code, profile = request("/api/profile", "GET")
    print(f"Profile saved_address after order: {profile['saved_address']}")
    parsed_after_order = json.loads(profile["saved_address"])
    assert len(parsed_after_order) == 3
    assert parsed_after_order[2]["label"] == "Address 3"
    assert parsed_after_order[2]["address"] == "789 Resort Ave, Miami, FL"
    assert parsed_after_order[2]["name"] == "Dynamic Test User Vacation"
    assert parsed_after_order[2]["phone"] == "5555555555"

    # 4. Testing Inventory Control Transitions (In Stock -> Limited -> Out of Stock)
    print("\n--- 4. Testing Inventory Control Stock Transitions ---")
    
    # Get all products and find one that is "In stock"
    code, catalog_res = request("/api/products", "GET")
    products = catalog_res["products"]
    target_product = None
    for p in products:
        if p["stock"].strip().lower() == "in stock":
            target_product = p
            break
            
    if not target_product:
        print("Warning: No product found with 'In stock' status. Using product ID 1.")
        target_product = products[0]
        
    print(f"Target product: {target_product['name']} (ID: {target_product['id']}), Stock: {target_product['stock']}")
    
    # Log in as admin to reset product stock status to 'In stock'
    print("\nLogging in as admin to reset product stock status to 'In stock'...")
    admin_cj = http.cookiejar.CookieJar()
    admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(admin_cj))
    
    def admin_request(path, method="GET", data=None):
        url = f"{BASE_URL}{path}"
        headers = {
            "Content-Type": "application/json",
            "X-Bypass-CSRF": "94c25f448c5b9671607efcfab3de84d262b95fae223d778d9bfa33f95e510860"
        }
        req_data = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
        with admin_opener.open(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}

    admin_request("/api/login", "POST", {"username": "admin", "password": "admin123"})
    
    p_id = target_product["id"]
    target_product["stock"] = "In stock"
    # Update product
    print(f"Updating product {p_id} stock to 'In stock'...")
    admin_request(f"/api/products/{p_id}", "PUT", target_product)
    
    # Verify it's 'In stock'
    _, cat = request("/api/products", "GET")
    target_p_updated = next(p for p in cat["products"] if p["id"] == p_id)
    print(f"Verified stock: {target_p_updated['stock']}")
    assert target_p_updated["stock"] == "In stock"
    
    # Place order 1
    order_item = {"product_id": p_id, "quantity": 1, "size": "M"}
    order_data = {
        "customer_name": "Test User",
        "phone": "1234567890",
        "address": "123 Main St",
        "payment_mode": "Cash on delivery",
        "save_profile": False,
        "items": [order_item]
    }
    
    code, _ = request("/api/orders", "POST", order_data)
    print(f"Order 1 code: {code}")
    assert code == 200
    
    # Check stock status (should be 'Limited stock')
    _, cat = request("/api/products", "GET")
    target_p_updated = next(p for p in cat["products"] if p["id"] == p_id)
    print(f"After Order 1 stock: {target_p_updated['stock']}")
    assert target_p_updated["stock"] == "Limited stock"
    
    # Place order 2
    code, _ = request("/api/orders", "POST", order_data)
    print(f"Order 2 code: {code}")
    assert code == 200
    
    # Check stock status (should be 'Out of stock')
    _, cat = request("/api/products", "GET")
    target_p_updated = next(p for p in cat["products"] if p["id"] == p_id)
    print(f"After Order 2 stock: {target_p_updated['stock']}")
    assert target_p_updated["stock"] == "Out of stock"
    
    # Place order 3 (should fail because product is 'Out of stock')
    code, err_res = request("/api/orders", "POST", order_data)
    print(f"Order 3 (when out of stock) code: {code}, response: {err_res}")
    assert code == 400
    assert "is out of stock" in err_res.get("error", "")
    
    print("\nSUCCESS: All signup and inventory tests completed successfully!")

if __name__ == "__main__":
    run_tests()
