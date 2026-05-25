import os
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("MYSQL_DATABASE") or os.getenv("SHIBANI_DB_NAME", "shibani_store")
DB_HOST = os.getenv("MYSQL_HOST")
DB_USER = os.getenv("MYSQL_USER") or os.getenv("SHIBANI_DB_USER", "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD") or os.getenv("SHIBANI_DB_PASSWORD", "")
DB_PORT = int(os.getenv("MYSQL_PORT") or 3306)
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("SHIBANI_SECRET_KEY")
IS_PROD = os.getenv("FLASK_ENV") == "production" or os.getenv("SHIBANI_ENV") == "production"

FIREBASE_SERVICE_ACCOUNT = os.getenv("FIREBASE_SERVICE_ACCOUNT")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_SENDER = os.getenv("SMTP_SENDER", "noreply@shibanifashion.com")

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
LOGS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
