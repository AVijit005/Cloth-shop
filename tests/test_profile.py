"""Profile API tests: read, update, address book management."""

import json


class TestProfileRead:
    """GET /api/profile"""

    def test_get_profile_unauthenticated(self, client):
        resp = client.get("/api/profile")
        assert resp.status_code == 401

    def test_get_profile_logged_in(self, customer_session):
        resp = customer_session.get("/api/profile")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["username"] == "customer"
        assert data["role"] == "customer"

    def test_get_profile_admin(self, admin_session):
        resp = admin_session.get("/api/profile")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"

    def test_profile_has_all_fields(self, customer_session):
        resp = customer_session.get("/api/profile")
        data = resp.get_json()
        for field in ("username", "full_name", "role", "saved_name", "saved_phone", "saved_address"):
            assert field in data


class TestProfileUpdate:
    """PUT /api/profile"""

    def test_update_profile(self, customer_session):
        resp = customer_session.put("/api/profile", json={
            "saved_name": "Test Customer",
            "saved_phone": "1234567890",
            "saved_address": "123 Main St, City",
        })
        assert resp.status_code == 200

    def test_updated_values_persist(self, customer_session):
        customer_session.put("/api/profile", json={
            "saved_name": "Persist Test",
            "saved_phone": "9999999999",
            "saved_address": "456 Oak Ave",
        })
        resp = customer_session.get("/api/profile")
        data = resp.get_json()
        assert data["saved_name"] == "Persist Test"
        assert data["saved_phone"] == "9999999999"
        assert data["saved_address"] == "456 Oak Ave"

    def test_update_profile_unauthenticated(self, client):
        resp = client.put("/api/profile", json={
            "saved_name": "Hacker",
        })
        assert resp.status_code == 401

    def test_update_profile_empty_values(self, customer_session):
        """Clearing profile fields should be allowed."""
        resp = customer_session.put("/api/profile", json={
            "saved_name": "",
            "saved_phone": "",
            "saved_address": "",
        })
        assert resp.status_code == 200


class TestAddressBook:
    """Multi-address serialization via JSON string in saved_address."""

    ADDRESS_BOOK = [
        {"label": "Home", "address": "123 Home St", "name": "Me", "phone": "1111111111"},
        {"label": "Work", "address": "456 Office Rd", "name": "Me Work", "phone": "2222222222"},
    ]

    def test_save_and_retrieve_address_book(self, customer_session):
        resp = customer_session.put("/api/profile", json={
            "saved_name": "Addr Test",
            "saved_phone": "3333333333",
            "saved_address": json.dumps(self.ADDRESS_BOOK),
        })
        assert resp.status_code == 200

        resp = customer_session.get("/api/profile")
        data = resp.get_json()
        retrieved = json.loads(data["saved_address"])
        assert len(retrieved) == 2
        assert retrieved[0]["label"] == "Home"
        assert retrieved[1]["label"] == "Work"

    def test_address_appended_via_order(self, customer_session, app_mod):
        """Order with save_profile=True appends address to the user's profile."""
        # Set initial address book
        customer_session.put("/api/profile", json={
            "saved_name": "Order User",
            "saved_phone": "4444444444",
            "saved_address": json.dumps([
                {"label": "Home", "address": "123 Home St", "name": "Me", "phone": "4444444444"},
            ]),
        })

        # Place order with new address
        customer_session.post("/api/orders", json={
            "customer_name": "Order User Vacation",
            "phone": "5555555555",
            "address": "789 Resort Ave, Miami",
            "payment_mode": "Cash on delivery",
            "save_profile": True,
            "items": [{"product_id": 3, "quantity": 1, "size": "M"}],
        })

        # Verify new address appended
        resp = customer_session.get("/api/profile")
        data = resp.get_json()
        addresses = json.loads(data["saved_address"])
        assert len(addresses) == 2
        assert addresses[1]["address"] == "789 Resort Ave, Miami"
