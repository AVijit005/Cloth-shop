import secrets
import logging
import re
import threading
from datetime import datetime, timedelta
from functools import wraps
from flask import session, request, jsonify, redirect, url_for

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CSRF Protection
# ---------------------------------------------------------------------------

def ensure_csrf_token():
    """Ensure a CSRF token exists in the session (runs before_request)."""
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(32)


def validate_csrf(app_secret_key):
    """Validate CSRF token on state-changing requests (runs before_request)."""
    def wrapper():
        if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            csrf_token = request.headers.get("X-CSRF-Token") or ""
            session_csrf = session.get("csrf_token") or ""

            if not session_csrf or not secrets.compare_digest(csrf_token, session_csrf):
                return jsonify({"error": "Invalid or missing CSRF token"}), 400
    return wrapper


# ---------------------------------------------------------------------------
# Brute-force Protection
# ---------------------------------------------------------------------------

login_attempts = {}
login_attempts_lock = threading.Lock()


def is_blocked(username, ip):
    now = datetime.now()
    with login_attempts_lock:
        if username:
            att = login_attempts.get(f"u:{username}")
            if att and att["lockout_until"] and now < att["lockout_until"]:
                secs = int((att["lockout_until"] - now).total_seconds())
                return True, f"Account locked. Try again in {secs} seconds."
        if ip:
            att = login_attempts.get(f"ip:{ip}")
            if att and att["lockout_until"] and now < att["lockout_until"]:
                secs = int((att["lockout_until"] - now).total_seconds())
                return True, f"IP blocked. Try again in {secs} seconds."
    return False, None


def track_failed_login(username, ip):
    now = datetime.now()
    with login_attempts_lock:
        if username:
            att = login_attempts.get(f"u:{username}", {"count": 0, "lockout_until": None})
            att["count"] += 1
            if att["count"] >= 5:
                att["lockout_until"] = now + timedelta(minutes=5)
            login_attempts[f"u:{username}"] = att
        if ip:
            att = login_attempts.get(f"ip:{ip}", {"count": 0, "lockout_until": None})
            att["count"] += 1
            if att["count"] >= 10:
                att["lockout_until"] = now + timedelta(minutes=10)
            login_attempts[f"ip:{ip}"] = att


def clear_failed_logins(username, ip):
    with login_attempts_lock:
        if username:
            login_attempts.pop(f"u:{username}", None)
        if ip:
            login_attempts.pop(f"ip:{ip}", None)


# ---------------------------------------------------------------------------
# Password Validation
# ---------------------------------------------------------------------------

def validate_password_strength(password):
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase character."
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase character."
    if not re.search(r"\d", password):
        return "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>~`_\-=+\[\]\\;'/]", password):
        return "Password must contain at least one special character."
    return None


# ---------------------------------------------------------------------------
# Auth Decorators
# ---------------------------------------------------------------------------

def create_user_session(user, remember=False, username=None):
    """Create a Flask session for the given user dict."""
    session.clear()
    session.permanent = bool(remember)
    session["user"] = {
        "id": user["id"],
        "username": username or user.get("username"),
        "role": user["role"],
        "full_name": user["full_name"],
        "email_verified": int(user.get("email_verified", 0))
    }
    if user.get("saved_name") is not None:
        session["saved_name"] = user["saved_name"]
        session["saved_phone"] = user.get("saved_phone") or ""
        session["saved_address"] = user.get("saved_address") or ""


def require_login(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            return jsonify({"error": "Login required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            return jsonify({"error": "Login required"}), 401
        if session["user"]["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def html_login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login_page"))
        return fn(*args, **kwargs)
    return wrapper


def html_admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login_page"))
        if session["user"].get("role") != "admin":
            return redirect(url_for("index"))
        return fn(*args, **kwargs)
    return wrapper


