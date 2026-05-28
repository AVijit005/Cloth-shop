"""
Auth routes blueprint — migration pattern for splitting app.py.

Usage (in app.py):
    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp)
"""

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash
import secrets
import re

from app import user_by_username, create_user
from app.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SENDER, LOGS_FOLDER
from app.middleware.security import (
    is_blocked, track_failed_login, clear_failed_logins,
    validate_password_strength, create_user_session
)
from app.utils.helpers import json_payload
from app.services.email_service import send_verification_email

auth_bp = Blueprint("auth", __name__, url_prefix="/api")


@auth_bp.route("/login", methods=["POST"])
def login():
    data = json_payload()
    username = (data.get("username") or "").strip()
    password = data.get("password", "")
    remember = data.get("remember", False)
    ip = request.remote_addr

    blocked, block_msg = is_blocked(username, ip)
    if blocked:
        return jsonify({"error": block_msg}), 429

    user = user_by_username(username)

    if not user or not check_password_hash(user["password_hash"], password):
        track_failed_login(username, ip)
        return jsonify({"error": "Wrong ID or password"}), 401

    clear_failed_logins(username, ip)
    create_user_session(user, remember)

    return jsonify({"user": session["user"]})


@auth_bp.route("/register", methods=["POST"])
def register():
    data = json_payload()
    username = (data.get("username") or "").strip()
    password = data.get("password", "")
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip()

    if not username or not password or not full_name or not email:
        return jsonify({"error": "All fields are required"}), 400

    if not re.match(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", email):
        return jsonify({"error": "Invalid email address"}), 400

    strength_err = validate_password_strength(password)
    if strength_err:
        return jsonify({"error": strength_err}), 400

    verification_token = secrets.token_urlsafe(32)
    p_hash = generate_password_hash(password)

    user_id = create_user(username, p_hash, full_name, email, verification_token)
    if user_id is None:
        return jsonify({"error": "Username or email already taken"}), 400

    smtp_config = {
        "host": SMTP_HOST, "port": SMTP_PORT, "user": SMTP_USER,
        "password": SMTP_PASS, "sender": SMTP_SENDER, "logs_folder": LOGS_FOLDER
    } if SMTP_HOST else {"logs_folder": LOGS_FOLDER}

    send_verification_email(full_name, email, verification_token,
                            smtp_config=smtp_config,
                            url_root=request.url_root)

    new_user = {"id": user_id, "username": username, "role": "customer",
                "full_name": full_name, "email_verified": 0}
    create_user_session(new_user)

    return jsonify({"user": session["user"]})


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/me", methods=["GET"])
def me():
    return jsonify({"user": session.get("user")})
