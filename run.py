import base64
import binascii
import json
import logging
import os
import re
import secrets
import time
import uuid
from datetime import datetime, UTC, timedelta
from functools import wraps
from html import escape
import threading
from urllib import parse

import mysql.connector
from mysql.connector.pooling import MySQLConnectionPool
from flask import Flask, jsonify, request, send_from_directory, session, render_template, redirect, url_for, g
from werkzeug.security import check_password_hash, generate_password_hash
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentry integration (optional — enable via SENTRY_DSN env var)
# ---------------------------------------------------------------------------
sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=sentry_dsn,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.getenv("FLASK_ENV", "development"),
            send_default_pii=False,
        )
        logger.info("Sentry initialized")
    except Exception as exc:
        logger.warning("Sentry init failed: %s", exc)
try:
    import firebase_admin
    from firebase_admin import credentials as firebase_creds
    import firebase_admin.auth as firebase_auth
    firebase_admin_available = True
except ImportError:
    firebase_admin_available = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
LOGS_FOLDER = os.path.join(BASE_DIR, "logs")
os.makedirs(LOGS_FOLDER, exist_ok=True)

load_dotenv()

DB_NAME = os.getenv("MYSQL_DATABASE") or os.getenv("SHIBANI_DB_NAME", "shibani_store")
if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_$]*$', DB_NAME):
    DB_NAME = "shibani_store"
    logger.warning("Invalid DB_NAME, defaulting to shibani_store")
DB_HOST = os.getenv("MYSQL_HOST")
DB_USER = os.getenv("MYSQL_USER") or os.getenv("SHIBANI_DB_USER", "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD") or os.getenv("SHIBANI_DB_PASSWORD", "")
try:
    DB_PORT = int(os.getenv("MYSQL_PORT") or 3306)
except (ValueError, TypeError):
    DB_PORT = 3306
    logger.warning("Invalid MYSQL_PORT, defaulting to 3306")

if not DB_HOST:
    logger.warning("MYSQL_HOST is not set — will use in-memory store")

app = Flask(__name__)
_secret_key = os.getenv("SECRET_KEY") or os.getenv("SHIBANI_SECRET_KEY")
if not _secret_key:
    _key_file = os.path.join(os.path.dirname(__file__), ".secret_key")
    if os.path.exists(_key_file):
        with open(_key_file) as f:
            _secret_key = f.read().strip()
    else:
        _secret_key = secrets.token_hex(32)
        try:
            with open(_key_file, "w") as f:
                f.write(_secret_key)
        except OSError:
            pass
app.secret_key = _secret_key

IS_PROD = os.getenv("FLASK_ENV") == "production" or os.getenv("SHIBANI_ENV") == "production"
app.config.update(
    SESSION_COOKIE_SECURE=IS_PROD,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30)  # max lifetime; session.permanent controls actual expiry
)

# Firebase Admin initialization
firebase_app = None
firebase_service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT")
if firebase_admin_available and firebase_service_account:
    try:
        cred = firebase_creds.Certificate(json.loads(firebase_service_account))
        firebase_app = firebase_admin.initialize_app(cred)
    except Exception as exc:
        logger.warning("Firebase init failed: %s", exc)

# --- SECURITY UTILITIES & MIDDLEWARE ---

# Page ID context — maps endpoints to data-page attribute for JS controllers
_PAGE_ID_MAP = {
    "index": "home",
    "shop_page": "shop",
    "product_page": "product",
    "cart_page": "cart",
    "wishlist_page": "wishlist",
    "orders_page": "orders",
    "profile_page": "profile",
    "login_page": "login",
    "signup_page": "signup",
    "forgot_password_page": "forgot-password",
    "reset_password_page": "reset-password",
    "about_page": "about",
    "contact_page": "contact",
    "admin_dashboard": "admin",
    "admin_products_page": "admin-products",
    "admin_orders_page": "admin-orders",
    "admin_customers_page": "admin-customers",
    "admin_reviews_page": "admin-reviews",
    "admin_analytics_page": "admin-analytics",
}

@app.context_processor
def inject_page_id():
    return {"page_id": _PAGE_ID_MAP.get(request.endpoint or "", ""), "IS_PROD": IS_PROD}

# Request ID middleware — tags every request with a traceable ID
@app.before_request
def assign_request_id():
    g.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]


@app.after_request
def add_security_and_caching_headers(response):
    # Request ID for traceability
    if hasattr(g, "request_id"):
        response.headers["X-Request-ID"] = g.request_id
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if IS_PROD:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Content-Security-Policy — least-privilege, Firebase Auth + Tailwind + CDNJS compatible
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' "
            "https://cdn.tailwindcss.com "
            "https://www.gstatic.com "
            "https://apis.google.com; "
        "style-src 'self' 'unsafe-inline' "
            "https://cdn.tailwindcss.com "
            "https://cdnjs.cloudflare.com "
            "https://fonts.googleapis.com; "
        "img-src 'self' data: blob: https:; "
        "font-src 'self' "
            "https://cdnjs.cloudflare.com "
            "https://fonts.gstatic.com; "
        "connect-src 'self' "
            "https://www.gstatic.com "
            "https://www.googleapis.com "
            "https://securetoken.googleapis.com "
            "https://identitytoolkit.googleapis.com "
            "https://accounts.google.com; "
        "frame-src https://*.firebaseapp.com https://accounts.google.com; "
    )
    # Browser caching for static assets
    if request.path.startswith("/static/") and response.content_type and "text/html" not in response.content_type:
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


# CSRF Protection
@app.before_request
def ensure_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(32)

@app.before_request
def validate_csrf():
    if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        # Skip CSRF for logout endpoint so stale tokens don't lock users out
        if request.path == "/api/logout":
            return
        csrf_token = request.headers.get("X-CSRF-Token") or ""
        session_csrf = session.get("csrf_token") or ""
        
        if not session_csrf or not secrets.compare_digest(csrf_token, session_csrf):
            return jsonify({"error": "Invalid or missing CSRF token"}), 400

# Quest/gamification handler (placeholder for future feature)
def update_quest_progress(user_id, quest_type):
    if quest_type == "write_review":
        if check_db_health():
            connection = None
            try:
                connection = db_connection()
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1 FROM users WHERE id = %s", (user_id,))
            except Exception:
                logger.debug("update_quest_progress skipped")
            finally:
                if connection is not None:
                    try:
                        connection.close()
                    except Exception:
                        pass

# Password Strength Rules
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
        return "Password must contain at least one special character (!@#$%^&* etc)."
    return None

# Brute-force Login Lockouts
login_attempts = {}
login_attempts_lock = threading.Lock()

# Thread safety for in-memory product stock (prevents overselling)
memory_products_lock = threading.Lock()
memory_orders_lock = threading.Lock()
memory_users_lock = threading.Lock()
memory_user_id_counter_lock = threading.Lock()
memory_reviews_lock = threading.Lock()
memory_wishlists_lock = threading.Lock()
memory_coupons_lock = threading.Lock()
memory_settings_lock = threading.Lock()

# Simple in-memory rate limiter (per-IP, sliding window)
_rate_limit_store = {}
_rate_limit_lock = threading.Lock()
_rate_limit_cleanup_counter = 0

def _rate_limit_cleanup():
    now = time.time()
    with _rate_limit_lock:
        cutoff = now - 3600
        stale_ips = [ip for ip, times in list(_rate_limit_store.items()) if not times or times[-1] < cutoff]
        for ip in stale_ips:
            del _rate_limit_store[ip]

def rate_limit(max_requests=5, window_seconds=60):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or "unknown"
            now = time.time()
            with _rate_limit_lock:
                window = _rate_limit_store.setdefault(ip, [])
                cutoff = now - window_seconds
                _rate_limit_store[ip] = [t for t in window if t > cutoff]
                if len(_rate_limit_store[ip]) >= max_requests:
                    return jsonify({"error": f"Too many requests. Try again in {window_seconds} seconds."}), 429
                _rate_limit_store[ip].append(now)
            global _rate_limit_cleanup_counter
            _rate_limit_cleanup_counter += 1
            if _rate_limit_cleanup_counter % 100 == 0:
                _rate_limit_cleanup()
            # Periodically clean stale entries (every 100 operations) and
            # safe-guard against counter overflow in long-running processes.
            if _rate_limit_cleanup_counter > 10_000_000:
                _rate_limit_cleanup()
                _rate_limit_cleanup_counter = 0
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def is_blocked(username, ip):
    now = datetime.now()
    with login_attempts_lock:
        if username:
            att = login_attempts.get(f"u:{username}")
            if att and att["lockout_until"] and now < att["lockout_until"]:
                secs = int((att["lockout_until"] - now).total_seconds())
                return True, f"Account temporarily locked due to failed attempts. Try again in {secs} seconds."
        if ip:
            att = login_attempts.get(f"ip:{ip}")
            if att and att["lockout_until"] and now < att["lockout_until"]:
                secs = int((att["lockout_until"] - now).total_seconds())
                return True, f"IP address temporarily blocked. Try again in {secs} seconds."
    return False, None

def track_failed_login(username, ip):
    now = datetime.now()
    with login_attempts_lock:
        if username:
            att = login_attempts.get(f"u:{username}", {"count": 0, "lockout_until": None, "last_attempt": now})
            att["count"] += 1
            att["last_attempt"] = now
            if att["count"] >= 5:
                att["lockout_until"] = now + timedelta(minutes=5)
            login_attempts[f"u:{username}"] = att
        if ip:
            att = login_attempts.get(f"ip:{ip}", {"count": 0, "lockout_until": None, "last_attempt": now})
            att["count"] += 1
            att["last_attempt"] = now
            if att["count"] >= 10:
                att["lockout_until"] = now + timedelta(minutes=10)
            login_attempts[f"ip:{ip}"] = att
        if len(login_attempts) > 10000:
            cutoff = now - timedelta(hours=24)
            for key in list(login_attempts.keys()):
                if login_attempts[key].get("last_attempt", now) < cutoff:
                    del login_attempts[key]

def clear_failed_logins(username, ip):
    with login_attempts_lock:
        if username:
            login_attempts.pop(f"u:{username}", None)
        if ip:
            login_attempts.pop(f"ip:{ip}", None)

def _sanitize_email_header(value):
    """Strip control characters from email header values to prevent header injection."""
    if value is None:
        return ""
    return re.sub(r"[\x00-\x1f\x7f]", "", str(value))

# Async Transactional Mail System (Dev logging + SMTP Support)
_smtp_threads = []
_smtp_threads_lock = threading.Lock()

def _cleanup_smtp_threads():
    """Remove finished thread references to prevent memory leak."""
    with _smtp_threads_lock:
        _smtp_threads[:] = [t for t in _smtp_threads if t.is_alive()]

def send_email(subject, recipient, body_html):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    sender = os.getenv("SMTP_SENDER", "noreply@shibanifashion.com")
    
    # Sanitize ALL header fields before any use (prevents SMTP header injection)
    safe_subject = _sanitize_email_header(subject)
    safe_recipient = _sanitize_email_header(recipient)
    safe_sender = _sanitize_email_header(sender)
    
    # Dev/test logging
    log_line = f"To: {safe_recipient} | Subject: {safe_subject}\nHTML Body:\n{body_html}\n{'='*80}\n"
    try:
        log_file = os.path.join(LOGS_FOLDER, "email_log.txt")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception as e:
        logger.error("Failed to log email: %s", e)
        
    if smtp_host and smtp_port and smtp_user and smtp_pass:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        def _send():
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = safe_subject
                msg["From"] = safe_sender
                msg["To"] = safe_recipient
                msg.attach(MIMEText(body_html, "html"))
                
                port = int(smtp_port)
                server = None
                try:
                    if port == 465:
                        server = smtplib.SMTP_SSL(smtp_host, port, timeout=10)
                    else:
                        server = smtplib.SMTP(smtp_host, port, timeout=10)
                        server.starttls()
                    if smtp_user and smtp_pass:
                        server.login(smtp_user, smtp_pass)
                    server.sendmail(safe_sender, [safe_recipient], msg.as_string())
                finally:
                    if server is not None:
                        server.quit()
            except Exception as ex:
                logger.error("SMTP email fail to %s: %s", safe_recipient, ex)
                
        thread = threading.Thread(target=_send, daemon=True)
        thread.start()
        with _smtp_threads_lock:
            _smtp_threads.append(thread)
        # Clean up finished threads periodically (keep list bounded)
        _cleanup_smtp_threads()


import atexit
def _join_smtp_threads():
    with _smtp_threads_lock:
        threads = list(_smtp_threads)
        _smtp_threads.clear()
    for t in threads:
        t.join(timeout=2)
atexit.register(_join_smtp_threads)


def send_verification_email(username, email, token, url_root=None):
    url = f"{(url_root or request.url_root).rstrip('/')}/verify-email?token={token}"
    safe_name = escape(username)
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 12px; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Welcome to Shibani Fashion!</h2>
        <p style="color: #475569; font-size: 14px;">Hello {safe_name}, thank you for registering with us.</p>
        <p style="color: #475569; font-size: 14px; margin-bottom: 24px;">To verify your email and activate your account, please click the button below:</p>
        <a href="{url}" style="display: inline-block; background-color: #4f46e5; color: white; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 8px;">Verify My Email</a>
        <div style="border-t: 1px solid #f0f0f0; margin-top: 24px; padding-top: 16px; font-size: 11px; color: #94a3b8;">
            If you did not sign up for this account, please ignore this email.
        </div>
    </div>
    """
    send_email("Activate Your Shibani Fashion Account", email, body)

def send_reset_password_email(username, email, token):
    url = f"{request.url_root.rstrip('/')}/reset-password?token={token}"
    safe_name = escape(username)
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 12px; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 14px;">Hello {safe_name}, we received a request to reset your password.</p>
        <p style="color: #475569; font-size: 14px; margin-bottom: 24px;">To reset your password, please click the button below (valid for 1 hour):</p>
        <a href="{url}" style="display: inline-block; background-color: #4f46e5; color: white; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 8px;">Reset Password</a>
        <div style="border-t: 1px solid #f0f0f0; margin-top: 24px; padding-top: 16px; font-size: 11px; color: #94a3b8;">
            If you did not request a password reset, you can safely ignore this email.
        </div>
    </div>
    """
    send_email("Reset Your Shibani Fashion Password", email, body)


def send_order_confirmation_email(user, customer_name, order_id, order_items, total, subtotal, discount, delivery, tax, other_charges, payment_mode, address, phone, coupon_code):
    user_email = None
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT email FROM users WHERE id = %s", (user["id"],))
                    row = cursor.fetchone()
                    if row:
                        user_email = row["email"]
        except Exception as exc:
            logger.error("Failed to fetch email for order %s: %s", order_id, exc)
    else:
        mu = memory_users.get(user["username"])
        if mu:
            user_email = mu.get("email")
    # Fall back to session-stored email if memory lookup fails
    if not user_email:
        user_email = user.get("email") or session.get("user", {}).get("email")
    if not user_email:
        logger.warning("Cannot send order confirmation: no email found for user %s", user.get("username"))
        return
    safe_name = escape(customer_name)
    safe_address = escape(address)
    safe_phone = escape(phone)
    safe_payment = escape(payment_mode)
    items_html = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">{escape(item["product_name"])}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">{item["quantity"]}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">Rs. {item["price"]:,.2f}</td></tr>'
        for item in order_items
    )
    safe_coupon = escape(coupon_code) if coupon_code else ""
    coupon_line = f"<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;'>Coupon ({safe_coupon})</td><td></td><td style='padding:8px 12px;border-bottom:1px solid #eee;text-align:right;'>-Rs. {discount:,.2f}</td></tr>" if coupon_code else ""
    body = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
        <h2 style="color:#4f46e5;margin:0 0 16px;">Order Confirmed &#9989;</h2>
        <p style="color:#475569;font-size:14px;margin:0 0 4px;">Hi {safe_name},</p>
        <p style="color:#475569;font-size:14px;margin:0 0 20px;">Thank you for your order! Here is your receipt:</p>
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">Order #<strong>{order_id}</strong></p>
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">Payment: {safe_payment}</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">Deliver to: {safe_address} &mdash; {safe_phone}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;">Item</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Price</th></tr></thead>
            <tbody>{items_html}</tbody>
            <tfoot>
                <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Subtotal</td><td></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">Rs. {subtotal:,.2f}</td></tr>
                {coupon_line}
                <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Delivery</td><td></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">{'Free' if delivery == 0 else f'Rs. {delivery:,.2f}'}</td></tr>
                <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Tax</td><td></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">Rs. {tax:,.2f}</td></tr>
                <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Other Charges</td><td></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">Rs. {other_charges:,.2f}</td></tr>
                <tr><td style="padding:10px 12px;font-weight:bold;">Total</td><td></td><td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:16px;">Rs. {total:,.2f}</td></tr>
            </tfoot>
        </table>
        <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;font-size:11px;color:#9ca3af;">
            If you have any questions, reply to this email or contact our support team.
        </div>
    </div>
    """
    send_email(f"Order Confirmed - #{order_id}", user_email, body)



def safe_float(value, default=0.0):
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_int(value, default=0):
    try:
        return int(value) if value is not None else default
    except (ValueError, TypeError):
        return default


# Allowed image MIME types for upload
ALLOWED_IMAGE_TYPES = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

def save_base64_image(base64_str):
    if not base64_str or not isinstance(base64_str, str):
        return ""
    if base64_str.startswith("data:image/"):
        try:
            header, encoded = base64_str.split(",", 1)
            match = re.search(r"data:image/(\w+);base64", header)
            ext = match.group(1).lower() if match else "png"
            if ext not in ALLOWED_IMAGE_TYPES:
                logger.warning("Rejected image upload with type: %s", ext)
                return ""
            if ext == "jpeg":
                ext = "jpg"
            if len(encoded) > MAX_IMAGE_SIZE * 2:
                logger.warning("Rejected image upload: base64 payload too large")
                return ""
            data = base64.b64decode(encoded)
            if len(data) > MAX_IMAGE_SIZE:
                logger.warning("Rejected image upload exceeding %d bytes", MAX_IMAGE_SIZE)
                return ""
            # Validate decoded data starts with a valid image magic bytes
            is_valid = any(data.startswith(sig) for sig in [b"\xff\xd8\xff", b"\x89PNG", b"GIF87a", b"GIF89a"])
            if not is_valid:
                is_valid = ext == "webp" and data.startswith(b"RIFF") and data[8:12] == b"WEBP"
            if not is_valid:
                logger.warning("Rejected upload: invalid image magic bytes")
                return ""
            filename = f"{secrets.token_hex(16)}.{ext}"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            with open(filepath, "wb") as f:
                f.write(data)
            return f"/uploads/{filename}"
        except (ValueError, TypeError, binascii.Error) as exc:
            logger.error("Failed to save base64 image: %s", exc)
    return base64_str



memory_products = []
memory_orders = []
memory_users = {}
_memory_user_id_counter = 100
memory_reviews = []
memory_wishlists = []
mysql_ready = False
mysql_error = ""
db_pool = None

memory_settings = {
    "gst_rate": "5.0",
    "delivery_fee_standard": "99.0",
    "delivery_fee_threshold": "999.0",
    "other_charges": "0.0"
}

_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
_CUSTOMER_PASSWORD = os.getenv("CUSTOMER_PASSWORD", "customer123")

def _admin_hash():
    return generate_password_hash(_ADMIN_PASSWORD)

def _customer_hash():
    return generate_password_hash(_CUSTOMER_PASSWORD)

memory_coupons = [
    {
        "id": 1,
        "code": "SHIBANI10",
        "discount_type": "percentage",
        "discount_value": 10.0,
        "min_subtotal": 0.0,
        "active": 1,
        "expires_at": None,
        "usage_limit": None,
        "usage_count": 0
    },
    {
        "id": 2,
        "code": "WELCOME200",
        "discount_type": "fixed",
        "discount_value": 200.0,
        "min_subtotal": 1000.0,
        "active": 1,
        "expires_at": None,
        "usage_limit": None,
        "usage_count": 0
    },
    {
        "id": 3,
        "code": "FREEDELIVERY",
        "discount_type": "percentage",
        "discount_value": 0.0,
        "min_subtotal": 0.0,
        "active": 1,
        "expires_at": None,
        "usage_limit": None,
        "usage_count": 0,
        "free_delivery": 1
    }
]

def get_settings_dict():
    with memory_settings_lock:
        res = dict(memory_settings)
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT setting_key, setting_value FROM settings")
                    rows = cursor.fetchall()
                    for row in rows:
                        res[row["setting_key"]] = row["setting_value"]
        except Exception as exc:
            logger.error("Failed to fetch settings from DB: %s", exc)
    return res



def init_pool():
    global db_pool
    db_pool = MySQLConnectionPool(
        pool_name="shibani_pool",
        pool_size=10,
        pool_reset_session=True,
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        port=DB_PORT,
        database=DB_NAME,
        autocommit=False,
        pool_get_timeout=5,
    )


starter_products = [
    {
        "name": "Elegant Printed Saree",
        "category": "women",
        "price": 1299,
        "old_price": 1699,
        "size": "Free size",
        "color": "Rose pink",
        "stock": "In stock",
        "rating": 4.8,
        "badge": "Best seller",
        "description": "Soft printed saree with a graceful drape for daily and festive wear.",
    },
    {
        "name": "Men Cotton Shirt",
        "category": "men",
        "price": 699,
        "old_price": 899,
        "size": "M, L, XL",
        "color": "Teal blue",
        "stock": "In stock",
        "rating": 4.5,
        "badge": "New",
        "description": "Breathable cotton shirt for office, college, and casual use.",
    },
    {
        "name": "Kids Color Set",
        "category": "kids",
        "price": 499,
        "old_price": 699,
        "size": "2-8 years",
        "color": "Yellow mix",
        "stock": "Limited stock",
        "rating": 4.6,
        "badge": "Limited",
        "description": "Bright and comfortable clothing set with soft child-friendly fabric.",
    },
    {
        "name": "Daily Wear Kurti",
        "category": "women",
        "price": 799,
        "old_price": 999,
        "size": "S, M, L",
        "color": "Green",
        "stock": "In stock",
        "rating": 4.7,
        "badge": "Fresh",
        "description": "Lightweight kurti for comfortable all-day wear.",
    },
    {
        "name": "Banarasi Silk Saree",
        "category": "women",
        "price": 2999,
        "old_price": 3999,
        "size": "Free size",
        "color": "Royal Red",
        "stock": "In stock",
        "rating": 4.9,
        "badge": "Premium",
        "description": "Luxurious Banarasi silk saree with intricate zari work, ideal for weddings and grand ceremonies.",
    },
    {
        "name": "Georgette Floral Saree",
        "category": "women",
        "price": 1499,
        "old_price": 1999,
        "size": "Free size",
        "color": "Lilac",
        "stock": "In stock",
        "rating": 4.6,
        "badge": "Trending",
        "description": "Light georgette saree featuring delicate floral prints, perfect for summer evening parties.",
    },
    {
        "name": "Designer Anarkali Suit",
        "category": "women",
        "price": 2499,
        "old_price": 3299,
        "size": "S, M, L, XL",
        "color": "Deep Teal",
        "stock": "In stock",
        "rating": 4.8,
        "badge": "Best seller",
        "description": "Floor-length cotton-silk Anarkali suit with gold embroidery and matching chiffon dupatta.",
    },
    {
        "name": "Cotton Linen Kurta",
        "category": "women",
        "price": 999,
        "old_price": 1399,
        "size": "M, L, XL",
        "color": "Beige",
        "stock": "In stock",
        "rating": 4.4,
        "badge": "Casual",
        "description": "Eco-friendly linen-blend straight kurta with classic neck patterns, perfect for work wear.",
    },
    {
        "name": "Chanderi Silk Saree",
        "category": "women",
        "price": 1899,
        "old_price": 2499,
        "size": "Free size",
        "color": "Golden Yellow",
        "stock": "Limited stock",
        "rating": 4.7,
        "badge": "New",
        "description": "Authentic Chanderi silk weave, lightweight and semi-sheer with a glossy texture.",
    },
    {
        "name": "Cotton Palazzo Pants",
        "category": "women",
        "price": 599,
        "old_price": 799,
        "size": "M, L, XL",
        "color": "Off-White",
        "stock": "In stock",
        "rating": 4.3,
        "badge": "",
        "description": "Comfortable wide-leg cotton palazzos, highly breathable and matches with all kurtis.",
    },
    {
        "name": "Slim Fit Cotton Blazer",
        "category": "men",
        "price": 3499,
        "old_price": 4999,
        "size": "M, L, XL",
        "color": "Charcoal Grey",
        "stock": "In stock",
        "rating": 4.7,
        "badge": "Premium",
        "description": "Structured slim-fit single-breasted blazer in breathable linen-cotton blend for business casuals.",
    },
    {
        "name": "Casual Plaid Shirt",
        "category": "men",
        "price": 899,
        "old_price": 1199,
        "size": "S, M, L, XL",
        "color": "Red/Black",
        "stock": "In stock",
        "rating": 4.5,
        "badge": "Trending",
        "description": "Soft brushed cotton flannel checkered shirt with dual chest pockets, perfect for casual outings.",
    },
    {
        "name": "Linen Casual Trousers",
        "category": "men",
        "price": 1499,
        "old_price": 1999,
        "size": "30, 32, 34, 36",
        "color": "Olive Green",
        "stock": "In stock",
        "rating": 4.4,
        "badge": "Summer Special",
        "description": "Regular fit lightweight linen trousers with drawstring waist and deep side pockets.",
    },
    {
        "name": "Solid Polo T-Shirt",
        "category": "men",
        "price": 599,
        "old_price": 799,
        "size": "M, L, XL, XXL",
        "color": "Navy Blue",
        "stock": "In stock",
        "rating": 4.6,
        "badge": "Essential",
        "description": "Classic pique cotton polo neck t-shirt with ribbed collars and sleeves for sport-casual wear.",
    },
    {
        "name": "Formal Oxford Shirt",
        "category": "men",
        "price": 1199,
        "old_price": 1599,
        "size": "S, M, L, XL",
        "color": "Classic White",
        "stock": "In stock",
        "rating": 4.7,
        "badge": "Best seller",
        "description": "Premium heavyweight Oxford cotton weave formal shirt with button-down collars.",
    },
    {
        "name": "Ethnic Kurta Pajama Set",
        "category": "men",
        "price": 1799,
        "old_price": 2399,
        "size": "M, L, XL",
        "color": "Maroon",
        "stock": "Limited stock",
        "rating": 4.8,
        "badge": "Festive",
        "description": "Elegant cotton-silk blend long kurta paired with comfortable white churidar pajamas.",
    },
    {
        "name": "Kids Denim Dungarees",
        "category": "kids",
        "price": 899,
        "old_price": 1299,
        "size": "3-6 years",
        "color": "Indigo Denim",
        "stock": "In stock",
        "rating": 4.6,
        "badge": "Trending",
        "description": "Durable denim dungaree dress with adjustable shoulder straps and colorful cute patchworks.",
    },
    {
        "name": "Floral Party Gown",
        "category": "kids",
        "price": 1199,
        "old_price": 1699,
        "size": "4-9 years",
        "color": "Peach Pink",
        "stock": "In stock",
        "rating": 4.7,
        "badge": "Festive",
        "description": "Elegant multi-layer net party dress with floral appliques and comfortable inner cotton lining.",
    },
    {
        "name": "Toddler Cotton Romper",
        "category": "kids",
        "price": 399,
        "old_price": 599,
        "size": "0-18 months",
        "color": "Sky Blue Print",
        "stock": "In stock",
        "rating": 4.8,
        "badge": "Super Soft",
        "description": "100% organic cotton snap-button romper with cute cartoon patterns, gentle on baby skin.",
    },
    {
        "name": "Kids Kurta Dhoti Set",
        "category": "kids",
        "price": 999,
        "old_price": 1399,
        "size": "2-7 years",
        "color": "Mustard Yellow",
        "stock": "Limited stock",
        "rating": 4.7,
        "badge": "New",
        "description": "Traditional cotton silk printed boys kurta paired with pre-stitched matching dhoti pants.",
    },
    {
        "name": "Boys Graphic T-Shirt",
        "category": "kids",
        "price": 349,
        "old_price": 499,
        "size": "5-10 years",
        "color": "Citrus Green",
        "stock": "In stock",
        "rating": 4.5,
        "badge": "",
        "description": "Fun graphic print cotton crewneck t-shirt, tagless label to prevent neck itching.",
    },
    {
        "name": "Girls Casual Skirt Set",
        "category": "kids",
        "price": 699,
        "old_price": 999,
        "size": "3-8 years",
        "color": "Pink stripes",
        "stock": "In stock",
        "rating": 4.4,
        "badge": "Fresh",
        "description": "Striped cotton top paired with matching dynamic tiered flared cotton skirt.",
    },
    {
        "name": "Unisex Woolen Sweater",
        "category": "kids",
        "price": 799,
        "old_price": 1099,
        "size": "2-6 years",
        "color": "Mustard Yellow",
        "stock": "In stock",
        "rating": 4.6,
        "badge": "Winter",
        "description": "Cozy and warm knitted round-neck woolen sweater made of non-scratchy soft acrylic yarn.",
    },
    {
        "name": "Kids Summer Shorts Pack",
        "category": "kids",
        "price": 449,
        "old_price": 599,
        "size": "2-8 years",
        "color": "Assorted 3-Pack",
        "stock": "In stock",
        "rating": 4.5,
        "badge": "Value Pack",
        "description": "Three-pack of comfortable pull-on elastic waistband cotton shorts with drawstring.",
    }
]


def server_connection(database=None):
    config = {
        "host": DB_HOST,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "port": DB_PORT,
        "autocommit": False,
        "connect_timeout": 2,
    }
    if database:
        config["database"] = database
    return mysql.connector.connect(**config)


def db_connection():
    if db_pool:
        try:
            return db_pool.get_connection()
        except Exception:
            pass
    return server_connection(DB_NAME)


last_db_check_time = 0
_db_health_lock = threading.Lock()


def check_db_health():
    global mysql_ready, last_db_check_time
    if mysql_ready:
        return True
    
    with _db_health_lock:
        if mysql_ready:
            return True
        current_time = time.time()
        # Retry database connection only if 15 seconds have passed since last failure
        if current_time - last_db_check_time > 15:
            last_db_check_time = current_time
            init_mysql()
    return mysql_ready



def init_memory_store():
    global memory_products
    if memory_products:
        return
    memory_products = [
        {
            "id": index + 1,
            "image": "",
            "created_at": datetime.now(UTC).isoformat(),
            **product,
        }
        for index, product in enumerate(starter_products)
    ]


def init_mysql():
    global mysql_ready, mysql_error
    try:
        with server_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                cursor.execute(f"USE `{DB_NAME}`")
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      username VARCHAR(80) NOT NULL UNIQUE,
                      password_hash VARCHAR(255) NOT NULL,
                      role ENUM('admin', 'customer') NOT NULL,
                      full_name VARCHAR(120) NOT NULL,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                ensure_column(cursor, "users", "username", "VARCHAR(80)")
                ensure_column(cursor, "users", "role", "ENUM('admin', 'customer') NOT NULL DEFAULT 'customer'")
                try:
                    cursor.execute("UPDATE users SET username = CONCAT('user_', id) WHERE (username IS NULL OR username = '')")
                except Exception:
                    pass
                try:
                    cursor.execute("CREATE UNIQUE INDEX idx_users_username ON users(username)")
                except Exception:
                    pass
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS products (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      name VARCHAR(160) NOT NULL,
                      category ENUM('men', 'women', 'kids') NOT NULL,
                      price DECIMAL(10,2) NOT NULL,
                      old_price DECIMAL(10,2) DEFAULT 0,
                      size VARCHAR(120) NOT NULL,
                      color VARCHAR(80) NOT NULL,
                      stock VARCHAR(40) NOT NULL,
                      rating DECIMAL(2,1) DEFAULT 4.5,
                      badge VARCHAR(80) DEFAULT '',
                      description TEXT,
                      image LONGTEXT,
                      images LONGTEXT,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                ensure_column(cursor, "products", "images", "LONGTEXT")
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS orders (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      user_id INT,
                      customer_name VARCHAR(120) NOT NULL,
                      phone VARCHAR(40) NOT NULL,
                      address TEXT NOT NULL,
                      payment_mode VARCHAR(80) NOT NULL,
                      total DECIMAL(10,2) NOT NULL,
                      status VARCHAR(40) NOT NULL DEFAULT 'New',
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS order_items (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      order_id INT NOT NULL,
                      product_id INT,
                      product_name VARCHAR(160) NOT NULL,
                      quantity INT NOT NULL,
                      price DECIMAL(10,2) NOT NULL,
                      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS settings (
                      setting_key VARCHAR(80) PRIMARY KEY,
                      setting_value TEXT NOT NULL
                    )
                    """
                )
                try:
                    cursor.execute("SHOW COLUMNS FROM `settings` LIKE 'key'")
                    if cursor.fetchone():
                        cursor.execute("ALTER TABLE `settings` CHANGE COLUMN `key` `setting_key` VARCHAR(80)")
                except Exception:
                    pass
                try:
                    cursor.execute("SHOW COLUMNS FROM `settings` LIKE 'value'")
                    if cursor.fetchone():
                        cursor.execute("ALTER TABLE `settings` CHANGE COLUMN `value` `setting_value` TEXT")
                except Exception:
                    pass
                cursor.execute("SELECT COUNT(*) FROM settings")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('gst_rate', '5.0')")
                    cursor.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('delivery_fee_standard', '99.0')")
                    cursor.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('delivery_fee_threshold', '999.0')")
                    cursor.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('other_charges', '0.0')")

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS coupons (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      code VARCHAR(50) NOT NULL UNIQUE,
                      discount_type ENUM('percentage', 'fixed') NOT NULL,
                      discount_value DECIMAL(10,2) NOT NULL,
                      min_subtotal DECIMAL(10,2) DEFAULT 0,
                      active TINYINT(1) DEFAULT 1,
                      expires_at DATETIME DEFAULT NULL,
                      usage_limit INT DEFAULT NULL,
                      usage_count INT DEFAULT 0,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                cursor.execute("SELECT COUNT(*) FROM coupons")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active) VALUES ('SHIBANI10', 'percentage', 10.0, 0.0, 1)")
                    cursor.execute("INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active) VALUES ('WELCOME200', 'fixed', 200.0, 1000.0, 1)")
                    cursor.execute("INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active) VALUES ('FREEDELIVERY', 'fixed', 0.0, 0.0, 1)")
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS reviews (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      user_id INT NOT NULL,
                      username VARCHAR(80) NOT NULL,
                      product_id INT NOT NULL,
                      rating INT NOT NULL,
                      comment TEXT,
                      sizing_fit VARCHAR(40) NOT NULL,
                      status VARCHAR(40) DEFAULT 'approved',
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS wishlists (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      user_id INT NOT NULL,
                      product_id INT NOT NULL,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                      UNIQUE KEY unique_user_product (user_id, product_id)
                    )
                    """
                )
                ensure_column(cursor, "users", "saved_name", "VARCHAR(120)")
                ensure_column(cursor, "users", "saved_phone", "VARCHAR(40)")
                ensure_column(cursor, "users", "saved_address", "TEXT")
                ensure_column(cursor, "users", "email", "VARCHAR(120) DEFAULT NULL")
                ensure_column(cursor, "users", "email_verified", "TINYINT(1) DEFAULT 0")
                ensure_column(cursor, "users", "verification_token", "VARCHAR(100) DEFAULT NULL")
                ensure_column(cursor, "users", "verification_token_expires", "DATETIME DEFAULT NULL")
                ensure_column(cursor, "users", "reset_token", "VARCHAR(100) DEFAULT NULL")
                ensure_column(cursor, "users", "reset_token_expires", "DATETIME DEFAULT NULL")
                try:
                    cursor.execute("CREATE UNIQUE INDEX idx_users_email ON users(email)")
                except Exception:
                    pass

                ensure_column(cursor, "order_items", "size", "VARCHAR(40)")
                ensure_column(cursor, "coupons", "expires_at", "DATETIME DEFAULT NULL")
                ensure_column(cursor, "coupons", "usage_limit", "INT DEFAULT NULL")
                ensure_column(cursor, "coupons", "usage_count", "INT DEFAULT 0")
                ensure_column(cursor, "coupons", "free_delivery", "TINYINT(1) DEFAULT 0")

                seed_user(cursor, "admin", _ADMIN_PASSWORD, "admin", "Shibani Admin")
                seed_user(cursor, "customer", _CUSTOMER_PASSWORD, "customer", "Shibani Customer")
                cursor.execute("SELECT COUNT(*) FROM products")
                if cursor.fetchone()[0] == 0:
                    for product in starter_products:
                        cursor.execute(
                            """
                            INSERT INTO products
                            (name, category, price, old_price, size, color, stock, rating, badge, description, image)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                product["name"],
                                product["category"],
                                product["price"],
                                product["old_price"],
                                product["size"],
                                product["color"],
                                product["stock"],
                                product["rating"],
                                product["badge"],
                                product["description"],
                                "",
                            ),
                        )
                connection.commit()
        init_pool()
        mysql_ready = True
        mysql_error = ""
    except Exception as exc:
        mysql_ready = False
        mysql_error = str(exc)
        init_memory_store()


def seed_user(cursor, username, password, role, full_name):
    cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
    if cursor.fetchone():
        return
    cursor.execute(
        "INSERT INTO users (username, password_hash, role, full_name, email_verified) VALUES (%s, %s, %s, %s, 1)",
        (username, generate_password_hash(password), role, full_name),
    )


def json_payload():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def ensure_column(cursor, table_name, column_name, definition):
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name) or not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', column_name):
        return
    # Only allow known column definitions that match common SQL column types
    allowed_definitions = {
        "VARCHAR(80)",
        "VARCHAR(120)",
        "VARCHAR(100)",
        "VARCHAR(40)",
        "VARCHAR(50)",
        "VARCHAR(160)",
        "TEXT",
        "LONGTEXT",
        "TINYINT(1) DEFAULT 0",
        "DATETIME DEFAULT NULL",
        "VARCHAR(120) DEFAULT NULL",
        "VARCHAR(100) DEFAULT NULL",
        "INT DEFAULT NULL",
        "INT DEFAULT 0",
        "ENUM('admin', 'customer') NOT NULL DEFAULT 'customer'",
    }
    normalized_def = definition.strip().rstrip(";").strip()
    if normalized_def not in allowed_definitions:
        logger.warning("Rejected column definition: %s", definition)
        return
    cursor.execute("SHOW COLUMNS FROM `{}` LIKE %s".format(table_name), (column_name,))
    if cursor.fetchone():
        return
    cursor.execute("ALTER TABLE `{}` ADD COLUMN `{}` {}".format(table_name, column_name, normalized_def))


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





def product_row_to_dict(row):
    images = parse_images(row.get("images"), row.get("image") or "")
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "price": float(row["price"]),
        "old_price": float(row["old_price"] or 0),
        "size": row["size"] or "",
        "color": row["color"],
        "stock": row["stock"],
        "rating": float(row["rating"] or 4.5),
        "badge": row["badge"] or "",
        "description": row["description"] or "",
        "image": row["image"] or "",
        "images": images,
        "created_at": str(row["created_at"]),
    }


def parse_images(images_value, fallback_image=""):
    if isinstance(images_value, list):
        images = list(images_value)
    else:
        try:
            images = json.loads(images_value or "[]")
        except (TypeError, json.JSONDecodeError, ValueError):
            images = []
    if fallback_image:
        fallback_image = fallback_image.strip()
        if fallback_image and fallback_image not in images:
            images.insert(0, fallback_image)
    return [image for image in images if image]


def create_user_session(user, remember=False, username=None):
    """Create a Flask session for the given user dict. Mutates session in place."""
    session.clear()
    session["csrf_token"] = secrets.token_hex(32)  # Regenerate CSRF token after session clear
    session.permanent = bool(remember)
    session["user"] = {
        "id": user["id"],
        "username": username or user.get("username"),
        "role": user["role"],
        "full_name": user["full_name"],
        "email": user.get("email", ""),
        "email_verified": int(user.get("email_verified") or 0)
    }
    if user.get("saved_name") is not None:
        session["saved_name"] = user["saved_name"]
        session["saved_phone"] = user.get("saved_phone") or ""
        session["saved_address"] = user.get("saved_address") or ""
    session.modified = True


def user_by_username(username):
    """Look up a user dict by username. Checks DB first, then in-memory store."""
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
                    return cursor.fetchone()
        except Exception:
            pass
    return memory_users.get(username)


def create_user(username, password_hash, full_name, email, verification_token):
    """Insert a new user row and return the new id, or None on conflict."""
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(%s) OR email = %s", (username, email))
                    if cursor.fetchone():
                        return None
                    cursor.execute(
                        """INSERT INTO users (username, password_hash, role, full_name, email, verification_token, email_verified)
                           VALUES (%s, %s, 'customer', %s, %s, %s, 0)""",
                        (username, password_hash, full_name, email, verification_token),
                    )
                    connection.commit()
                    return cursor.lastrowid
        except Exception:
            return None
    return None


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


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/shop")
def shop_page():
    return render_template("shop.html")


@app.route("/product/<int:product_id>")
def product_page(product_id):
    product = None
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM products WHERE id = %s", (product_id,))
                    product = cursor.fetchone()
        except Exception:
            pass
    if not product:
        product = next((p for p in memory_products if p["id"] == product_id), None)
    
    if not product:
        return jsonify({"error": "Product not found"}), 404
    
    # Convert DB row (with Decimal types) to plain Python dict for template rendering
    if check_db_health() and hasattr(product, "items"):
        product = product_row_to_dict(product)
        
    images_list = parse_images(product.get("images"), product.get("image") or "")
    product["images_list"] = images_list
    return render_template("product.html", product=product)


@app.route("/login")
def login_page():
    if "user" in session:
        if session["user"].get("role") == "admin":
            return redirect(url_for("admin_dashboard"))
        return redirect(url_for("index"))
    return render_template("login.html")


@app.route("/signup")
def signup_page():
    if "user" in session:
        return redirect(url_for("index"))
    return render_template("signup.html")


@app.route("/about")
def about_page():
    return render_template("about.html")


@app.route("/contact")
def contact_page():
    return render_template("contact.html")


@app.route("/cart")
@html_login_required
def cart_page():
    return render_template("cart.html")


@app.route("/wishlist")
@html_login_required
def wishlist_page():
    return render_template("wishlist.html")


@app.route("/orders")
@html_login_required
def orders_page():
    return render_template("orders.html")


@app.route("/order-confirmation")
@html_login_required
def order_confirmation_page():
    return render_template("order_confirmation.html")


@app.route("/profile")
@html_login_required
def profile_page():
    return render_template("profile.html")



@app.route("/admin")
@html_admin_required
def admin_dashboard():
    return render_template("admin/overview.html")


@app.route("/admin/products")
@html_admin_required
def admin_products_page():
    return render_template("admin/products.html")


@app.route("/admin/orders")
@html_admin_required
def admin_orders_page():
    return render_template("admin/orders.html")


@app.route("/admin/customers")
@html_admin_required
def admin_customers_page():
    return render_template("admin/customers.html")


@app.route("/admin/reviews")
@html_admin_required
def admin_reviews_page():
    return render_template("admin/reviews.html")


@app.route("/admin/analytics")
@html_admin_required
def admin_analytics_page():
    return render_template("admin/analytics.html")


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    response = send_from_directory(UPLOAD_FOLDER, filename)
    response.headers["Cache-Control"] = "public, max-age=604800, immutable"
    response.headers["Content-Disposition"] = "inline"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response



@app.get("/api/status")
def status():
    db_ok = check_db_health()
    return jsonify(
        {
            "status": "healthy" if db_ok else "degraded",
            "mysql_ready": db_ok,
            "database": DB_NAME,
            "mysql_error": bool(mysql_error),

        }
    )


@app.get("/api/health")
def health():
    """Minimal health check for load balancers — always returns 200."""
    return jsonify({"status": "ok"}), 200


@app.post("/api/login")
@rate_limit(max_requests=10, window_seconds=60)
def login():
    data = json_payload()
    username = (data.get("username") or "").strip().upper()
    password = data.get("password", "")
    remember_raw = data.get("remember", False)
    remember = remember_raw is True or (isinstance(remember_raw, str) and remember_raw.lower() not in ("false", "0", ""))
    ip = request.remote_addr

    # 1. Brute-force throttling check
    blocked, block_msg = is_blocked(username, ip)
    if blocked:
        return jsonify({"error": block_msg}), 429

    user = None
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
                    user = cursor.fetchone()
            
            if not user or not check_password_hash(user["password_hash"], password):
                track_failed_login(username, ip)
                return jsonify({"error": "Wrong ID or password"}), 401
                
            clear_failed_logins(username, ip)

            create_user_session(user, remember)

            return jsonify({"user": session["user"], "csrf_token": session.get("csrf_token", "")})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        # Secure fallback passwords using hash matching
        fallback_users = {
            "ADMIN": {
                "password_hash": _admin_hash(),
                "role": "admin",
                "full_name": "Shibani Admin",
                "id": 1,
                "email_verified": 1
            },
            "CUSTOMER": {
                "password_hash": _customer_hash(),
                "role": "customer",
                "full_name": "Shibani Customer",
                "id": 2,
                "email_verified": 1
            },
        }
        user = fallback_users.get(username) or memory_users.get(username)
        if not user or not check_password_hash(user["password_hash"], password):
            track_failed_login(username, ip)
            return jsonify({"error": "Wrong ID or password"}), 401
            
        clear_failed_logins(username, ip)

        create_user_session(user, remember, username=username)

        session["saved_name"] = user.get("saved_name") or ""
        session["saved_phone"] = user.get("saved_phone") or ""
        session["saved_address"] = user.get("saved_address") or ""

        return jsonify({"user": session["user"], "csrf_token": session.get("csrf_token", "")})


@app.post("/api/login/google")
def google_login():
    data = json_payload()
    id_token = data.get("id_token", "")

    if not id_token:
        return jsonify({"error": "ID token is required"}), 400

    if not firebase_admin_available or not firebase_app:
        return jsonify({"error": "Google sign-in is not configured on this server"}), 503

    try:
        decoded_token = firebase_auth.verify_id_token(id_token, check_revoked=True)
        email = decoded_token.get("email", "")
        name = decoded_token.get("name", email.split("@")[0] if email else "Google User")

        if not email:
            return jsonify({"error": "Email is required from Google account"}), 400

        user = None

        if check_db_health():
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
                    user = cursor.fetchone()

                    if not user:
                        base_username = email.split("@")[0]
                        while True:
                            cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(%s)", (base_username,))
                            if not cursor.fetchone():
                                break
                            base_username = f"{base_username}_{secrets.token_hex(2)}"

                        cursor.execute(
                            """INSERT INTO users (username, password_hash, role, full_name, email, email_verified)
                               VALUES (%s, %s, 'customer', %s, %s, 1)""",
                            (base_username, generate_password_hash(secrets.token_hex(32)), name, email)
                        )
                        connection.commit()
                        user = {
                            "id": cursor.lastrowid,
                            "username": base_username,
                            "role": "customer",
                            "full_name": name,
                            "email_verified": 1
                        }
                    else:
                        # Existing user logging in via Google — mark email as verified
                        user["email_verified"] = 1
                        cursor.execute(
                            "UPDATE users SET email_verified = 1 WHERE id = %s",
                            (user["id"],)
                        )
                        connection.commit()
        else:
            with memory_users_lock:
                existing = next((u for u in memory_users.values() if u.get("email") == email), None)
                if existing:
                    user = existing
                    user["email_verified"] = 1
                else:
                    base_username = email.split("@")[0]
                    while base_username in memory_users or base_username in {"admin", "customer"}:
                        base_username = f"{base_username}_{secrets.token_hex(2)}"
                    global _memory_user_id_counter
                    with memory_user_id_counter_lock:
                        user_id = _memory_user_id_counter
                        _memory_user_id_counter += 1
                    memory_users[base_username] = {
                        "id": user_id,
                        "password_hash": generate_password_hash(secrets.token_hex(32)),
                        "role": "customer",
                        "full_name": name,
                        "email": email,
                        "email_verified": 1
                    }
                    user = {
                        "id": user_id,
                        "username": base_username,
                        "role": "customer",
                        "full_name": name,
                        "email_verified": 1
                    }

        create_user_session(user, remember=False)

        return jsonify({"user": session["user"], "csrf_token": session.get("csrf_token", "")})

    except Exception as exc:
        return jsonify({"error": "Google authentication failed"}), 401


@app.post("/api/register")
@rate_limit(max_requests=5, window_seconds=300)
def register():
    data = json_payload()
    username = (data.get("username") or "").strip()
    password = data.get("password", "")
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip()

    if not username or not password or not full_name or not email:
        return jsonify({"error": "All fields are required"}), 400

    if len(username) > 80:
        return jsonify({"error": "Username too long (max 80 characters)"}), 400
    if len(full_name) > 120:
        return jsonify({"error": "Full name too long (max 120 characters)"}), 400

    # 1. Email format check
    if not re.match(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", email):
        return jsonify({"error": "Please enter a valid email address"}), 400

    # 2. Password Strength Check
    strength_err = validate_password_strength(password)
    if strength_err:
        return jsonify({"error": strength_err}), 400

    verification_token = secrets.token_urlsafe(32)
    verification_expires = datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=24)

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    # Check username duplicate
                    cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
                    if cursor.fetchone():
                        return jsonify({"error": "Username already taken"}), 400
                    
                    # Check email duplicate
                    cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
                    if cursor.fetchone():
                        return jsonify({"error": "Email already registered"}), 400
                    
                    p_hash = generate_password_hash(password)
                    cursor.execute(
                        """
                        INSERT INTO users (username, password_hash, role, full_name, email, email_verified, verification_token, verification_token_expires)
                        VALUES (%s, %s, 'customer', %s, %s, 0, %s, %s)
                        """,
                        (username, p_hash, full_name, email, verification_token, verification_expires)
                    )
                    connection.commit()
                    user_id = cursor.lastrowid
            
            # Send activation email asynchronously
            send_verification_email(full_name, email, verification_token)

            new_user = {"id": user_id, "username": username, "role": "customer", "full_name": full_name, "email_verified": 0}
            create_user_session(new_user)
            return jsonify({"user": session["user"], "csrf_token": session.get("csrf_token", "")})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        with memory_users_lock:
            fallback_users = {"admin", "customer"}
            if username in memory_users or username in fallback_users:
                return jsonify({"error": "Username already taken"}), 400
            
            if any(u.get("email") == email for u in memory_users.values()):
                return jsonify({"error": "Email already registered"}), 400

            global _memory_user_id_counter
            with memory_user_id_counter_lock:
                user_id = _memory_user_id_counter
                _memory_user_id_counter += 1
            memory_users[username] = {
            "id": user_id,
            "password_hash": generate_password_hash(password),
            "role": "customer",
            "full_name": full_name,
            "email": email,
            "email_verified": 0,
            "verification_token": verification_token,
            "verification_token_expires": verification_expires
        }
        
        send_verification_email(full_name, email, verification_token)

        new_user = {"id": user_id, "username": username, "role": "customer", "full_name": full_name, "email_verified": 0}
        create_user_session(new_user)
        return jsonify({"user": session["user"], "csrf_token": session.get("csrf_token", "")})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/forgot-password")
@rate_limit(max_requests=3, window_seconds=120)
def forgot_password_api():
    data = json_payload()
    email_or_username = (data.get("email") or "").strip()
    if not email_or_username:
        return jsonify({"error": "Username or email is required"}), 400

    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    # Find user by username or email
                    cursor.execute("SELECT id, username, email, full_name FROM users WHERE LOWER(username) = LOWER(%s) OR email = %s", (email_or_username, email_or_username))
                    user = cursor.fetchone()
                    if not user:
                        # For security, return success even if user not found to prevent username enumeration
                        return jsonify({"ok": True, "message": "If the account exists, a reset link has been sent."})

                    recipient = user.get("email") or "no-reply@shibanifashion.com"
                    
                    cursor.execute(
                        "UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
                        (token, expires, user["id"])
                    )
                    connection.commit()
            
            send_reset_password_email(user["full_name"], recipient, token)
            return jsonify({"ok": True, "message": "If the account exists, a reset link has been sent."})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        # Fallback check
        user = memory_users.get(email_or_username)
        if not user:
            user_entry = next((u for u in memory_users.values() if u.get("email") == email_or_username), None)
            if user_entry:
                user = user_entry
        if not user:
            return jsonify({"ok": True, "message": "If the account exists, a reset link has been sent."})
            
        user["reset_token"] = token
        user["reset_token_expires"] = expires
        recipient = user.get("email") or "no-reply@shibanifashion.com"
        send_reset_password_email(user["full_name"], recipient, token)
        return jsonify({"ok": True, "message": "If the account exists, a reset link has been sent."})


@app.post("/api/reset-password")
@rate_limit(max_requests=5, window_seconds=300)
def reset_password_api():
    data = json_payload()
    token = (data.get("token") or "").strip()
    password = data.get("password", "")

    if not token or not password:
        return jsonify({"error": "Token and password are required"}), 400

    strength_err = validate_password_strength(password)
    if strength_err:
        return jsonify({"error": strength_err}), 400

    p_hash = generate_password_hash(password)
    now = datetime.now(UTC).replace(tzinfo=None)

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id, reset_token_expires FROM users WHERE reset_token = %s", (token,))
                    user = cursor.fetchone()
                    if not user or not user.get("reset_token_expires"):
                        return jsonify({"error": "Invalid or expired token"}), 400
                    
                    if user["reset_token_expires"] < now:
                        return jsonify({"error": "Invalid or expired token"}), 400
                        
                    # Invalidate existing sessions for this user after password change
                    cursor.execute(
                        "UPDATE users SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL WHERE id = %s",
                        (p_hash, user["id"])
                    )
                    connection.commit()
            # Clear the current session to force re-login
            session.clear()
            return jsonify({"ok": True, "message": "Password has been reset successfully."})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        user = next((u for u in memory_users.values() if u.get("reset_token") == token), None)
        if not user:
            return jsonify({"error": "Invalid or expired token"}), 400
        if user.get("reset_token_expires") is None or user.get("reset_token_expires") < now:
            return jsonify({"error": "Invalid or expired token"}), 400
            
        user["password_hash"] = p_hash
        user["reset_token"] = None
        user["reset_token_expires"] = None
        return jsonify({"ok": True, "message": "Password has been reset successfully."})


@app.route("/verify-email")
def verify_email():
    token = request.args.get("token", "").strip()
    if not token:
        return render_template("verify_email.html", success=False, error="Verification token is missing.")

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id, verification_token_expires FROM users WHERE verification_token = %s", (token,))
                    user = cursor.fetchone()
                    if not user:
                        return render_template("verify_email.html", success=False, error="Invalid or expired verification token.")
                    if user.get("verification_token_expires") and user["verification_token_expires"] < datetime.now(UTC).replace(tzinfo=None):
                        return render_template("verify_email.html", success=False, error="Invalid or expired verification token.")
                    
                    cursor.execute(
                        "UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = %s",
                        (user["id"],)
                    )
                    connection.commit()
            
            if "user" in session and session["user"]["id"] == user["id"]:
                session["user"]["email_verified"] = 1
                session.modified = True
                
            return render_template("verify_email.html", success=True)
        except Exception as exc:
            return render_template("verify_email.html", success=False, error="Database error")
    else:
        username = next((k for k, u in memory_users.items() if u.get("verification_token") == token), None)
        if not username:
            return render_template("verify_email.html", success=False, error="Invalid or expired verification token.")

        user = memory_users[username]
        expires = user.get("verification_token_expires")
        if expires and expires < datetime.now(UTC).replace(tzinfo=None):
            return render_template("verify_email.html", success=False, error="Invalid or expired verification token.")
        user["email_verified"] = 1
        user["verification_token"] = None
        user["verification_token_expires"] = None
        
        if "user" in session and session["user"]["username"] == username:
            session["user"]["email_verified"] = 1
            session.modified = True
            
        return render_template("verify_email.html", success=True)


@app.route("/forgot-password")
def forgot_password_page():
    return render_template("forgot_password.html")


@app.route("/reset-password")
def reset_password_page():
    token = request.args.get("token", "")
    return render_template("reset_password.html", token=token)



@app.get("/api/me")
def me():
    return jsonify({"user": session.get("user")})


@app.get("/api/products")
def products():
    page = request.args.get("page", 1, type=int)
    page = max(1, page)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(max(per_page, 1), 200)  # clamp 1-200
    offset = (page - 1) * per_page

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT COUNT(*) AS total FROM products")
                    total = cursor.fetchone()["total"]
                    cursor.execute(
                        "SELECT * FROM products ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
                        (per_page, offset)
                    )
                    rows = cursor.fetchall()
            return jsonify({
                "products": [product_row_to_dict(row) for row in rows],
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": (total + per_page - 1) // per_page
            })
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500

    # Memory fallback: naive pagination
    total = len(memory_products)
    paged = memory_products[offset:offset + per_page]
    return jsonify({
        "products": paged,
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": (total + per_page - 1) // per_page
    })


@app.post("/api/products")
@require_admin
def create_product():
    data = json_payload()
    product = normalize_product(data)
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO products
                        (name, category, price, old_price, size, color, stock, rating, badge, description, image, images)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            product["name"],
                            product["category"],
                            product["price"],
                            product["old_price"],
                            product["size"],
                            product["color"],
                            product["stock"],
                            product["rating"],
                            product["badge"],
                            product["description"],
                            product["image"],
                            json.dumps(product["images"]),
                        ),
                    )
                    connection.commit()
                    product["id"] = cursor.lastrowid
                    product["created_at"] = datetime.now(UTC).isoformat()
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        with memory_products_lock:
            product["id"] = max([item["id"] for item in memory_products], default=0) + 1
            product["created_at"] = datetime.now(UTC).isoformat()
            memory_products.insert(0, product)

    return jsonify({"product": product}), 201


@app.put("/api/products/<int:product_id>")
@require_admin
def update_product(product_id):
    data = json_payload()
    product = normalize_product(data)
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM products WHERE id = %s", (product_id,))
                    if not cursor.fetchone():
                        return jsonify({"error": "Product not found"}), 404
                    cursor.execute(
                        """
                        UPDATE products
                        SET name = %s, category = %s, price = %s, old_price = %s, size = %s,
                            color = %s, stock = %s, rating = %s, badge = %s, description = %s,
                            image = %s, images = %s
                        WHERE id = %s
                        """,
                        (
                            product["name"],
                            product["category"],
                            product["price"],
                            product["old_price"],
                            product["size"],
                            product["color"],
                            product["stock"],
                            product["rating"],
                            product["badge"],
                            product["description"],
                            product["image"],
                            json.dumps(product["images"]),
                            product_id,
                        ),
                    )
                    connection.commit()
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        with memory_products_lock:
            found = False
            for index, existing in enumerate(memory_products):
                if existing["id"] == product_id:
                    memory_products[index] = {**existing, **product, "id": product_id}
                    found = True
                    break
            if not found:
                return jsonify({"error": "Product not found"}), 404
            product = memory_products[index]
    return jsonify({"product": product})


@app.delete("/api/products/<int:product_id>")
@require_admin
def delete_product(product_id):
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM products WHERE id = %s", (product_id,))
                    connection.commit()
                    if cursor.rowcount == 0:
                        return jsonify({"error": "Product not found"}), 404
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        with memory_products_lock:
            found = any(p["id"] == product_id for p in memory_products)
            if not found:
                return jsonify({"error": "Product not found"}), 404
            memory_products[:] = [product for product in memory_products if product["id"] != product_id]
    return jsonify({"ok": True})


@app.get("/api/qr")
def qr_proxy():
    import urllib.request
    data = request.args.get("data", "")
    if not data or len(data) > 500:
        return jsonify({"error": "Invalid QR data"}), 400
    try:
        qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=160x160&data={parse.quote(data)}"
        req = urllib.request.Request(qr_url, headers={"User-Agent": "ShibaniFashion/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read(), 200, {"Content-Type": "image/png", "Cache-Control": "no-cache"}
    except Exception as exc:
        logger.error("QR proxy failed: %s", exc)
        return jsonify({"error": "QR generation failed"}), 502

@app.get("/api/settings")
def get_settings():
    settings = get_settings_dict()
    return jsonify({
        "gst_rate": float(settings.get("gst_rate", 5.0)),
        "delivery_fee_standard": float(settings.get("delivery_fee_standard", 99.0)),
        "delivery_fee_threshold": float(settings.get("delivery_fee_threshold", 999.0)),
        "other_charges": float(settings.get("other_charges", 0.0))
    })


@app.put("/api/settings")
@require_login
def update_settings():
    if session["user"]["role"] != "admin":
        return jsonify({"error": "Admin access required"}), 403
    
    data = json_payload()
    gst_rate = str(max(0.0, safe_float(data.get("gst_rate"), 5.0)))
    delivery_fee_standard = str(max(0.0, safe_float(data.get("delivery_fee_standard"), 99.0)))
    delivery_fee_threshold = str(max(0.0, safe_float(data.get("delivery_fee_threshold"), 999.0)))
    other_charges = str(max(0.0, safe_float(data.get("other_charges"), 0.0)))
    
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    for key, val in [
                        ("gst_rate", gst_rate),
                        ("delivery_fee_standard", delivery_fee_standard),
                        ("delivery_fee_threshold", delivery_fee_threshold),
                        ("other_charges", other_charges)
                    ]:
                        cursor.execute(
                            "INSERT INTO settings (setting_key, setting_value) VALUES (%s, %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                            (key, val, val)
                        )
                    connection.commit()
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        with memory_settings_lock:
            memory_settings["gst_rate"] = gst_rate
            memory_settings["delivery_fee_standard"] = delivery_fee_standard
            memory_settings["delivery_fee_threshold"] = delivery_fee_threshold
            memory_settings["other_charges"] = other_charges
        
    return jsonify({
        "gst_rate": float(gst_rate),
        "delivery_fee_standard": float(delivery_fee_standard),
        "delivery_fee_threshold": float(delivery_fee_threshold),
        "other_charges": float(other_charges)
    })


@app.get("/api/coupons")
def get_active_coupons():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id, code, discount_type, discount_value, min_subtotal, active, expires_at, usage_limit, usage_count FROM coupons WHERE active = 1 ORDER BY code ASC")
                    rows = cursor.fetchall()
                    for r in rows:
                        r["discount_value"] = float(r["discount_value"])
                        r["min_subtotal"] = float(r["min_subtotal"])
                        if r.get("expires_at"):
                            r["expires_at"] = str(r["expires_at"])
                    return jsonify({"coupons": rows})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        active = [dict(c) for c in memory_coupons if c["active"] == 1]
        for c in active:
            c["discount_value"] = float(c["discount_value"])
            c["min_subtotal"] = float(c["min_subtotal"])
        return jsonify({"coupons": active})


@app.get("/api/admin/coupons")
@require_login
def get_all_coupons():
    if session["user"]["role"] != "admin":
        return jsonify({"error": "Admin access required"}), 403
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM coupons ORDER BY id DESC")
                    rows = cursor.fetchall()
                    for r in rows:
                        r["discount_value"] = float(r["discount_value"])
                        r["min_subtotal"] = float(r["min_subtotal"])
                        if r.get("expires_at"):
                            r["expires_at"] = str(r["expires_at"])
                    return jsonify(rows)
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        all_c = [dict(c) for c in memory_coupons]
        all_c.reverse()
        for c in all_c:
            c["discount_value"] = float(c["discount_value"])
            c["min_subtotal"] = float(c["min_subtotal"])
        return jsonify(all_c)


@app.post("/api/admin/coupons")
@require_login
def create_coupon():
    if session["user"]["role"] != "admin":
        return jsonify({"error": "Admin access required"}), 403
    data = json_payload()
    code = (data.get("code") or "").strip().upper()
    discount_type = data.get("discount_type")
    discount_value = safe_float(data.get("discount_value"), 0.0)
    min_subtotal = safe_float(data.get("min_subtotal"), 0.0)
    active = 1 if data.get("active") else 0
    
    expires_at = data.get("expires_at")
    if not expires_at or expires_at == "":
        expires_at = None
    
    usage_limit = data.get("usage_limit")
    if usage_limit is None or usage_limit == "":
        usage_limit = None
    else:
        try:
            usage_limit = int(usage_limit)
        except (ValueError, TypeError):
            return jsonify({"error": "Usage limit must be an integer"}), 400

    if not code:
        return jsonify({"error": "Coupon code is required"}), 400
    if discount_type not in ["percentage", "fixed"]:
        return jsonify({"error": "Invalid discount type"}), 400
    if discount_value < 0:
        return jsonify({"error": "Discount value cannot be negative"}), 400

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM coupons WHERE code = %s", (code,))
                    if cursor.fetchone():
                        return jsonify({"error": f"Coupon code '{code}' already exists"}), 400
                    cursor.execute(
                        """
                        INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active, expires_at, usage_limit, usage_count)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, 0)
                        """,
                        (code, discount_type, discount_value, min_subtotal, active, expires_at, usage_limit)
                    )
                    connection.commit()
                    new_id = cursor.lastrowid
            return jsonify({
                "id": new_id,
                "code": code,
                "discount_type": discount_type,
                "discount_value": discount_value,
                "min_subtotal": min_subtotal,
                "active": active,
                "expires_at": str(expires_at) if expires_at else None,
                "usage_limit": usage_limit,
                "usage_count": 0
            })
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        if any(c["code"] == code for c in memory_coupons):
            return jsonify({"error": f"Coupon code '{code}' already exists"}), 400
        new_id = max([c["id"] for c in memory_coupons], default=0) + 1
        new_coupon = {
            "id": new_id,
            "code": code,
            "discount_type": discount_type,
            "discount_value": discount_value,
            "min_subtotal": min_subtotal,
            "active": active,
            "expires_at": str(expires_at) if expires_at else None,
            "usage_limit": usage_limit,
            "usage_count": 0
        }
        memory_coupons.append(new_coupon)
        return jsonify(new_coupon)


@app.put("/api/admin/coupons/<int:coupon_id>")
@require_login
def update_coupon(coupon_id):
    if session["user"]["role"] != "admin":
        return jsonify({"error": "Admin access required"}), 403
    data = json_payload()
    code = (data.get("code") or "").strip().upper()
    discount_type = data.get("discount_type")
    discount_value = safe_float(data.get("discount_value"), 0.0)
    min_subtotal = safe_float(data.get("min_subtotal"), 0.0)
    active = 1 if data.get("active") else 0
    
    expires_at = data.get("expires_at")
    if not expires_at or expires_at == "":
        expires_at = None
    
    usage_limit = data.get("usage_limit")
    if usage_limit is None or usage_limit == "":
        usage_limit = None
    else:
        try:
            usage_limit = int(usage_limit)
        except (ValueError, TypeError):
            return jsonify({"error": "Usage limit must be an integer"}), 400

    if not code:
        return jsonify({"error": "Coupon code is required"}), 400
    if discount_type not in ["percentage", "fixed"]:
        return jsonify({"error": "Invalid discount type"}), 400
    if discount_value < 0:
        return jsonify({"error": "Discount value cannot be negative"}), 400

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id FROM coupons WHERE code = %s AND id != %s", (code, coupon_id))
                    if cursor.fetchone():
                        return jsonify({"error": f"Coupon code '{code}' already exists"}), 400
                    
                    cursor.execute("SELECT usage_count FROM coupons WHERE id = %s", (coupon_id,))
                    row = cursor.fetchone()
                    if not row:
                        return jsonify({"error": "Coupon not found"}), 404
                    usage_count = row["usage_count"]

                    cursor.execute(
                        """
                        UPDATE coupons
                        SET code = %s, discount_type = %s, discount_value = %s, min_subtotal = %s, active = %s, expires_at = %s, usage_limit = %s
                        WHERE id = %s
                        """,
                        (code, discount_type, discount_value, min_subtotal, active, expires_at, usage_limit, coupon_id)
                    )
                    connection.commit()
            return jsonify({
                "id": coupon_id,
                "code": code,
                "discount_type": discount_type,
                "discount_value": discount_value,
                "min_subtotal": min_subtotal,
                "active": active,
                "expires_at": str(expires_at) if expires_at else None,
                "usage_limit": usage_limit,
                "usage_count": usage_count
            })
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        if any(c["code"] == code and c["id"] != coupon_id for c in memory_coupons):
            return jsonify({"error": f"Coupon code '{code}' already exists"}), 400
        for c in memory_coupons:
            if c["id"] == coupon_id:
                c["code"] = code
                c["discount_type"] = discount_type
                c["discount_value"] = discount_value
                c["min_subtotal"] = min_subtotal
                c["active"] = active
                c["expires_at"] = str(expires_at) if expires_at else None
                c["usage_limit"] = usage_limit
                # preserve usage_count
                usage_count = c.get("usage_count", 0)
                return jsonify(c)
        return jsonify({"error": "Coupon not found"}), 404


@app.delete("/api/admin/coupons/<int:coupon_id>")
@require_login
def delete_coupon(coupon_id):
    if session["user"]["role"] != "admin":
        return jsonify({"error": "Admin access required"}), 403
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM coupons WHERE id = %s", (coupon_id,))
                    connection.commit()
            return jsonify({"ok": True})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        global memory_coupons
        with memory_coupons_lock:
            memory_coupons = [c for c in memory_coupons if c["id"] != coupon_id]
        return jsonify({"ok": True})


@app.get("/api/orders")
@require_admin
def orders():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM orders ORDER BY id DESC")
                    rows = cursor.fetchall()
                    order_ids = [o["id"] for o in rows]
                    items_by_order = {}
                    if order_ids:
                        placeholders = ",".join(["%s"] * len(order_ids))
                        cursor.execute(f"SELECT * FROM order_items WHERE order_id IN ({placeholders})", order_ids)
                        all_items = cursor.fetchall()
                        for item in all_items:
                            item["price"] = float(item["price"])
                            items_by_order.setdefault(item["order_id"], []).append(item)
                    for order in rows:
                        order["items"] = items_by_order.get(order["id"], [])
                        order["total"] = float(order["total"])
                        order["created_at"] = str(order["created_at"])
            return jsonify({"orders": rows})
        except Exception:
            return jsonify({"error": "Database error"}), 500

    return jsonify({"orders": memory_orders})


@app.patch("/api/orders/<int:order_id>/status")
@require_admin
def update_order_status(order_id):
    data = json_payload()
    status = data.get("status", "New")
    allowed_statuses = {"New", "Confirmed", "Packed", "Out for delivery", "Delivered", "Cancelled"}
    if status not in allowed_statuses:
        return jsonify({"error": "Invalid order status"}), 400

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM orders WHERE id = %s", (order_id,))
                    if not cursor.fetchone():
                        return jsonify({"error": "Order not found"}), 404
                    cursor.execute("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
                    connection.commit()
        except Exception:
            return jsonify({"error": "Database error"}), 500
    else:
        found = False
        for order in memory_orders:
            if order["id"] == order_id:
                order["status"] = status
                found = True
                break
        if not found:
            return jsonify({"error": "Order not found"}), 404
    return jsonify({"ok": True, "status": status})


@app.get("/api/admin/customers")
@require_admin
def admin_get_customers():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("""
                        SELECT id, username, full_name, email, saved_name, saved_phone, saved_address 
                        FROM users 
                        WHERE role = 'customer'
                        ORDER BY id DESC
                    """)
                    rows = cursor.fetchall()
                    return jsonify({"customers": rows})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    
    customers = []
    default_cust_saved_name = memory_users.get("customer", {}).get("saved_name") or ""
    default_cust_saved_phone = memory_users.get("customer", {}).get("saved_phone") or ""
    default_cust_saved_address = memory_users.get("customer", {}).get("saved_address") or ""
    customers.append({
        "id": 2,
        "username": "customer",
        "full_name": "Shibani Customer",
        "saved_name": default_cust_saved_name,
        "saved_phone": default_cust_saved_phone,
        "saved_address": default_cust_saved_address
    })
    
    for uname, udata in memory_users.items():
        if uname == "customer":
            continue
        if udata.get("role") == "customer":
            customers.append({
                "id": udata.get("id"),
                "username": uname,
                "full_name": udata.get("full_name"),
                "saved_name": udata.get("saved_name") or "",
                "saved_phone": udata.get("saved_phone") or "",
                "saved_address": udata.get("saved_address") or ""
            })
            
    customers.sort(key=lambda x: x["id"], reverse=True)
    return jsonify({"customers": customers})


@app.get("/api/profile")
@require_login
def get_profile():
    user = session["user"]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT username, full_name, role, saved_name, saved_phone, saved_address FROM users WHERE id = %s", (user["id"],))
                    profile = cursor.fetchone()
            if profile:
                    return jsonify({
                    "username": profile["username"],
                    "full_name": profile["full_name"],
                    "role": profile["role"],
                    "saved_name": profile["saved_name"] or "",
                    "saved_phone": profile["saved_phone"] or "",
                    "saved_address": profile["saved_address"] or ""
                })
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    
    username = user["username"]
    mem_user = memory_users.get(username) or {}
    return jsonify({
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "saved_name": mem_user.get("saved_name") or session.get("saved_name") or "",
        "saved_phone": mem_user.get("saved_phone") or session.get("saved_phone") or "",
        "saved_address": mem_user.get("saved_address") or session.get("saved_address") or ""
    })


@app.put("/api/profile")
@require_login
def update_profile():
    user = session["user"]
    data = json_payload()
    saved_name = (data.get("saved_name") or "").strip()
    saved_phone = (data.get("saved_phone") or "").strip()
    saved_address = (data.get("saved_address") or "").strip()

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE users
                        SET saved_name = %s, saved_phone = %s, saved_address = %s
                        WHERE id = %s
                        """,
                        (saved_name, saved_phone, saved_address, user["id"])
                    )
                    connection.commit()
            return jsonify({"ok": True, "saved_name": saved_name, "saved_phone": saved_phone, "saved_address": saved_address})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    session["saved_name"] = saved_name
    session["saved_phone"] = saved_phone
    session["saved_address"] = saved_address
    
    username = user["username"]
    with memory_users_lock:
        if username in memory_users:
            memory_users[username]["saved_name"] = saved_name
            memory_users[username]["saved_phone"] = saved_phone
            memory_users[username]["saved_address"] = saved_address
        
    return jsonify({"ok": True, "saved_name": saved_name, "saved_phone": saved_phone, "saved_address": saved_address})


@app.get("/api/orders/my")
@require_login
def my_orders():
    user = session["user"]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM orders WHERE user_id = %s ORDER BY id DESC", (user["id"],))
                    rows = cursor.fetchall()
                    order_ids = [o["id"] for o in rows]
                    items_by_order = {}
                    if order_ids:
                        placeholders = ",".join(["%s"] * len(order_ids))
                        cursor.execute(f"SELECT * FROM order_items WHERE order_id IN ({placeholders})", order_ids)
                        all_items = cursor.fetchall()
                        for item in all_items:
                            item["price"] = float(item["price"])
                            item["size"] = item.get("size") or ""
                            items_by_order.setdefault(item["order_id"], []).append(item)
                    for order in rows:
                        order["items"] = items_by_order.get(order["id"], [])
                        order["total"] = float(order["total"])
                        order["created_at"] = str(order["created_at"])
            return jsonify({"orders": rows})
        except Exception:
            return jsonify({"error": "Database error"}), 500
            
    # For transient fallback, match orders based on logged in user's username
    username = user["username"]
    user_orders = [o for o in memory_orders if o.get("username") == username]
    return jsonify({"orders": user_orders})


@app.put("/api/orders/<int:order_id>/cancel")
@require_login
def cancel_order(order_id):
    user = session["user"]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    # check if the order exists and belongs to the logged in user
                    cursor.execute("SELECT * FROM orders WHERE id = %s AND user_id = %s", (order_id, user["id"]))
                    order = cursor.fetchone()
                    if not order:
                        return jsonify({"error": "Order not found"}), 404
                    if order["status"] != "New":
                        return jsonify({"error": "Only orders with 'New' status can be cancelled"}), 400
                    
                    # Update status to Cancelled
                    cursor.execute("UPDATE orders SET status = %s WHERE id = %s", ("Cancelled", order_id))
                    
                    # Restock inventory items
                    cursor.execute("SELECT * FROM order_items WHERE order_id = %s", (order_id,))
                    items = cursor.fetchall()
                    for item in items:
                        cursor.execute("SELECT stock FROM products WHERE id = %s FOR UPDATE", (item["product_id"],))
                        p_row = cursor.fetchone()
                        if p_row:
                            current_stock = p_row["stock"]
                            new_stock = increment_stock_string(current_stock)
                            cursor.execute("UPDATE products SET stock = %s WHERE id = %s", (new_stock, item["product_id"]))
                    
                    connection.commit()
            return jsonify({"ok": True, "status": "Cancelled"})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
    else:
        # Memory fallback
        found_order = None
        for order in memory_orders:
            if order["id"] == order_id:
                found_order = order
                break
        if not found_order:
            return jsonify({"error": "Order not found"}), 404
        if str(found_order.get("user_id")) != str(user["id"]) or found_order.get("username") != user["username"]:
            return jsonify({"error": "Order not found"}), 404
        if found_order.get("status") != "New":
            return jsonify({"error": "Only orders with 'New' status can be cancelled"}), 400
        
        found_order["status"] = "Cancelled"
        
        # Restock
        for item in found_order.get("items", []):
            for p in memory_products:
                if p["id"] == item["product_id"]:
                    p["stock"] = increment_stock_string(p.get("stock", ""))
                    break
        
        
        return jsonify({"ok": True, "status": "Cancelled"})


def decrement_stock_string(current_stock):
    if not current_stock:
        return "Out of stock"
    norm = current_stock.strip().lower()
    if norm == "in stock":
        return "Limited stock"
    return "Out of stock"


def increment_stock_string(current_stock):
    if not current_stock:
        return "In stock"
    norm = current_stock.strip().lower()
    if norm == "out of stock":
        return "Limited stock"
    if norm == "limited stock":
        return "In stock"
    # For any other value (e.g., numeric stock), return as-is (unchanged)
    return current_stock


def update_user_address_book(current_saved_address, new_address, new_name, new_phone):
    if not new_address:
        return current_saved_address
    
    addresses = []
    if current_saved_address:
        try:
            parsed = json.loads(current_saved_address)
            if isinstance(parsed, list):
                addresses = parsed
            else:
                addresses = [{"label": "Default", "address": str(parsed), "name": new_name, "phone": new_phone}]
        except Exception:
            addresses = [{"label": "Default", "address": current_saved_address, "name": new_name, "phone": new_phone}]
    
    already_exists = False
    for addr in addresses:
        if isinstance(addr, dict) and addr.get("address", "").strip().lower() == new_address.strip().lower():
            already_exists = True
            if new_name:
                addr["name"] = new_name
            if new_phone:
                addr["phone"] = new_phone
            break
            
    if not already_exists:
        label = "Home" if len(addresses) == 0 else f"Address {len(addresses) + 1}"
        addresses.append({
            "label": label,
            "address": new_address,
            "name": new_name or "",
            "phone": new_phone or ""
        })
        
    return json.dumps(addresses)




# --- Customer Product Reviews & Sizing Fit Feedback API ---
@app.get("/api/reviews")
def get_reviews():
    product_id = request.args.get("product_id", type=int)
    if not product_id:
        return jsonify({"error": "product_id required"}), 400
        
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute(
                        "SELECT * FROM reviews WHERE product_id = %s AND status = 'approved' ORDER BY created_at DESC",
                        (product_id,)
                    )
                    rows = cursor.fetchall()
            return jsonify({"reviews": rows})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    prod_reviews = [r for r in memory_reviews if r["product_id"] == product_id and r["status"] == "approved"]
    prod_reviews.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify({"reviews": prod_reviews})

@app.post("/api/reviews")
@require_login
def create_review():
    user = session["user"]
    data = json_payload()
    product_id = data.get("product_id")
    rating = data.get("rating")
    comment = data.get("comment", "")
    sizing_fit = data.get("sizing_fit", "fit") # small, fit, large
    
    if not product_id or not rating:
        return jsonify({"error": "product_id and rating are required"}), 400
    
    try:
        rating = int(rating)
    except (ValueError, TypeError):
        return jsonify({"error": "rating must be an integer"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "rating must be between 1 and 5"}), 400

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute(
                        "SELECT id FROM reviews WHERE user_id = %s AND product_id = %s",
                        (user["id"], product_id)
                    )
                    if cursor.fetchone():
                        return jsonify({"error": "You have already reviewed this product"}), 400
                    cursor.execute(
                        "INSERT INTO reviews (user_id, username, product_id, rating, comment, sizing_fit, status) VALUES (%s, %s, %s, %s, %s, %s, 'approved')",
                        (user["id"], user["username"], product_id, rating, comment, sizing_fit)
                    )
                    connection.commit()
                    review_id = cursor.lastrowid
            update_quest_progress(user["id"], "write_review")
            return jsonify({"ok": True, "review": {"id": review_id, "user_id": user["id"], "username": user["username"], "product_id": product_id, "rating": rating, "comment": comment, "sizing_fit": sizing_fit, "status": "approved"}})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    existing_review = next((r for r in memory_reviews if r["user_id"] == user["id"] and r["product_id"] == product_id), None)
    if existing_review:
        return jsonify({"error": "You have already reviewed this product"}), 400
    new_id = max([r["id"] for r in memory_reviews], default=0) + 1
    new_review = {
        "id": new_id,
        "user_id": user["id"],
        "username": user["username"],
        "product_id": product_id,
        "rating": rating,
        "comment": comment,
        "sizing_fit": sizing_fit,
        "status": "approved",
        "created_at": datetime.now(UTC).isoformat()
    }
    with memory_reviews_lock:
        memory_reviews.append(new_review)
    update_quest_progress(user["id"], "write_review")
    return jsonify({"ok": True, "review": new_review})

@app.get("/api/admin/reviews")
@require_admin
def admin_get_reviews():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT r.*, p.name as product_name FROM reviews r JOIN products p ON r.product_id = p.id ORDER BY r.created_at DESC")
                    rows = cursor.fetchall()
            return jsonify({"reviews": rows})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    rows = []
    for r in memory_reviews:
        prod = next((p for p in memory_products if p["id"] == r["product_id"]), None)
        prod_name = prod["name"] if prod else "Unknown Product"
        rows.append({**r, "product_name": prod_name})
    rows.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify({"reviews": rows})

@app.patch("/api/admin/reviews/<int:review_id>")
@require_admin
def admin_patch_review(review_id):
    data = json_payload()
    status = data.get("status") # approved, hidden
    if not status:
        return jsonify({"error": "status is required"}), 400
        
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("UPDATE reviews SET status = %s WHERE id = %s", (status, review_id))
                    connection.commit()
            return jsonify({"ok": True})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    for r in memory_reviews:
        if r["id"] == review_id:
            r["status"] = status
            return jsonify({"ok": True})
    return jsonify({"error": "Review not found"}), 404

@app.delete("/api/admin/reviews/<int:review_id>")
@require_admin
def admin_delete_review(review_id):
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM reviews WHERE id = %s", (review_id,))
                    connection.commit()
            return jsonify({"ok": True})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    global memory_reviews
    with memory_reviews_lock:
        memory_reviews = [r for r in memory_reviews if r["id"] != review_id]
    return jsonify({"ok": True})

# --- Wishlist & Registry API ---
@app.get("/api/wishlist")
@require_login
def get_wishlist():
    user = session["user"]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute(
                        "SELECT p.* FROM wishlists w JOIN products p ON w.product_id = p.id WHERE w.user_id = %s ORDER BY w.created_at DESC",
                        (user["id"],)
                    )
                    rows = cursor.fetchall()
            return jsonify({"wishlist": [product_row_to_dict(row) for row in rows]})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    wish_p_ids = [w["product_id"] for w in memory_wishlists if w["user_id"] == user["id"]]
    wish_products = [p for p in memory_products if p["id"] in wish_p_ids]
    return jsonify({"wishlist": wish_products})

@app.post("/api/wishlist")
@require_login
def toggle_wishlist():
    user = session["user"]
    data = json_payload()
    product_id = data.get("product_id")
    if not product_id:
        return jsonify({"error": "product_id is required"}), 400
        
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM wishlists WHERE user_id = %s AND product_id = %s", (user["id"], product_id))
                    existing = cursor.fetchone()
                    if existing:
                        cursor.execute("DELETE FROM wishlists WHERE id = %s", (existing[0],))
                        added = False
                    else:
                        cursor.execute("INSERT INTO wishlists (user_id, product_id) VALUES (%s, %s)", (user["id"], product_id))
                        added = True
                    connection.commit()
            return jsonify({"ok": True, "added": added})
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    # In-memory fallback
    global memory_wishlists
    with memory_wishlists_lock:
        existing = next((w for w in memory_wishlists if w["user_id"] == user["id"] and w["product_id"] == product_id), None)
        if existing:
            memory_wishlists = [w for w in memory_wishlists if not (w["user_id"] == user["id"] and w["product_id"] == product_id)]
            added = False
        else:
            new_id = max([w["id"] for w in memory_wishlists], default=0) + 1
            memory_wishlists.append({
                "id": new_id,
                "user_id": user["id"],
                "product_id": product_id,
                "created_at": datetime.now(UTC).isoformat()
            })
            added = True
    return jsonify({"ok": True, "added": added})


# --- Financial Reports & Sales Trend Analytics API ---
@app.get("/api/admin/analytics")
@require_admin
def get_analytics():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders")
                    summary = cursor.fetchone()
                    total_orders = summary["total_orders"] or 0
                    total_revenue = float(summary["total_revenue"] or 0.0)
                    aov = total_revenue / total_orders if total_orders > 0 else 0.0
                    
                    points_earned = 0
                    points_redeemed = 0
                    
                    cursor.execute(
                        """
                        SELECT p.category, SUM(oi.price * oi.quantity) as category_revenue 
                        FROM order_items oi 
                        JOIN products p ON oi.product_id = p.id 
                        GROUP BY p.category
                        """
                    )
                    cat_rows = cursor.fetchall()
                    category_sales = {"men": 0.0, "women": 0.0, "kids": 0.0}
                    for row in cat_rows:
                        cat = row["category"]
                        if cat in category_sales:
                            category_sales[cat] = float(row["category_revenue"] or 0.0)
                            
                    cursor.execute(
                        """
                        SELECT DATE(created_at) as date, SUM(total) as daily_revenue, COUNT(*) as daily_orders 
                        FROM orders 
                        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) 
                        GROUP BY DATE(created_at) 
                        ORDER BY DATE(created_at) ASC
                        """
                    )
                    trend_rows = cursor.fetchall()
                    daily_trend = []
                    weekly_sales = {}
                    for row in trend_rows:
                        d_str = row["date"].strftime("%Y-%m-%d") if hasattr(row["date"], "strftime") else str(row["date"])
                        daily_revenue = float(row["daily_revenue"] or 0.0)
                        daily_trend.append({
                            "date": d_str,
                            "revenue": daily_revenue,
                            "orders": int(row["daily_orders"] or 0)
                        })
                        weekly_sales[d_str] = daily_revenue
                        
            return jsonify({
                "summary": {
                    "total_revenue": total_revenue,
                    "total_orders": total_orders,
                    "aov": aov,
                    "points_earned": points_earned,
                    "points_redeemed": points_redeemed
                },
                "category_sales": category_sales,
                "daily_trend": daily_trend,
                "weekly_sales": weekly_sales
            })
        except Exception as exc:
            return jsonify({"error": "Database error"}), 500
            
    total_orders = len(memory_orders)
    total_revenue = sum(float(o.get("total", 0.0)) for o in memory_orders)
    aov = total_revenue / total_orders if total_orders > 0 else 0.0
    
    points_earned = 0
    points_redeemed = 0
    
    category_sales = {"men": 0.0, "women": 0.0, "kids": 0.0}
    for order in memory_orders:
        for item in order.get("items", []):
            prod = next((p for p in memory_products if p["id"] == item.get("product_id")), None)
            if prod:
                cat = prod.get("category", "")
                if cat in category_sales:
                    category_sales[cat] += float(item.get("price", 0.0)) * int(item.get("quantity", 0))
                    
    trend_dict = {}
    for o in memory_orders:
        created_at = o.get("created_at", "")
        d_str = created_at[:10] if len(created_at) >= 10 else datetime.now().strftime("%Y-%m-%d")
        if d_str not in trend_dict:
            trend_dict[d_str] = {"revenue": 0.0, "orders": 0}
        trend_dict[d_str]["revenue"] += float(o.get("total", 0.0))
        trend_dict[d_str]["orders"] += 1
        
    daily_trend = []
    weekly_sales = {}
    for d_str in sorted(trend_dict.keys()):
        daily_revenue = trend_dict[d_str]["revenue"]
        daily_trend.append({
            "date": d_str,
            "revenue": daily_revenue,
            "orders": trend_dict[d_str]["orders"]
        })
        weekly_sales[d_str] = daily_revenue
        
    return jsonify({
        "summary": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "aov": aov,
            "points_earned": points_earned,
            "points_redeemed": points_redeemed
        },
        "category_sales": category_sales,
        "daily_trend": daily_trend,
        "weekly_sales": weekly_sales
    })


@app.post("/api/orders")
@require_login
def create_order():
    data = json_payload()
    items = data.get("items", [])
    if not isinstance(items, list) or not items:
        return jsonify({"error": "Cart is empty"}), 400

    user = session["user"]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT email_verified FROM users WHERE id = %s", (user["id"],))
                    row = cursor.fetchone()
                    if row:
                        user["email_verified"] = int(row.get("email_verified") or 0)
        except Exception:
            pass

    if not user.get("email_verified", 0):
        return jsonify({"error": "Please verify your email address to place orders."}), 403

    customer_name = (data.get("customer_name") or "").strip() or user["full_name"]
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()
    payment_mode = data.get("payment_mode", "Cash on delivery")
    if not phone or not address:
        return jsonify({"error": "Phone and address are required"}), 400
    if len(phone) > 20 or not re.match(r"^[\d\+\-\(\)\s]+$", phone):
        return jsonify({"error": "Invalid phone number"}), 400
    if len(address) > 500:
        return jsonify({"error": "Address is too long (max 500 characters)"}), 400

    needed_ids = list({safe_int(item.get("product_id")) for item in items if safe_int(item.get("product_id"))})
    product_map = {product["id"]: product for product in list_products_for_order(needed_ids)}
    total = 0
    order_items = []
    for item in items:
        product_id = safe_int(item.get("product_id"))
        quantity = min(max(safe_int(item.get("quantity"), 1), 1), 999)
        size = (item.get("size") or "").strip() or "M"
        product = product_map.get(product_id)
        if not product:
            return jsonify({"error": f"Product ID {product_id} not found"}), 400
            
        p_stock = (product.get("stock") or "").strip().lower()
        if p_stock == "out of stock":
            return jsonify({"error": f"Product '{product['name']}' is out of stock"}), 400
            
        line_total = float(product["price"]) * quantity
        total += line_total
        order_items.append(
            {
                "product_id": product_id,
                "product_name": product["name"],
                "quantity": quantity,
                "price": float(product["price"]),
                "size": size,
            }
        )

    if not order_items:
        return jsonify({"error": "No valid products in cart"}), 400

    settings = get_settings_dict()
    subtotal = total
    
    # Coupon code validation
    coupon_code = (data.get("coupon_code") or "").strip().upper()
    discount = 0.0
    if coupon_code:
        coupon_match = None
        if check_db_health():
            try:
                with db_connection() as connection:
                    with connection.cursor(dictionary=True) as cursor:
                        cursor.execute("SELECT * FROM coupons WHERE code = %s LIMIT 1", (coupon_code,))
                        coupon_match = cursor.fetchone()
            except Exception as exc:
                logger.error("Failed to fetch coupon %s from DB: %s", coupon_code, exc)
        else:
            coupon_match = next((c for c in memory_coupons if c["code"].upper() == coupon_code), None)

        if not coupon_match:
            return jsonify({"error": f"Invalid coupon code '{coupon_code}'"}), 400
        if not coupon_match.get("active"):
            return jsonify({"error": f"Coupon code '{coupon_code}' is inactive"}), 400

        # Expiration Date Check
        expires_at_val = coupon_match.get("expires_at")
        if expires_at_val:
            if isinstance(expires_at_val, str):
                try:
                    if ' ' in expires_at_val:
                        expiry_dt = datetime.strptime(expires_at_val, '%Y-%m-%d %H:%M:%S')
                    else:
                        expiry_dt = datetime.strptime(expires_at_val, '%Y-%m-%d')
                except ValueError:
                    return jsonify({"error": f"Coupon code '{coupon_code}' has an invalid expiry date"}), 400
            else:
                expiry_dt = expires_at_val
            
            if expiry_dt and datetime.now() > expiry_dt:
                return jsonify({"error": f"Coupon code '{coupon_code}' has expired"}), 400

        # Usage Limit Check
        usage_limit_val = coupon_match.get("usage_limit")
        usage_count_val = coupon_match.get("usage_count", 0) or 0
        if usage_limit_val is not None:
            usage_limit_val = int(usage_limit_val)
            if usage_count_val >= usage_limit_val:
                return jsonify({"error": f"Coupon code '{coupon_code}' usage limit reached"}), 400

        min_sub = float(coupon_match.get("min_subtotal", 0.0))
        if subtotal < min_sub:
            return jsonify({"error": f"Coupon requires a minimum subtotal of Rs. {min_sub:,.2f}"}), 400

        disc_type = coupon_match.get("discount_type")
        disc_val = float(coupon_match.get("discount_value", 0.0))
        if disc_type == "percentage":
            discount = subtotal * (min(disc_val, 100.0) / 100.0)
        elif disc_type == "fixed":
            discount = min(disc_val, subtotal)

    delivery_standard = float(settings.get("delivery_fee_standard", 99.0))
    delivery_threshold = float(settings.get("delivery_fee_threshold", 999.0))
    gst_rate = float(settings.get("gst_rate", 5.0)) / 100.0
    other_charges = float(settings.get("other_charges", 0.0))

    delivery = 0 if (subtotal >= delivery_threshold or (coupon_match and coupon_match.get("free_delivery"))) else delivery_standard

    tax = (subtotal - discount) * gst_rate
    if tax < 0:
        tax = 0.0
    total = (subtotal - discount) + delivery + tax + other_charges
    if total < 0:
        total = 0.0

    save_profile_raw = data.get("save_profile")
    save_profile = save_profile_raw is True or (isinstance(save_profile_raw, str) and save_profile_raw.lower() not in ("false", "0", ""))

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    # Update profile details in database if save_profile checked
                    if save_profile:
                        cursor.execute("SELECT saved_address FROM users WHERE id = %s", (user["id"],))
                        row = cursor.fetchone()
                        current_saved = row[0] if row else ""
                        updated_address_book = update_user_address_book(current_saved, address, customer_name, phone)
                        cursor.execute(
                            """
                            UPDATE users
                            SET saved_name = %s, saved_phone = %s, saved_address = %s
                            WHERE id = %s
                            """,
                            (customer_name, phone, updated_address_book, user["id"])
                        )
                    
                    cursor.execute(
                        """
                        INSERT INTO orders (user_id, customer_name, phone, address, payment_mode, total)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (user["id"], customer_name, phone, address, payment_mode, total),
                    )
                    order_id = cursor.lastrowid
                    for item in order_items:
                        cursor.execute(
                            """
                            INSERT INTO order_items (order_id, product_id, product_name, quantity, price, size)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            """,
                            (order_id, item["product_id"], item["product_name"], item["quantity"], item["price"], item["size"]),
                        )
                        cursor.execute("SELECT stock FROM products WHERE id = %s FOR UPDATE", (item["product_id"],))
                        p_row = cursor.fetchone()
                        if p_row:
                            current_stock = p_row[0]
                            if (current_stock or "").strip().lower() == "out of stock":
                                raise ValueError(f"Product '{item.get('product_name', 'Unknown')}' is out of stock")
                            new_stock = decrement_stock_string(current_stock)
                            cursor.execute("UPDATE products SET stock = %s WHERE id = %s", (new_stock, item["product_id"]))
                    if coupon_code:
                        cursor.execute("UPDATE coupons SET usage_count = usage_count + 1 WHERE code = %s", (coupon_code,))
                    
                    connection.commit()
        except ValueError as verr:
            try: connection.rollback()
            except Exception: pass
            return jsonify({"error": str(verr)}), 400
        except Exception:
            try: connection.rollback()
            except Exception: pass
            return jsonify({"error": "Database error"}), 500
    else:
        if save_profile:
            session["saved_name"] = customer_name
            session["saved_phone"] = phone
            username = user["username"]
            with memory_users_lock:
                if username in memory_users:
                    current_saved = memory_users[username].get("saved_address") or ""
                    updated_address_book = update_user_address_book(current_saved, address, customer_name, phone)
                    memory_users[username]["saved_name"] = customer_name
                    memory_users[username]["saved_phone"] = phone
                    memory_users[username]["saved_address"] = updated_address_book
                    session["saved_address"] = updated_address_book
                else:
                    session["saved_address"] = address
                
        with memory_products_lock:
            for item in order_items:
                for p in memory_products:
                    if p["id"] == item["product_id"]:
                        p_stock = (p.get("stock") or "").strip().lower()
                        if p_stock == "out of stock":
                            return jsonify({"error": f"Product '{item.get('product_name', 'Unknown')}' is out of stock"}), 400
                        p["stock"] = decrement_stock_string(p.get("stock", ""))
                        break
            with memory_orders_lock:
                order_id = len(memory_orders) + 1
                memory_orders.insert(
                    0,
                    {
                        "id": order_id,
                        "user_id": user["id"],
                        "username": user["username"],
                        "customer_name": customer_name,
                        "phone": phone,
                        "address": address,
                        "payment_mode": payment_mode,
                        "total": total,
                        "status": "New",
                        "items": order_items,
                        "created_at": datetime.now(UTC).isoformat(),
                    },
                )
        if coupon_code:
            with memory_coupons_lock:
                for c in memory_coupons:
                    if c["code"].upper() == coupon_code:
                        c["usage_count"] = c.get("usage_count", 0) + 1
                        break

    threading.Thread(target=send_order_confirmation_email, args=(
        user, customer_name, order_id, order_items, total, subtotal,
        discount, delivery, tax, other_charges, payment_mode, address,
        phone, coupon_code
    ), daemon=True).start()

    return jsonify({
        "order_id": order_id, 
        "total": total,
        "subtotal": subtotal,
        "discount": discount,
        "delivery": delivery,
        "tax": tax,
        "other": other_charges,
        "coupon_code": coupon_code
    }), 201


def normalize_product(data):
    saved_cache = {}
    
    def get_or_save_image(img_str):
        if not img_str:
            return ""
        if img_str in saved_cache:
            return saved_cache[img_str]
        saved = save_base64_image(img_str)
        saved_cache[img_str] = saved
        return saved

    # Ensure image is a clean string
    image = data.get("image")
    if not isinstance(image, str):
        image = ""
    image = image.strip()
    if image:
        image = get_or_save_image(image)

    # Ensure images is a list of clean strings
    raw_images = data.get("images") or []
    if not isinstance(raw_images, list):
        raw_images = []
    
    images = []
    for img in raw_images:
        if isinstance(img, str) and img.strip():
            images.append(get_or_save_image(img.strip()))

    # If main image is specified but not in the list, insert it at the beginning
    if image and image not in images:
        images.insert(0, image)
    elif not image and images:
        image = images[0]



    category = data.get("category")
    if category not in {"men", "women", "kids"}:
        category = "women"

    stock = data.get("stock")
    if stock not in {"In stock", "Limited stock", "Out of stock"}:
        stock = "In stock"

    price = max(0.0, min(9999999.99, safe_float(data.get("price"), 0.0)))
    old_price = max(0.0, min(9999999.99, safe_float(data.get("old_price"), 0.0)))
    rating = max(1.0, min(5.0, safe_float(data.get("rating"), 4.5)))

    name = (data.get("name") or "").strip()[:160]
    if not name:
        raise ValueError("Product name is required and cannot be empty")
    size = (data.get("size") or "").strip()[:50]
    color = (data.get("color") or "").strip()[:50]
    badge = (data.get("badge") or "").strip()[:100]
    description = (data.get("description") or "").strip()[:5000]

    return {
        "name": name,
        "category": category,
        "price": price,
        "old_price": old_price,
        "size": size,
        "color": color,
        "stock": stock,
        "rating": rating,
        "badge": badge,
        "description": description,
        "image": image,
        "images": images,
    }


def list_products_for_order(product_ids=None):
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    if product_ids:
                        placeholders = ",".join("%s" for _ in product_ids)
                        cursor.execute(f"SELECT * FROM products WHERE id IN ({placeholders})", product_ids)
                    else:
                        cursor.execute("SELECT * FROM products")
                    rows = [product_row_to_dict(row) for row in cursor.fetchall()]
            return rows
        except Exception:
            return memory_products
    return memory_products


# Initialize database on import (essential for WSGI servers like Waitress)
init_mysql()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

