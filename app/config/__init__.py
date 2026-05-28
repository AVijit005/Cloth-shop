import os
import secrets
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("MYSQL_DATABASE") or os.getenv("SHIBANI_DB_NAME", "shibani_store")
DB_HOST = os.getenv("MYSQL_HOST")
DB_USER = os.getenv("MYSQL_USER") or os.getenv("SHIBANI_DB_USER", "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD") or os.getenv("SHIBANI_DB_PASSWORD", "")
_raw_port = os.getenv("MYSQL_PORT")
try:
    DB_PORT = int(_raw_port) if _raw_port else 3306
except (ValueError, TypeError):
    DB_PORT = 3306
_secret_key_env = os.getenv("SECRET_KEY") or os.getenv("SHIBANI_SECRET_KEY")
if _secret_key_env:
    SECRET_KEY = _secret_key_env
else:
    _key_file = os.path.join(os.path.dirname(__file__), "..", "..", ".secret_key")
    if os.path.exists(_key_file):
        with open(_key_file) as f:
            SECRET_KEY = f.read().strip()
    else:
        SECRET_KEY = secrets.token_hex(32)
        with open(_key_file, "w") as f:
            f.write(SECRET_KEY)
IS_PROD = os.getenv("FLASK_ENV") == "production" or os.getenv("SHIBANI_ENV") == "production"

FIREBASE_SERVICE_ACCOUNT = os.getenv("FIREBASE_SERVICE_ACCOUNT")

SMTP_HOST = os.getenv("SMTP_HOST")
_raw_smtp_port = os.getenv("SMTP_PORT")
try:
    SMTP_PORT = int(_raw_smtp_port) if _raw_smtp_port else None
except (ValueError, TypeError):
    SMTP_PORT = None
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_SENDER = os.getenv("SMTP_SENDER", "noreply@shibanifashion.com")

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
LOGS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
