"""Health check and status endpoint tests."""


class TestHealth:
    """GET /api/health — load-balancer health check."""

    def test_health_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.data  # any plain response is fine


class TestStatus:
    """GET /api/status — application status."""

    def test_status_returns_200(self, client):
        resp = client.get("/api/status")
        assert resp.status_code == 200

    def test_status_contains_useful_data(self, client):
        resp = client.get("/api/status")
        data = resp.get_json()
        # In memory mode, expect product count or database info
        assert any(k in data for k in ("products", "database", "memory"))
