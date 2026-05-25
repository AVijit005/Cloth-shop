"""Review API tests: creation, listing, admin moderation."""

import pytest


class TestReviewCreation:
    """POST /api/reviews"""

    def test_create_review(self, customer_session):
        resp = customer_session.post("/api/reviews", json={
            "product_id": 1,
            "rating": 5,
            "comment": "Great product!",
            "sizing_fit": "fit",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["review"]["rating"] == 5
        assert data["review"]["product_id"] == 1

    def test_create_review_without_login(self, client):
        resp = client.post("/api/reviews", json={
            "product_id": 1, "rating": 4,
        })
        assert resp.status_code == 401

    def test_create_review_missing_fields(self, customer_session):
        resp = customer_session.post("/api/reviews", json={
            "product_id": 1,
        })
        assert resp.status_code == 400

    def test_create_review_invalid_rating(self, customer_session):
        """App now rejects out-of-range ratings."""
        resp = customer_session.post("/api/reviews", json={
            "product_id": 1, "rating": 10, "sizing_fit": "fit",
        })
        assert resp.status_code == 400


class TestReviewListing:
    """GET /api/reviews"""

    def test_list_reviews_for_product(self, client):
        resp = client.get("/api/reviews?product_id=1")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "reviews" in data

    def test_list_reviews_no_product_id(self, client):
        resp = client.get("/api/reviews")
        assert resp.status_code == 400

    def test_list_reviews_empty_product(self, client):
        resp = client.get("/api/reviews?product_id=99999")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["reviews"] == []


class TestAdminReviewModeration:
    """Admin review management."""

    def test_admin_lists_reviews(self, admin_session):
        resp = admin_session.get("/api/admin/reviews")
        assert resp.status_code == 200

    def test_customer_cannot_access_admin_reviews(self, customer_session):
        resp = customer_session.get("/api/admin/reviews")
        assert resp.status_code == 403

    def test_admin_updates_review_status(self, admin_session, customer_session):
        create_resp = customer_session.post("/api/reviews", json={
            "product_id": 1, "rating": 3, "comment": "OK",
            "sizing_fit": "fit",
        })
        review_id = create_resp.get_json()["review"]["id"]

        resp = admin_session.patch(f"/api/admin/reviews/{review_id}", json={"status": "hidden"})
        assert resp.status_code == 200

    def test_admin_deletes_review(self, admin_session, customer_session):
        create_resp = customer_session.post("/api/reviews", json={
            "product_id": 1, "rating": 2, "comment": "Bad",
            "sizing_fit": "fit",
        })
        review_id = create_resp.get_json()["review"]["id"]

        resp = admin_session.delete(f"/api/admin/reviews/{review_id}")
        assert resp.status_code == 200
