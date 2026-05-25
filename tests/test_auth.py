"""Authentication and authorization tests."""

import pytest


class TestRegistration:
    """POST /api/register"""

    VALID_PAYLOAD = {
        "username": "newuser",
        "password": "StrongPass1!",
        "full_name": "New User",
        "email": "newuser@example.com",
    }

    def test_successful_registration(self, client):
        resp = client.post("/api/register", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user"]["username"] == "newuser"
        assert data["user"]["role"] == "customer"
        assert data["user"]["email_verified"] == 0

    def test_missing_fields(self, client):
        resp = client.post("/api/register", json={"username": "partial"})
        assert resp.status_code == 400
        assert "All fields" in resp.get_json()["error"]

    def test_duplicate_username(self, client):
        client.post("/api/register", json=self.VALID_PAYLOAD)
        resp = client.post("/api/register", json=self.VALID_PAYLOAD)
        assert resp.status_code == 400
        assert "already taken" in resp.get_json()["error"]

    def test_duplicate_email(self, client):
        client.post("/api/register", json=self.VALID_PAYLOAD)
        dup = {**self.VALID_PAYLOAD, "username": "otheruser"}
        resp = client.post("/api/register", json=dup)
        assert resp.status_code == 400
        assert "Email already registered" in resp.get_json()["error"]

    @pytest.mark.parametrize(
        "password,expected_msg",
        [
            ("short", "at least 8 characters"),
            ("nouppercase1!", "uppercase"),
            ("NOLOWERCASE1!", "lowercase"),
            ("NoNumber!", "number"),
            ("NoSpecialChar1", "special character"),
        ],
    )
    def test_password_strength_validated(self, client, password, expected_msg):
        payload = {**self.VALID_PAYLOAD, "password": password, "username": f"user_{password[:4]}"}
        resp = client.post("/api/register", json=payload)
        assert resp.status_code == 400
        assert expected_msg in resp.get_json()["error"]

    def test_invalid_email_format(self, client):
        payload = {**self.VALID_PAYLOAD, "email": "not-an-email"}
        resp = client.post("/api/register", json=payload)
        assert resp.status_code == 400

    def test_empty_payload(self, client):
        resp = client.post("/api/register", json={})
        assert resp.status_code == 400


class TestLogin:
    """POST /api/login"""

    def test_successful_login_admin(self, client):
        resp = client.post("/api/login", json={
            "username": "admin", "password": "admin123",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user"]["role"] == "admin"

    def test_successful_login_customer(self, client):
        resp = client.post("/api/login", json={
            "username": "customer", "password": "customer123",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user"]["role"] == "customer"

    def test_wrong_password(self, client):
        resp = client.post("/api/login", json={
            "username": "admin", "password": "wrongpass",
        })
        assert resp.status_code == 401
        assert "Wrong ID or password" in resp.get_json()["error"]

    def test_nonexistent_user(self, client):
        resp = client.post("/api/login", json={
            "username": "ghost", "password": "anything",
        })
        assert resp.status_code == 401

    def test_empty_credentials(self, client):
        resp = client.post("/api/login", json={})
        assert resp.status_code == 401

    def test_session_persists(self, client):
        """Logged-in user can access protected endpoints."""
        client.post("/api/login", json={
            "username": "admin", "password": "admin123",
        })
        resp = client.get("/api/profile")
        assert resp.status_code == 200

    def test_logout_clears_session(self, client):
        client.post("/api/login", json={
            "username": "admin", "password": "admin123",
        })
        client.post("/api/logout")
        resp = client.get("/api/profile")
        assert resp.status_code == 401  # no longer authenticated

    def test_remember_me_sets_permanent_session(self, client):
        resp = client.post("/api/login", json={
            "username": "customer", "password": "customer123", "remember": True,
        })
        assert resp.status_code == 200


class TestForgotPassword:
    """POST /api/forgot-password"""

    def test_requires_username_or_email(self, client):
        resp = client.post("/api/forgot-password", json={})
        assert resp.status_code == 400

    def test_with_email(self, client):
        resp = client.post("/api/forgot-password", json={
            "email": "admin@example.com",
        })
        assert resp.status_code == 200

    def test_with_username(self, client):
        resp = client.post("/api/forgot-password", json={
            "email": "admin",
        })
        assert resp.status_code == 200


class TestAuthorization:
    """Protected endpoint authorization checks."""

    def test_unauthenticated_profile_returns_401(self, client):
        resp = client.get("/api/profile")
        assert resp.status_code == 401

    def test_unauthenticated_orders_returns_401(self, client):
        resp = client.get("/api/orders/my")
        assert resp.status_code == 401

    def test_unauthenticated_order_create_returns_401(self, client):
        resp = client.post("/api/orders", json={"items": []})
        assert resp.status_code == 401

    def test_customer_cannot_access_admin_orders(self, customer_session):
        resp = customer_session.get("/api/orders")
        assert resp.status_code == 403

    def test_admin_can_access_admin_orders(self, admin_session):
        resp = admin_session.get("/api/orders")
        assert resp.status_code == 200

    def test_customer_cannot_access_admin_products_create(self, customer_session):
        resp = customer_session.post("/api/products", json={})
        assert resp.status_code == 403

    def test_admin_cannot_access_other_admin_only_endpoints(self, customer_session):
        resp = customer_session.get("/api/admin/customers")
        assert resp.status_code == 403
