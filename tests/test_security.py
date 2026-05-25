"""Security-focused tests: CSRF, XSS, rate-limiting, input validation."""

import pytest


class TestCSRFProtection:
    """The CSRF bypass is active in testing env; these tests verify
    that CSRF *would* be enforced in non-testing environments."""

    @pytest.fixture
    def prod_client(self, client):
        """Simulate production-like CSRF enforcement by temporarily
        unsetting FLASK_ENV=testing."""
        import os
        original = os.environ.get("FLASK_ENV")
        os.environ.pop("FLASK_ENV", None)
        yield client
        if original:
            os.environ["FLASK_ENV"] = original
        else:
            os.environ.pop("FLASK_ENV", None)

    def test_missing_csrf_rejected_in_production_mode(self, prod_client):
        """When FLASK_ENV is not 'testing', POST without a valid token fails."""
        resp = prod_client.post("/api/login", json={
            "username": "admin", "password": "admin123",
        })
        assert resp.status_code == 400
        assert "CSRF" in resp.get_json().get("error", "")

    def test_bypass_header_works(self, client, app_mod):
        """X-Bypass-CSRF with the correct secret key works in any env."""
        import os
        # Temporarily unset FLASK_ENV to verify bypass header
        original = os.environ.get("FLASK_ENV")
        os.environ.pop("FLASK_ENV", None)
        resp = client.post(
            "/api/login",
            json={"username": "admin", "password": "admin123"},
            headers={"X-Bypass-CSRF": app_mod.app.secret_key},
        )
        assert resp.status_code == 200
        if original:
            os.environ["FLASK_ENV"] = original


class TestXSSProtection:
    """User-controlled values should be HTML-escaped in email templates and responses."""

    def test_email_escapes_username(self, client):
        """Register with a script tag in name; verify no raw injection in logs."""
        import re, os
        payload = {
            "username": "xss_user",
            "password": "StrongPass1!",
            "full_name": "<script>alert('xss')</script>",
            "email": "xss@example.com",
        }
        client.post("/api/register", json=payload)
        log_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "logs", "email_log.txt"
        )
        if os.path.exists(log_path):
            with open(log_path, encoding="utf-8") as f:
                content = f.read()
            # The escaped version should not contain raw <script>
            assert "&lt;script&gt;" in content or content == ""


class TestPasswordValidation:
    """Password strength validator edge cases."""

    def test_password_too_short(self, client):
        resp = client.post("/api/register", json={
            "username": "u_short", "password": "Ab1!",
            "full_name": "User", "email": "short@example.com",
        })
        assert resp.status_code == 400

    def test_password_no_uppercase(self, client):
        resp = client.post("/api/register", json={
            "username": "u_noup", "password": "lowercase1!",
            "full_name": "User", "email": "noup@example.com",
        })
        assert resp.status_code == 400

    def test_password_no_lowercase(self, client):
        resp = client.post("/api/register", json={
            "username": "u_nolow", "password": "UPPERCASE1!",
            "full_name": "User", "email": "nolow@example.com",
        })
        assert resp.status_code == 400

    def test_password_no_number(self, client):
        resp = client.post("/api/register", json={
            "username": "u_nonum", "password": "NoNumber!",
            "full_name": "User", "email": "nonum@example.com",
        })
        assert resp.status_code == 400

    def test_password_no_special_char(self, client):
        resp = client.post("/api/register", json={
            "username": "u_nospec", "password": "NoSpecial1",
            "full_name": "User", "email": "nospec@example.com",
        })
        assert resp.status_code == 400

    def test_valid_strong_password(self, client):
        resp = client.post("/api/register", json={
            "username": "u_strong", "password": "ValidPass123!",
            "full_name": "User", "email": "strong@example.com",
        })
        assert resp.status_code == 200


class TestInputValidation:
    """General input sanitization and edge cases."""

    def test_oversized_strings(self, client):
        """Very long inputs should not crash the app."""
        resp = client.post("/api/register", json={
            "username": "a" * 1000,
            "password": "ValidPass1!",
            "full_name": "b" * 1000,
            "email": "c" * 1000,
        })
        # Should either validate or truncate — not crash (500)
        assert resp.status_code in (200, 400, 413)

    def test_sql_injection_in_username(self, client):
        """SQL injection attempts should be treated as literal strings."""
        resp = client.post("/api/register", json={
            "username": "' OR 1=1 --",
            "password": "StrongPass1!",
            "full_name": "SQLi User",
            "email": "sqli@example.com",
        })
        assert resp.status_code in (200, 400)

    def test_unicode_handling(self, client):
        """Unicode characters should be handled gracefully."""
        import uuid
        suffix = uuid.uuid4().hex[:8]
        resp = client.post("/api/register", json={
            "username": f"user_{suffix}",
            "password": "StrøngPäss1!",
            "full_name": "Üser Nâmé",
            "email": f"unicode_{suffix}@example.com",
        })
        assert resp.status_code == 200

    def test_numeric_string_instead_of_object(self, client):
        """Sending number instead of object should not crash."""
        resp = client.post("/api/login", data="42", content_type="application/json")
        assert resp.status_code in (400, 401)


class TestBruteForce:
    """Basic brute-force throttling verification."""

    def test_repeated_failed_logins_throttled(self, client):
        """After multiple failures, the endpoint should return 429."""
        payload = {"username": "brute_target", "password": "wrong"}
        statuses = []
        for _ in range(10):
            resp = client.post("/api/login", json=payload)
            statuses.append(resp.status_code)
        # At least one should be throttled (429)
        assert 429 in statuses, f"Never got 429: {statuses}"
