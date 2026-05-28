# Shibani Fashion — Application Package
# This package progressively migrates run.py into a modular structure.
# For now, run.py remains the primary entry point.
# New route blueprints and services live here.

import json
import os
import secrets
from datetime import datetime, timedelta
from html import escape

import mysql.connector
from flask import current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash


# ---------------------------------------------------------------------------
# Lazy references into run.py – populated on first call so that auth.py
# (which imports from this package) can resolve its placeholders without
# causing a circular import at module-load time.
# ---------------------------------------------------------------------------
_run_module = None

def _get_run():
    global _run_module
    if _run_module is None:
        import run as _run_module
    return _run_module


# ---------------------------------------------------------------------------
# Exports consumed by app/routes/auth.py
# ---------------------------------------------------------------------------
def user_by_username(username):
    """Look up a user dict by username. Checks DB first, then in-memory store."""
    return _get_run().user_by_username(username)

def create_user(username, password_hash, full_name, email, verification_token):
    """Insert a new user row and return the new id, or None on conflict."""
    return _get_run().create_user(username, password_hash, full_name, email, verification_token)
