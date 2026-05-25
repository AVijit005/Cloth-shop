"""Order API tests: creation, listing, cancellation, coupon logic."""

import pytest


class TestOrderCreation:
    """POST /api/orders"""

    ORDER_PAYLOAD = {
        "customer_name": "Test Customer",
        "phone": "9876543210",
        "address": "123 Test Street, Test City",
        "payment_mode": "Cash on delivery",
        "save_profile": False,
        "items": [{"product_id": 1, "quantity": 1, "size": "M"}],
    }

    def test_create_order_as_logged_in_user(self, customer_session):
        resp = customer_session.post("/api/orders", json=self.ORDER_PAYLOAD)
        assert resp.status_code == 201
        data = resp.get_json()
        assert "order_id" in data
        assert data["order_id"] > 0

    def test_create_order_unauthenticated(self, client):
        resp = client.post("/api/orders", json=self.ORDER_PAYLOAD)
        assert resp.status_code == 401

    def test_cart_empty_fails(self, customer_session):
        resp = customer_session.post("/api/orders", json={**self.ORDER_PAYLOAD, "items": []})
        assert resp.status_code == 400
        assert "empty" in resp.get_json()["error"]

    def test_missing_phone_and_address(self, customer_session):
        resp = customer_session.post("/api/orders", json={
            **self.ORDER_PAYLOAD, "phone": "", "address": "",
        })
        assert resp.status_code == 400

    def test_out_of_stock_product_fails(self, customer_session, admin_session):
        """Buy all stock of a product, then attempt to order it again."""
        payload = {**self.ORDER_PAYLOAD, "items": [{"product_id": 1, "quantity": 1, "size": "M"}]}
        resp1 = customer_session.post("/api/orders", json=payload)
        assert resp1.status_code == 201

        resp2 = customer_session.post("/api/orders", json=payload)
        assert resp2.status_code == 201

        # Product 1 should now be "Out of stock" — third order fails
        resp3 = customer_session.post("/api/orders", json=payload)
        assert resp3.status_code == 400
        assert "out of stock" in resp3.get_json()["error"]

    def test_stock_transitions_correctly(self, customer_session, app_mod):
        """Verify stock: In stock -> Limited stock -> Out of stock."""
        # Product 2 starts as "In stock"
        prod = next(p for p in app_mod.memory_products if p["id"] == 2)
        assert prod["stock"] == "In stock"

        payload = {**self.ORDER_PAYLOAD, "items": [{"product_id": 2, "quantity": 1, "size": "M"}]}

        # First order -> Limited stock
        customer_session.post("/api/orders", json=payload)
        prod = next(p for p in app_mod.memory_products if p["id"] == 2)
        assert prod["stock"] == "Limited stock"

        # Second order -> Out of stock
        customer_session.post("/api/orders", json=payload)
        prod = next(p for p in app_mod.memory_products if p["id"] == 2)
        assert prod["stock"] == "Out of stock"


class TestCouponValidation:
    """Coupon code application during checkout."""

    def test_valid_coupon(self, customer_session):
        resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "coupon_code": "SHIBANI10",
            "items": [{"product_id": 1, "quantity": 1, "size": "M"}],
        })
        assert resp.status_code == 201, f"Coupon order failed: {resp.get_json()}"
        data = resp.get_json()
        assert data["discount"] > 0

    def test_invalid_coupon(self, customer_session):
        resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "coupon_code": "INVALIDCODE",
            "items": [{"product_id": 1, "quantity": 1, "size": "M"}],
        })
        assert resp.status_code == 400
        assert "Invalid" in resp.get_json()["error"]

    def test_expired_coupon(self, customer_session, app_mod):
        """Coupons with expires_at in the past should be rejected."""
        from datetime import datetime, timedelta
        app_mod.memory_coupons.append({
            "id": 99,
            "code": "EXPIRED",
            "discount_type": "percentage",
            "discount_value": 10.0,
            "min_subtotal": 0.0,
            "active": 1,
            "expires_at": (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
            "usage_limit": None,
            "usage_count": 0,
        })
        resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "coupon_code": "EXPIRED",
            "items": [{"product_id": 1, "quantity": 1, "size": "M"}],
        })
        assert resp.status_code == 400
        assert "expired" in resp.get_json()["error"].lower()


class TestOrderListing:
    """GET /api/orders (admin) and GET /api/orders/my (user)."""

    def test_admin_lists_all_orders(self, admin_session):
        resp = admin_session.get("/api/orders")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "orders" in data

    def test_user_lists_own_orders(self, customer_session):
        resp = customer_session.get("/api/orders/my")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "orders" in data


class TestOrderCancellation:
    """PUT /api/orders/<id>/cancel"""

    def test_cancel_own_order(self, customer_session):
        create_resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "items": [{"product_id": 3, "quantity": 1, "size": "M"}],
        })
        assert create_resp.status_code == 201
        order_id = create_resp.get_json()["order_id"]

        resp = customer_session.put(f"/api/orders/{order_id}/cancel")
        assert resp.status_code == 200
        assert resp.get_json().get("status") == "Cancelled"

    def test_cancel_nonexistent_order(self, customer_session):
        resp = customer_session.put("/api/orders/99999/cancel")
        assert resp.status_code == 404

    def test_cancel_other_users_order_fails(self, admin_session, customer_session):
        create_resp = customer_session.post("/api/orders", json={
            "customer_name": "Test",
            "phone": "9876543210",
            "address": "123 Test St",
            "payment_mode": "Cash on delivery",
            "items": [{"product_id": 3, "quantity": 1, "size": "M"}],
        })
        order_id = create_resp.get_json()["order_id"]

        resp = admin_session.put(f"/api/orders/{order_id}/cancel")
        assert resp.status_code == 404
