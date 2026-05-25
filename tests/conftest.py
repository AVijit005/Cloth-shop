"""
pytest fixtures for the Shibani Store Flask application.

Uses the app's in-memory fallback mode (no MySQL required).
All tests run against the Flask test client with CSRF bypassed via
FLASK_ENV=testing.
"""

import os
import sys
import importlib.util
import json
import secrets
import pytest

# Must set testing env BEFORE importing the app module
os.environ["FLASK_ENV"] = "testing"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-2024"

# Ensure app module has no SECRET_KEY collision
if "SHIBANI_SECRET_KEY" not in os.environ:
    os.environ["SHIBANI_SECRET_KEY"] = "test-secret-key-for-pytest-only-2024"

# Import run.py as a module (not the app/ package) using importlib
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app_path = os.path.join(BASE_DIR, "run.py")
spec = importlib.util.spec_from_file_location("app_main", app_path)
app_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app_module)
app = app_module.app

# Force in-memory mode for deterministic tests (avoids MySQL dependency)
app_module.check_db_health = lambda: False
app_module.mysql_ready = False
app_module.db_pool = None

# Populate memory store with starter products
app_module.init_memory_store()

# Seed admin/customer users with email_verified=True for order tests
app_module.memory_users["admin"] = {
    "id": 1,
    "password_hash": app_module.generate_password_hash("admin123"),
    "role": "admin",
    "full_name": "Shibani Admin",
    "email_verified": 1,
}
app_module.memory_users["customer"] = {
    "id": 2,
    "password_hash": app_module.generate_password_hash("customer123"),
    "role": "customer",
    "full_name": "Shibani Customer",
    "email_verified": 1,
}


@pytest.fixture
def app_mod():
    """The imported app module for direct access to globals."""
    return app_module


def reset_global_state():
    """Reset all in-memory state between tests.

    This is essential because the app uses module-level globals for its
    dual-storage (MySQL + memory) architecture. Between tests we clear
    and repopulate from the canonical starter data.
    """
    app_module.memory_products.clear()
    app_module.init_memory_store()  # repopulate from starter_products
    app_module.memory_orders.clear()
    app_module.memory_users.clear()
    app_module.memory_reviews.clear()
    app_module.memory_wishlists.clear()
    # Re-seed admin/customer users with email_verified=True
    app_module.memory_users["admin"] = {
        "id": 1,
        "password_hash": app_module.generate_password_hash("admin123"),
        "role": "admin",
        "full_name": "Shibani Admin",
        "email_verified": 1,
    }
    app_module.memory_users["customer"] = {
        "id": 2,
        "password_hash": app_module.generate_password_hash("customer123"),
        "role": "customer",
        "full_name": "Shibani Customer",
        "email_verified": 1,
    }
    app_module.mysql_ready = False


@pytest.fixture
def client():
    """Flask test client with a fresh application context."""
    app.testing = True
    app.secret_key = os.environ["SECRET_KEY"]
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_state():
    """Reset all module-level global state before every test."""
    reset_global_state()
    yield


@pytest.fixture
def csrf_token(client):
    """Obtain a valid CSRF token for the current session.

    Grabs it from the session via a test request context — the token
    is automatically seeded by the @app.before_request handler.
    """
    with client.session_transaction() as sess:
        if "csrf_token" not in sess:
            sess["csrf_token"] = secrets.token_hex(32)
        return sess["csrf_token"]


@pytest.fixture
def auth_headers(csrf_token):
    """Headers that include the CSRF token (needed when FLASK_ENV != testing).

    In the default test configuration FLASK_ENV=testing bypasses CSRF,
    but this fixture is provided for completeness and for tests that
    explicitly want to exercise the CSRF mechanism.
    """
    return {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf_token,
    }


# ---------------------------------------------------------------------------
# Authenticated session fixtures
# ---------------------------------------------------------------------------

def _login(client, username, password):
    """Helper to log in and return the JSON response."""
    return client.post(
        "/api/login",
        json={"username": username, "password": password},
    )


@pytest.fixture
def admin_session(client):
    """Log in as the pre-seeded admin user on a fresh client."""
    c = app.test_client()
    resp = _login(c, "admin", "admin123")
    assert resp.status_code == 200, f"Admin login failed: {resp.get_json()}"
    return c


@pytest.fixture
def customer_session(client):
    """Log in as the pre-seeded customer user on a fresh client."""
    c = app.test_client()
    resp = _login(c, "customer", "customer123")
    assert resp.status_code == 200, f"Customer login failed: {resp.get_json()}"
    return c


@pytest.fixture
def new_user_session(client):
    """Register and log in a brand-new user. Yields (client, user_data)."""
    import uuid
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"testuser_{suffix}",
        "password": "TestPass123!",
        "full_name": "Test User",
        "email": f"test_{suffix}@example.com",
    }
    resp = client.post("/api/register", json=payload)
    assert resp.status_code == 200, f"Registration failed: {resp.get_json()}"
    data = resp.get_json()
    return client, data["user"]


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_order_payload():
    """A minimal valid order payload for product id=1."""
    return {
        "customer_name": "Test Customer",
        "phone": "9876543210",
        "address": "123 Test Street, Test City, 110001",
        "payment_mode": "Cash on delivery",
        "save_profile": False,
        "items": [{"product_id": 1, "quantity": 1, "size": "M"}],
    }


# ---------------------------------------------------------------------------
# DB-availability marker support
# ---------------------------------------------------------------------------

def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "db: marks tests that require a real MySQL database (skip with -m 'not db')",
    )
