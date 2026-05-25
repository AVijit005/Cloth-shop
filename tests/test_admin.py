"""Admin dashboard and management API tests."""

import pytest


class TestAdminDashboard:
    """Admin dashboard page routes."""

    def test_admin_dashboard_page(self, admin_session):
        resp = admin_session.get("/admin")
        assert resp.status_code == 200
        assert resp.content_type.startswith("text/html")

    def test_customer_cannot_access_admin_page(self, customer_session):
        resp = customer_session.get("/admin")
        assert resp.status_code == 302  # redirect to login

    def test_unauthenticated_cannot_access_admin_page(self, client):
        resp = client.get("/admin")
        assert resp.status_code == 302


class TestAdminCustomers:
    """GET /api/admin/customers"""

    def test_admin_lists_customers(self, admin_session):
        resp = admin_session.get("/api/admin/customers")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "customers" in data

    def test_customer_cannot_list_customers(self, customer_session):
        resp = customer_session.get("/api/admin/customers")
        assert resp.status_code == 403


class TestAdminCoupons:
    """Coupon CRUD admin endpoints."""

    def test_admin_lists_coupons(self, admin_session):
        resp = admin_session.get("/api/admin/coupons")
        assert resp.status_code == 200

    def test_customer_cannot_access_coupons(self, customer_session):
        resp = customer_session.get("/api/admin/coupons")
        assert resp.status_code == 403

    def test_admin_creates_coupon(self, admin_session):
        resp = admin_session.post("/api/admin/coupons", json={
            "code": "TEST10",
            "discount_type": "percentage",
            "discount_value": 10.0,
        })
        assert resp.status_code in (200, 201)

    def test_admin_deletes_coupon(self, admin_session):
        resp = admin_session.delete("/api/admin/coupons/1")
        assert resp.status_code == 200


class TestAdminSettings:
    """Settings management at /api/settings."""

    def test_admin_gets_settings(self, admin_session):
        resp = admin_session.get("/api/settings")
        assert resp.status_code == 200

    def test_admin_updates_settings(self, admin_session):
        resp = admin_session.put("/api/settings", json={
            "gst_rate": "10.0",
        })
        assert resp.status_code == 200

    def test_customer_cannot_update_settings(self, customer_session):
        resp = customer_session.put("/api/settings", json={
            "gst_rate": "10.0",
        })
        assert resp.status_code == 403


class TestAdminOrderManagement:
    """Order status updates."""

    def test_admin_updates_order_status(self, admin_session, customer_session):
        # Create an order first
        create_resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "items": [{"product_id": 3, "quantity": 1, "size": "M"}],
        })
        order_id = create_resp.get_json()["order_id"]

        resp = admin_session.patch(f"/api/orders/{order_id}/status", json={"status": "Confirmed"})
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "Confirmed"

    def test_admin_invalid_status(self, admin_session, customer_session):
        create_resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "items": [{"product_id": 3, "quantity": 1, "size": "M"}],
        })
        order_id = create_resp.get_json()["order_id"]

        resp = admin_session.patch(f"/api/orders/{order_id}/status", json={"status": "InvalidStatus"})
        assert resp.status_code == 400
