import base64
import json
import os
import re
import secrets
import time
from datetime import datetime, UTC
from functools import wraps

import mysql.connector
from mysql.connector.pooling import MySQLConnectionPool
from flask import Flask, jsonify, request, send_from_directory, session, render_template
from werkzeug.security import check_password_hash, generate_password_hash
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

load_dotenv()

DB_NAME = os.getenv("MYSQL_DATABASE") or os.getenv("SHIBANI_DB_NAME", "shibani_store")
DB_HOST = os.getenv("MYSQL_HOST") or os.getenv("SHIBANI_DB_HOST", "127.0.0.1")
DB_USER = os.getenv("MYSQL_USER") or os.getenv("SHIBANI_DB_USER", "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD") or os.getenv("SHIBANI_DB_PASSWORD", "")
DB_PORT = int(os.getenv("MYSQL_PORT") or os.getenv("SHIBANI_DB_PORT", "3306"))

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY") or os.getenv("SHIBANI_SECRET_KEY", secrets.token_hex(32))

IS_PROD = os.getenv("FLASK_ENV") == "production" or os.getenv("SHIBANI_ENV") == "production"
app.config.update(
    SESSION_COOKIE_SECURE=IS_PROD,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax"
)


def safe_float(value, default=0.0):
    try:
        return float(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def safe_int(value, default=0):
    try:
        return int(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def save_base64_image(base64_str):
    if not base64_str or not isinstance(base64_str, str):
        return base64_str
    if base64_str.startswith("data:image/"):
        try:
            header, encoded = base64_str.split(",", 1)
            match = re.search(r"data:image/(\w+);base64", header)
            ext = match.group(1) if match else "png"
            if ext == "jpeg":
                ext = "jpg"
            data = base64.b64decode(encoded)
            filename = f"{secrets.token_hex(16)}.{ext}"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            with open(filepath, "wb") as f:
                f.write(data)
            return f"/uploads/{filename}"
        except Exception:
            pass
    return base64_str



memory_products = []
memory_orders = []
memory_users = {}
memory_outfits = []
memory_reviews = []
memory_wishlists = []
memory_user_quests = []
mysql_ready = False
mysql_error = ""
db_pool = None

memory_settings = {
    "gst_rate": "5.0",
    "delivery_fee_standard": "99.0",
    "delivery_fee_threshold": "999.0",
    "other_charges": "0.0",
    "loyalty_enabled": "1",
    "loyalty_earn_ratio": "10.0",
    "loyalty_redeem_ratio": "10.0",
    "loyalty_min_order_to_earn": "0.0",
    "loyalty_min_order_to_redeem": "0.0",
    "loyalty_welcome_points": "100",
    "loyalty_max_redemption_percent": "100.0",
    "loyalty_tier1_limit": "1000.0",
    "loyalty_tier1_rate": "5.0",
    "loyalty_tier2_limit": "3000.0",
    "loyalty_tier2_rate": "10.0",
    "loyalty_tier3_limit": "5000.0",
    "loyalty_tier3_rate": "15.0",
    "loyalty_tier4_limit": "7000.0",
    "loyalty_tier4_rate": "20.0",
    "loyalty_tier5_limit": "10000.0",
    "loyalty_tier5_rate": "25.0",
    "loyalty_tier6_limit": "15000.0",
    "loyalty_tier6_rate": "30.0",
    "loyalty_tier7_rate": "35.0",
    "spin_cost": "50",
    "spin_segments": json.dumps([
        {"label": "10 Points", "type": "points", "value": 10, "weight": 25},
        {"label": "20 Points", "type": "points", "value": 20, "weight": 20},
        {"label": "50 Points", "type": "points", "value": 50, "weight": 10},
        {"label": "10% Coupon", "type": "coupon", "value": "SPIN10", "weight": 15},
        {"label": "15% Coupon", "type": "coupon", "value": "SPIN15", "weight": 10},
        {"label": "Free Delivery", "type": "coupon", "value": "SPINFREE", "weight": 10},
        {"label": "Better Luck Next Time", "type": "nothing", "value": 0, "weight": 10}
    ])
}

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
        "discount_type": "fixed",
        "discount_value": 0.0,
        "min_subtotal": 0.0,
        "active": 1,
        "expires_at": None,
        "usage_limit": None,
        "usage_count": 0
    }
]

def get_settings_dict():
    res = dict(memory_settings)
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT `key`, `value` FROM settings")
                    rows = cursor.fetchall()
                    for row in rows:
                        res[row["key"]] = row["value"]
        except Exception:
            pass
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
]


def server_connection(database=None):
    config = {
        "host": DB_HOST,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "port": DB_PORT,
        "autocommit": False,
        "connection_timeout": 2,
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


def check_db_health():
    global mysql_ready, last_db_check_time
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
                      `key` VARCHAR(80) PRIMARY KEY,
                      `value` TEXT NOT NULL
                    )
                    """
                )
                try:
                    cursor.execute("ALTER TABLE `settings` MODIFY COLUMN `value` TEXT NOT NULL")
                except Exception:
                    pass
                cursor.execute("SELECT COUNT(*) FROM settings")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('gst_rate', '5.0')")
                    cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('delivery_fee_standard', '99.0')")
                    cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('delivery_fee_threshold', '999.0')")
                    cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('other_charges', '0.0')")

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
                    CREATE TABLE IF NOT EXISTS outfits (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      user_id INT NOT NULL,
                      name VARCHAR(160) NOT NULL,
                      items TEXT NOT NULL,
                      is_public TINYINT DEFAULT 1,
                      likes INT DEFAULT 0,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                    """
                )
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
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS user_quests (
                      id INT AUTO_INCREMENT PRIMARY KEY,
                      user_id INT NOT NULL,
                      quest_key VARCHAR(80) NOT NULL,
                      progress INT DEFAULT 0,
                      target INT DEFAULT 1,
                      completed TINYINT DEFAULT 0,
                      claimed TINYINT DEFAULT 0,
                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                      UNIQUE KEY unique_user_quest (user_id, quest_key)
                    )
                    """
                )

                # Check for spin campaign settings
                cursor.execute("SELECT COUNT(*) FROM settings WHERE `key` = 'spin_cost'")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO settings (`key`, `value`) VALUES ('spin_cost', '50')")
                    cursor.execute(
                        "INSERT INTO settings (`key`, `value`) VALUES ('spin_segments', %s)",
                        (json.dumps([
                            {"label": "10 Points", "type": "points", "value": 10, "weight": 25},
                            {"label": "20 Points", "type": "points", "value": 20, "weight": 20},
                            {"label": "50 Points", "type": "points", "value": 50, "weight": 10},
                            {"label": "10% Coupon", "type": "coupon", "value": "SPIN10", "weight": 15},
                            {"label": "15% Coupon", "type": "coupon", "value": "SPIN15", "weight": 10},
                            {"label": "Free Delivery", "type": "coupon", "value": "SPINFREE", "weight": 10},
                            {"label": "Better Luck Next Time", "type": "nothing", "value": 0, "weight": 10}
                        ]),)
                    )

                # Spin-the-wheel coupon seeding
                cursor.execute("SELECT COUNT(*) FROM coupons WHERE code='SPIN10'")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active) VALUES ('SPIN10', 'percentage', 10.0, 0.0, 1)")
                cursor.execute("SELECT COUNT(*) FROM coupons WHERE code='SPIN15'")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active) VALUES ('SPIN15', 'percentage', 15.0, 0.0, 1)")
                cursor.execute("SELECT COUNT(*) FROM coupons WHERE code='SPINFREE'")
                if cursor.fetchone()[0] == 0:
                    cursor.execute("INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, active) VALUES ('SPINFREE', 'fixed', 0.0, 0.0, 1)")

                ensure_column(cursor, "users", "saved_name", "VARCHAR(120)")
                ensure_column(cursor, "users", "saved_phone", "VARCHAR(40)")
                ensure_column(cursor, "users", "saved_address", "TEXT")
                ensure_column(cursor, "order_items", "size", "VARCHAR(40)")
                ensure_column(cursor, "coupons", "expires_at", "DATETIME DEFAULT NULL")
                ensure_column(cursor, "coupons", "usage_limit", "INT DEFAULT NULL")
                ensure_column(cursor, "coupons", "usage_count", "INT DEFAULT 0")
                ensure_column(cursor, "users", "loyalty_points", "INT DEFAULT 100")
                ensure_column(cursor, "orders", "redeemed_points", "INT DEFAULT 0")
                ensure_column(cursor, "orders", "earned_points", "INT DEFAULT 0")
                ensure_column(cursor, "users", "last_spin", "TIMESTAMP NULL DEFAULT NULL")
                ensure_column(cursor, "outfits", "is_public", "TINYINT DEFAULT 1")
                ensure_column(cursor, "outfits", "likes", "INT DEFAULT 0")

                seed_user(cursor, "admin", "admin123", "admin", "Shibani Admin")
                seed_user(cursor, "customer", "customer123", "customer", "Shibani Customer")
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
    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
    if cursor.fetchone():
        return
    cursor.execute(
        "INSERT INTO users (username, password_hash, role, full_name) VALUES (%s, %s, %s, %s)",
        (username, generate_password_hash(password), role, full_name),
    )


def json_payload():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def ensure_column(cursor, table_name, column_name, definition):
    cursor.execute(f"SHOW COLUMNS FROM `{table_name}` LIKE %s", (column_name,))
    if cursor.fetchone():
        return
    cursor.execute(f"ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {definition}")


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


QUEST_REWARDS = {
    "write_review": 40,
    "place_order": 50,
    "high_spender": 100
}

def ensure_user_quests(user_id):
    default_quests = [
        {"key": "write_review", "target": 1},
        {"key": "place_order", "target": 1},
        {"key": "high_spender", "target": 1}
    ]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    for q in default_quests:
                        cursor.execute(
                            "INSERT IGNORE INTO user_quests (user_id, quest_key, progress, target, completed, claimed) VALUES (%s, %s, 0, %s, 0, 0)",
                            (user_id, q["key"], q["target"])
                        )
                    connection.commit()
        except Exception as e:
            print("Error initializing quests:", e)
    else:
        # memory fallback
        existing_keys = {q["quest_key"] for q in memory_user_quests if q["user_id"] == user_id}
        for q in default_quests:
            if q["key"] not in existing_keys:
                memory_user_quests.append({
                    "id": len(memory_user_quests) + 1,
                    "user_id": user_id,
                    "quest_key": q["key"],
                    "progress": 0,
                    "target": q["target"],
                    "completed": 1 if 0 >= q["target"] else 0, # target is 1
                    "claimed": 0
                })

def update_quest_progress(user_id, quest_key, increment=1, set_value=None):
    ensure_user_quests(user_id)
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM user_quests WHERE user_id = %s AND quest_key = %s", (user_id, quest_key))
                    row = cursor.fetchone()
                    if not row or row["claimed"]:
                        return
                    
                    new_progress = set_value if set_value is not None else (row["progress"] + increment)
                    if new_progress > row["target"]:
                        new_progress = row["target"]
                    completed = 1 if new_progress >= row["target"] else 0
                    
                    cursor.execute(
                        "UPDATE user_quests SET progress = %s, completed = %s WHERE user_id = %s AND quest_key = %s",
                        (new_progress, completed, user_id, quest_key)
                    )
                    connection.commit()
        except Exception as e:
            print("Error updating quest progress:", e)
    else:
        # memory fallback
        for q in memory_user_quests:
            if q["user_id"] == user_id and q["quest_key"] == quest_key:
                if q["claimed"]:
                    return
                new_progress = set_value if set_value is not None else (q["progress"] + increment)
                if new_progress > q["target"]:
                    new_progress = q["target"]
                q["progress"] = new_progress
                q["completed"] = 1 if new_progress >= q["target"] else 0
                break


def product_row_to_dict(row):
    images = parse_images(row.get("images"), row.get("image") or "")
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "price": float(row["price"]),
        "old_price": float(row["old_price"] or 0),
        "size": row["size"],
        "color": row["color"],
        "stock": row["stock"],
        "rating": float(row["rating"] or 4.5),
        "badge": row["badge"] or "",
        "description": row["description"] or "",
        "image": row["image"] or "",
        "images": images,
        "created_at": str(row["created_at"]),
    }


def parse_images(images_json, fallback_image=""):
    try:
        images = json.loads(images_json or "[]")
    except (TypeError, json.JSONDecodeError):
        images = []
    if fallback_image and fallback_image not in images:
        images.insert(0, fallback_image)
    return [image for image in images if image]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)



@app.get("/api/status")
def status():
    return jsonify(
        {
            "mysql_ready": check_db_health(),
            "database": DB_NAME,
            "mysql_error": mysql_error,
            "demo_accounts": {
                "admin": {"username": "admin", "password": "admin123"},
                "customer": {"username": "customer", "password": "customer123"},
            },
        }
    )


@app.post("/api/login")
def login():
    data = json_payload()
    username = (data.get("username") or "").strip()
    password = data.get("password", "")

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
                    user = cursor.fetchone()
            if not user or not check_password_hash(user["password_hash"], password):
                return jsonify({"error": "Wrong ID or password"}), 401
            session["user"] = {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "full_name": user["full_name"],
            }
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        # Secure fallback passwords using hash matching
        fallback_users = {
            "admin": {
                "password_hash": generate_password_hash("admin123"),
                "role": "admin",
                "full_name": "Shibani Admin",
                "id": 1,
            },
            "customer": {
                "password_hash": generate_password_hash("customer123"),
                "role": "customer",
                "full_name": "Shibani Customer",
                "id": 2,
            },
        }
        user = fallback_users.get(username) or memory_users.get(username)
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Wrong ID or password"}), 401
        session["user"] = {
            "id": user["id"],
            "username": username,
            "role": user["role"],
            "full_name": user["full_name"],
        }
        session["saved_name"] = user.get("saved_name") or ""
        session["saved_phone"] = user.get("saved_phone") or ""
        session["saved_address"] = user.get("saved_address") or ""

    return jsonify({"user": session["user"]})


@app.post("/api/register")
def register():
    data = json_payload()
    username = (data.get("username") or "").strip()
    password = data.get("password", "")
    full_name = (data.get("full_name") or "").strip()

    if not username or not password or not full_name:
        return jsonify({"error": "All fields are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
                    if cursor.fetchone():
                        return jsonify({"error": "Username already taken"}), 400
                    
                    p_hash = generate_password_hash(password)
                    welcome_pts = int(get_settings_dict().get("loyalty_welcome_points", 100))
                    cursor.execute(
                        "INSERT INTO users (username, password_hash, role, full_name, loyalty_points) VALUES (%s, %s, 'customer', %s, %s)",
                        (username, p_hash, full_name, welcome_pts)
                    )
                    connection.commit()
                    user_id = cursor.lastrowid
            
            session["user"] = {
                "id": user_id,
                "username": username,
                "role": "customer",
                "full_name": full_name,
            }
            return jsonify({"user": session["user"]})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        fallback_users = {"admin", "customer"}
        if username in memory_users or username in fallback_users:
            return jsonify({"error": "Username already taken"}), 400
        
        user_id = len(memory_users) + 100
        welcome_pts = int(get_settings_dict().get("loyalty_welcome_points", 100))
        memory_users[username] = {
            "id": user_id,
            "password_hash": generate_password_hash(password),
            "role": "customer",
            "full_name": full_name,
            "loyalty_points": welcome_pts
        }
        session["user"] = {
            "id": user_id,
            "username": username,
            "role": "customer",
            "full_name": full_name,
        }
        return jsonify({"user": session["user"]})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    return jsonify({"user": session.get("user")})


@app.get("/api/products")
@require_login
def products():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM products ORDER BY created_at DESC, id DESC")
                    rows = cursor.fetchall()
            return jsonify({"products": [product_row_to_dict(row) for row in rows]})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500

    return jsonify({"products": memory_products})


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
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        for index, existing in enumerate(memory_products):
            if existing["id"] == product_id:
                memory_products[index] = {**existing, **product, "id": product_id}
                break
    return jsonify({"product": {**product, "id": product_id}})


@app.delete("/api/products/<int:product_id>")
@require_admin
def delete_product(product_id):
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM products WHERE id = %s", (product_id,))
                    connection.commit()
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        memory_products[:] = [product for product in memory_products if product["id"] != product_id]
    return jsonify({"ok": True})


@app.get("/api/settings")
def get_settings():
    settings = get_settings_dict()
    return jsonify({
        "gst_rate": float(settings.get("gst_rate", 5.0)),
        "delivery_fee_standard": float(settings.get("delivery_fee_standard", 99.0)),
        "delivery_fee_threshold": float(settings.get("delivery_fee_threshold", 999.0)),
        "other_charges": float(settings.get("other_charges", 0.0)),
        "loyalty_enabled": settings.get("loyalty_enabled", "1"),
        "loyalty_earn_ratio": float(settings.get("loyalty_earn_ratio", 10.0)),
        "loyalty_redeem_ratio": float(settings.get("loyalty_redeem_ratio", 10.0)),
        "loyalty_min_order_to_earn": float(settings.get("loyalty_min_order_to_earn", 0.0)),
        "loyalty_min_order_to_redeem": float(settings.get("loyalty_min_order_to_redeem", 0.0)),
        "loyalty_welcome_points": int(settings.get("loyalty_welcome_points", 100)),
        "loyalty_max_redemption_percent": float(settings.get("loyalty_max_redemption_percent", 100.0)),
        "loyalty_tier1_limit": float(settings.get("loyalty_tier1_limit", 1000.0)),
        "loyalty_tier1_rate": float(settings.get("loyalty_tier1_rate", 5.0)),
        "loyalty_tier2_limit": float(settings.get("loyalty_tier2_limit", 3000.0)),
        "loyalty_tier2_rate": float(settings.get("loyalty_tier2_rate", 10.0)),
        "loyalty_tier3_limit": float(settings.get("loyalty_tier3_limit", 5000.0)),
        "loyalty_tier3_rate": float(settings.get("loyalty_tier3_rate", 15.0)),
        "loyalty_tier4_limit": float(settings.get("loyalty_tier4_limit", 7000.0)),
        "loyalty_tier4_rate": float(settings.get("loyalty_tier4_rate", 20.0)),
        "loyalty_tier5_limit": float(settings.get("loyalty_tier5_limit", 10000.0)),
        "loyalty_tier5_rate": float(settings.get("loyalty_tier5_rate", 25.0)),
        "loyalty_tier6_limit": float(settings.get("loyalty_tier6_limit", 15000.0)),
        "loyalty_tier6_rate": float(settings.get("loyalty_tier6_rate", 30.0)),
        "loyalty_tier7_rate": float(settings.get("loyalty_tier7_rate", 35.0))
    })


@app.put("/api/settings")
@require_login
def update_settings():
    if session["user"]["role"] != "admin":
        return jsonify({"error": "Admin access required"}), 403
    
    data = json_payload()
    gst_rate = str(max(0.0, float(data.get("gst_rate", 5.0))))
    delivery_fee_standard = str(max(0.0, float(data.get("delivery_fee_standard", 99.0))))
    delivery_fee_threshold = str(max(0.0, float(data.get("delivery_fee_threshold", 999.0))))
    other_charges = str(max(0.0, float(data.get("other_charges", 0.0))))
    
    loyalty_enabled = "1" if data.get("loyalty_enabled") in ("1", 1, True, "true") else "0"
    loyalty_earn_ratio = str(max(0.1, float(data.get("loyalty_earn_ratio", 10.0))))
    loyalty_redeem_ratio = str(max(0.1, float(data.get("loyalty_redeem_ratio", 10.0))))
    loyalty_min_order_to_earn = str(max(0.0, float(data.get("loyalty_min_order_to_earn", 0.0))))
    loyalty_min_order_to_redeem = str(max(0.0, float(data.get("loyalty_min_order_to_redeem", 0.0))))
    loyalty_welcome_points = str(max(0, int(data.get("loyalty_welcome_points", 100))))
    loyalty_max_redemption_percent = str(max(1.0, min(100.0, float(data.get("loyalty_max_redemption_percent", 100.0)))))
    
    loyalty_tier1_limit = str(max(1.0, float(data.get("loyalty_tier1_limit", 1000.0))))
    loyalty_tier1_rate = str(max(0.0, float(data.get("loyalty_tier1_rate", 5.0))))
    loyalty_tier2_limit = str(max(1.0, float(data.get("loyalty_tier2_limit", 3000.0))))
    loyalty_tier2_rate = str(max(0.0, float(data.get("loyalty_tier2_rate", 10.0))))
    loyalty_tier3_limit = str(max(1.0, float(data.get("loyalty_tier3_limit", 5000.0))))
    loyalty_tier3_rate = str(max(0.0, float(data.get("loyalty_tier3_rate", 15.0))))
    loyalty_tier4_limit = str(max(1.0, float(data.get("loyalty_tier4_limit", 7000.0))))
    loyalty_tier4_rate = str(max(0.0, float(data.get("loyalty_tier4_rate", 20.0))))
    loyalty_tier5_limit = str(max(1.0, float(data.get("loyalty_tier5_limit", 10000.0))))
    loyalty_tier5_rate = str(max(0.0, float(data.get("loyalty_tier5_rate", 25.0))))
    loyalty_tier6_limit = str(max(1.0, float(data.get("loyalty_tier6_limit", 15000.0))))
    loyalty_tier6_rate = str(max(0.0, float(data.get("loyalty_tier6_rate", 30.0))))
    loyalty_tier7_rate = str(max(0.0, float(data.get("loyalty_tier7_rate", 35.0))))
    
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    for key, val in [
                        ("gst_rate", gst_rate),
                        ("delivery_fee_standard", delivery_fee_standard),
                        ("delivery_fee_threshold", delivery_fee_threshold),
                        ("other_charges", other_charges),
                        ("loyalty_enabled", loyalty_enabled),
                        ("loyalty_earn_ratio", loyalty_earn_ratio),
                        ("loyalty_redeem_ratio", loyalty_redeem_ratio),
                        ("loyalty_min_order_to_earn", loyalty_min_order_to_earn),
                        ("loyalty_min_order_to_redeem", loyalty_min_order_to_redeem),
                        ("loyalty_welcome_points", loyalty_welcome_points),
                        ("loyalty_max_redemption_percent", loyalty_max_redemption_percent),
                        ("loyalty_tier1_limit", loyalty_tier1_limit),
                        ("loyalty_tier1_rate", loyalty_tier1_rate),
                        ("loyalty_tier2_limit", loyalty_tier2_limit),
                        ("loyalty_tier2_rate", loyalty_tier2_rate),
                        ("loyalty_tier3_limit", loyalty_tier3_limit),
                        ("loyalty_tier3_rate", loyalty_tier3_rate),
                        ("loyalty_tier4_limit", loyalty_tier4_limit),
                        ("loyalty_tier4_rate", loyalty_tier4_rate),
                        ("loyalty_tier5_limit", loyalty_tier5_limit),
                        ("loyalty_tier5_rate", loyalty_tier5_rate),
                        ("loyalty_tier6_limit", loyalty_tier6_limit),
                        ("loyalty_tier6_rate", loyalty_tier6_rate),
                        ("loyalty_tier7_rate", loyalty_tier7_rate)
                    ]:
                        cursor.execute(
                            "INSERT INTO settings (`key`, `value`) VALUES (%s, %s) ON DUPLICATE KEY UPDATE `value` = %s",
                            (key, val, val)
                        )
                    connection.commit()
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        memory_settings["gst_rate"] = gst_rate
        memory_settings["delivery_fee_standard"] = delivery_fee_standard
        memory_settings["delivery_fee_threshold"] = delivery_fee_threshold
        memory_settings["other_charges"] = other_charges
        memory_settings["loyalty_enabled"] = loyalty_enabled
        memory_settings["loyalty_earn_ratio"] = loyalty_earn_ratio
        memory_settings["loyalty_redeem_ratio"] = loyalty_redeem_ratio
        memory_settings["loyalty_min_order_to_earn"] = loyalty_min_order_to_earn
        memory_settings["loyalty_min_order_to_redeem"] = loyalty_min_order_to_redeem
        memory_settings["loyalty_welcome_points"] = loyalty_welcome_points
        memory_settings["loyalty_max_redemption_percent"] = loyalty_max_redemption_percent
        memory_settings["loyalty_tier1_limit"] = loyalty_tier1_limit
        memory_settings["loyalty_tier1_rate"] = loyalty_tier1_rate
        memory_settings["loyalty_tier2_limit"] = loyalty_tier2_limit
        memory_settings["loyalty_tier2_rate"] = loyalty_tier2_rate
        memory_settings["loyalty_tier3_limit"] = loyalty_tier3_limit
        memory_settings["loyalty_tier3_rate"] = loyalty_tier3_rate
        memory_settings["loyalty_tier4_limit"] = loyalty_tier4_limit
        memory_settings["loyalty_tier4_rate"] = loyalty_tier4_rate
        memory_settings["loyalty_tier5_limit"] = loyalty_tier5_limit
        memory_settings["loyalty_tier5_rate"] = loyalty_tier5_rate
        memory_settings["loyalty_tier6_limit"] = loyalty_tier6_limit
        memory_settings["loyalty_tier6_rate"] = loyalty_tier6_rate
        memory_settings["loyalty_tier7_rate"] = loyalty_tier7_rate
        
    return jsonify({
        "gst_rate": float(gst_rate),
        "delivery_fee_standard": float(delivery_fee_standard),
        "delivery_fee_threshold": float(delivery_fee_threshold),
        "other_charges": float(other_charges),
        "loyalty_enabled": loyalty_enabled,
        "loyalty_earn_ratio": float(loyalty_earn_ratio),
        "loyalty_redeem_ratio": float(loyalty_redeem_ratio),
        "loyalty_min_order_to_earn": float(loyalty_min_order_to_earn),
        "loyalty_min_order_to_redeem": float(loyalty_min_order_to_redeem),
        "loyalty_welcome_points": int(loyalty_welcome_points),
        "loyalty_max_redemption_percent": float(loyalty_max_redemption_percent),
        "loyalty_tier1_limit": float(loyalty_tier1_limit),
        "loyalty_tier1_rate": float(loyalty_tier1_rate),
        "loyalty_tier2_limit": float(loyalty_tier2_limit),
        "loyalty_tier2_rate": float(loyalty_tier2_rate),
        "loyalty_tier3_limit": float(loyalty_tier3_limit),
        "loyalty_tier3_rate": float(loyalty_tier3_rate),
        "loyalty_tier4_limit": float(loyalty_tier4_limit),
        "loyalty_tier4_rate": float(loyalty_tier4_rate),
        "loyalty_tier5_limit": float(loyalty_tier5_limit),
        "loyalty_tier5_rate": float(loyalty_tier5_rate),
        "loyalty_tier6_limit": float(loyalty_tier6_limit),
        "loyalty_tier6_rate": float(loyalty_tier6_rate),
        "loyalty_tier7_rate": float(loyalty_tier7_rate)
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
                    return jsonify(rows)
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        active = [dict(c) for c in memory_coupons if c["active"] == 1]
        for c in active:
            c["discount_value"] = float(c["discount_value"])
            c["min_subtotal"] = float(c["min_subtotal"])
        return jsonify(active)


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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
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
    discount_value = float(data.get("discount_value", 0.0))
    min_subtotal = float(data.get("min_subtotal", 0.0))
    active = 1 if data.get("active") != False else 0
    
    expires_at = data.get("expires_at")
    if not expires_at or expires_at == "":
        expires_at = None
    
    usage_limit = data.get("usage_limit")
    if usage_limit is None or usage_limit == "":
        usage_limit = None
    else:
        try:
            usage_limit = int(usage_limit)
        except ValueError:
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
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
    discount_value = float(data.get("discount_value", 0.0))
    min_subtotal = float(data.get("min_subtotal", 0.0))
    active = 1 if data.get("active") != False else 0
    
    expires_at = data.get("expires_at")
    if not expires_at or expires_at == "":
        expires_at = None
    
    usage_limit = data.get("usage_limit")
    if usage_limit is None or usage_limit == "":
        usage_limit = None
    else:
        try:
            usage_limit = int(usage_limit)
        except ValueError:
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        global memory_coupons
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
                    for order in rows:
                        cursor.execute("SELECT * FROM order_items WHERE order_id = %s", (order["id"],))
                        items = cursor.fetchall()
                        for item in items:
                            item["price"] = float(item["price"])
                        order["items"] = items
                        order["total"] = float(order["total"])
                        order["created_at"] = str(order["created_at"])
            return jsonify({"orders": rows})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500

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
                    cursor.execute("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
                    connection.commit()
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        for order in memory_orders:
            if order["id"] == order_id:
                order["status"] = status
                break
    return jsonify({"ok": True, "status": status})


@app.get("/api/admin/customers")
@require_admin
def admin_get_customers():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("""
                        SELECT id, username, full_name, saved_name, saved_phone, saved_address, loyalty_points 
                        FROM users 
                        WHERE role = 'customer'
                        ORDER BY id DESC
                    """)
                    rows = cursor.fetchall()
                    for r in rows:
                        if r["loyalty_points"] is None:
                            r["loyalty_points"] = 100
                    return jsonify({"customers": rows})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    
    customers = []
    default_cust_pts = memory_users.get("customer", {}).get("loyalty_points", 100)
    default_cust_saved_name = memory_users.get("customer", {}).get("saved_name") or ""
    default_cust_saved_phone = memory_users.get("customer", {}).get("saved_phone") or ""
    default_cust_saved_address = memory_users.get("customer", {}).get("saved_address") or ""
    customers.append({
        "id": 2,
        "username": "customer",
        "full_name": "Shibani Customer",
        "saved_name": default_cust_saved_name,
        "saved_phone": default_cust_saved_phone,
        "saved_address": default_cust_saved_address,
        "loyalty_points": default_cust_pts
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
                "saved_address": udata.get("saved_address") or "",
                "loyalty_points": udata.get("loyalty_points") if udata.get("loyalty_points") is not None else 100
            })
            
    customers.sort(key=lambda x: x["id"], reverse=True)
    return jsonify({"customers": customers})


@app.post("/api/admin/customers/<int:user_id>/adjust-points")
@require_admin
def admin_adjust_points(user_id):
    data = json_payload()
    action = data.get("action")
    val = data.get("value")
    
    if action not in ("set", "adjust"):
        return jsonify({"error": "Invalid action. Must be 'set' or 'adjust'"}), 400
        
    try:
        val = int(val)
    except (TypeError, ValueError):
        return jsonify({"error": "Value must be a valid integer"}), 400
        
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT id, username, loyalty_points, role FROM users WHERE id = %s", (user_id,))
                    u_row = cursor.fetchone()
                    if not u_row:
                        return jsonify({"error": "User not found"}), 404
                    if u_row["role"] != "customer":
                        return jsonify({"error": "Cannot modify points for non-customer accounts"}), 400
                        
                    current_pts = u_row["loyalty_points"] if u_row["loyalty_points"] is not None else 100
                    
                    if action == "set":
                        new_pts = val
                    else:
                        new_pts = current_pts + val
                        
                    if new_pts < 0:
                        return jsonify({"error": f"Resulting balance ({new_pts}) cannot be negative"}), 400
                        
                    cursor.execute("UPDATE users SET loyalty_points = %s WHERE id = %s", (new_pts, user_id))
                    connection.commit()
                    
                    uname = u_row["username"]
                    if uname in memory_users:
                        memory_users[uname]["loyalty_points"] = new_pts
                    elif uname == "customer":
                        if "customer" not in memory_users:
                            memory_users["customer"] = {}
                        memory_users["customer"]["loyalty_points"] = new_pts
                        
                    return jsonify({"ok": True, "user_id": user_id, "username": uname, "loyalty_points": new_pts})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    else:
        target_user = None
        target_username = None
        if user_id == 2:
            target_username = "customer"
            if "customer" not in memory_users:
                memory_users["customer"] = {
                    "id": 2,
                    "role": "customer",
                    "full_name": "Shibani Customer",
                    "loyalty_points": 100
                }
            target_user = memory_users["customer"]
        else:
            for uname, udata in memory_users.items():
                if udata.get("id") == user_id:
                    target_user = udata
                    target_username = uname
                    break
                    
        if not target_user:
            return jsonify({"error": "User not found"}), 404
        if target_user.get("role") != "customer":
            return jsonify({"error": "Cannot modify points for non-customer accounts"}), 400
            
        current_pts = target_user.get("loyalty_points") if target_user.get("loyalty_points") is not None else 100
        
        if action == "set":
            new_pts = val
        else:
            new_pts = current_pts + val
            
        if new_pts < 0:
            return jsonify({"error": f"Resulting balance ({new_pts}) cannot be negative"}), 400
            
        target_user["loyalty_points"] = new_pts
        return jsonify({"ok": True, "user_id": user_id, "username": target_username, "loyalty_points": new_pts})


@app.get("/api/profile")

@require_login
def get_profile():
    user = session["user"]
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT username, full_name, role, saved_name, saved_phone, saved_address, loyalty_points FROM users WHERE id = %s", (user["id"],))
                    profile = cursor.fetchone()
            if profile:
                return jsonify({
                    "username": profile["username"],
                    "full_name": profile["full_name"],
                    "role": profile["role"],
                    "saved_name": profile["saved_name"] or "",
                    "saved_phone": profile["saved_phone"] or "",
                    "saved_address": profile["saved_address"] or "",
                    "loyalty_points": profile["loyalty_points"] if profile["loyalty_points"] is not None else 100
                })
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    
    username = user["username"]
    mem_user = memory_users.get(username) or {}
    return jsonify({
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "saved_name": mem_user.get("saved_name") or session.get("saved_name") or "",
        "saved_phone": mem_user.get("saved_phone") or session.get("saved_phone") or "",
        "saved_address": mem_user.get("saved_address") or session.get("saved_address") or "",
        "loyalty_points": mem_user.get("loyalty_points") if mem_user.get("loyalty_points") is not None else 100
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    session["saved_name"] = saved_name
    session["saved_phone"] = saved_phone
    session["saved_address"] = saved_address
    
    username = user["username"]
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
                    for order in rows:
                        cursor.execute("SELECT * FROM order_items WHERE order_id = %s", (order["id"],))
                        items = cursor.fetchall()
                        for item in items:
                            item["price"] = float(item["price"])
                            item["size"] = item.get("size") or ""
                        order["items"] = items
                        order["total"] = float(order["total"])
                        order["created_at"] = str(order["created_at"])
            return jsonify({"orders": rows})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    # For transient fallback, match orders based on logged in user's username
    user_orders = [o for o in memory_orders]
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
                        cursor.execute("SELECT stock FROM products WHERE id = %s", (item["product_id"],))
                        p_row = cursor.fetchone()
                        if p_row:
                            current_stock = p_row["stock"]
                            new_stock = increment_stock_string(current_stock)
                            cursor.execute("UPDATE products SET stock = %s WHERE id = %s", (new_stock, item["product_id"]))
                    
                    # Refund points
                    redeemed = order.get("redeemed_points") or 0
                    earned = order.get("earned_points") or 0
                    if redeemed > 0 or earned > 0:
                        cursor.execute("SELECT loyalty_points FROM users WHERE id = %s", (user["id"],))
                        u_row = cursor.fetchone()
                        current_points = u_row["loyalty_points"] if u_row and u_row["loyalty_points"] is not None else 100
                        new_points = max(0, current_points + redeemed - earned)
                        cursor.execute("UPDATE users SET loyalty_points = %s WHERE id = %s", (new_points, user["id"]))
                    
                    connection.commit()
            return jsonify({"ok": True, "status": "Cancelled"})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        # Memory fallback
        found_order = None
        for order in memory_orders:
            if order["id"] == order_id:
                found_order = order
                break
        if not found_order:
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
        
        # Refund points
        redeemed = found_order.get("redeemed_points", 0)
        earned = found_order.get("earned_points", 0)
        username = user["username"]
        if username in memory_users:
            current_points = memory_users[username].get("loyalty_points", 100)
            new_points = max(0, current_points + redeemed - earned)
            memory_users[username]["loyalty_points"] = new_points
            
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
    return "In stock"


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


# --- Gamification Loyalty Quests API ---
@app.get("/api/gamification/quests")
@require_login
def get_user_quests():
    user = session["user"]
    user_id = user["id"]
    
    ensure_user_quests(user_id)
    
    quests_list = []
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM user_quests WHERE user_id = %s", (user_id,))
                    quests_list = cursor.fetchall()
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        quests_list = [q for q in memory_user_quests if q["user_id"] == user_id]
        
    quest_meta = {
        "write_review": {"title": "Critic Choice", "description": "Write a product review and sizing fit feedback", "points": QUEST_REWARDS["write_review"]},
        "place_order": {"title": "Trendsetter", "description": "Place any clothing order on the store", "points": QUEST_REWARDS["place_order"]},
        "high_spender": {"title": "Big Spender", "description": "Place an order with subtotal over Rs. 3,000", "points": QUEST_REWARDS["high_spender"]}
    }
    
    result = []
    for q in quests_list:
        if q["quest_key"] not in QUEST_REWARDS:
            continue
        meta = quest_meta.get(q["quest_key"])
        result.append({
            "quest_key": q["quest_key"],
            "title": meta["title"],
            "description": meta["description"],
            "progress": q["progress"],
            "target": q["target"],
            "completed": bool(q["completed"]),
            "claimed": bool(q["claimed"]),
            "points": meta["points"]
        })
        
    return jsonify({"quests": result})

@app.post("/api/gamification/quests/claim")
@require_login
def claim_quest_reward():
    user = session["user"]
    user_id = user["id"]
    data = json_payload()
    quest_key = data.get("quest_key")
    
    if not quest_key or quest_key not in QUEST_REWARDS:
        return jsonify({"error": "Invalid quest key"}), 400
        
    points_to_add = QUEST_REWARDS[quest_key]
    
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM user_quests WHERE user_id = %s AND quest_key = %s", (user_id, quest_key))
                    row = cursor.fetchone()
                    if not row:
                        return jsonify({"error": "Quest not found"}), 404
                    if not row["completed"]:
                        return jsonify({"error": "Quest is not completed yet"}), 400
                    if row["claimed"]:
                        return jsonify({"error": "Quest reward already claimed"}), 400
                    
                    cursor.execute("UPDATE user_quests SET claimed = 1 WHERE id = %s", (row["id"],))
                    
                    cursor.execute("SELECT loyalty_points FROM users WHERE id = %s", (user_id,))
                    current_pts = cursor.fetchone()["loyalty_points"]
                    new_pts = current_pts + points_to_add
                    cursor.execute("UPDATE users SET loyalty_points = %s WHERE id = %s", (new_pts, user_id))
                    
                    connection.commit()
                    
                    session["user"]["loyalty_points"] = new_pts
                    session.modified = True
                    return jsonify({"ok": True, "new_points_balance": new_pts, "quest_key": quest_key})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        target_quest = None
        for q in memory_user_quests:
            if q["user_id"] == user_id and q["quest_key"] == quest_key:
                target_quest = q
                break
                
        if not target_quest:
            return jsonify({"error": "Quest not found"}), 404
        if not target_quest["completed"]:
            return jsonify({"error": "Quest is not completed yet"}), 400
        if target_quest["claimed"]:
            return jsonify({"error": "Quest reward already claimed"}), 400
            
        target_quest["claimed"] = 1
        
        user_record = memory_users.get(user["username"])
        if user_record:
            user_record["loyalty_points"] = user_record.get("loyalty_points", 100) + points_to_add
            new_pts = user_record["loyalty_points"]
        else:
            new_pts = user.get("loyalty_points", 100) + points_to_add
            
        session["user"]["loyalty_points"] = new_pts
        session.modified = True
        return jsonify({"ok": True, "new_points_balance": new_pts, "quest_key": quest_key})


# --- Customer Product Reviews & Sizing Fit Feedback API ---
@app.get("/api/reviews")
@require_login
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
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
        
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO reviews (user_id, username, product_id, rating, comment, sizing_fit, status) VALUES (%s, %s, %s, %s, %s, %s, 'approved')",
                        (user["id"], user["username"], product_id, rating, comment, sizing_fit)
                    )
                    connection.commit()
                    review_id = cursor.lastrowid
            update_quest_progress(user["id"], "write_review")
            return jsonify({"ok": True, "review": {"id": review_id, "user_id": user["id"], "username": user["username"], "product_id": product_id, "rating": rating, "comment": comment, "sizing_fit": sizing_fit, "status": "approved"}})
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    # In-memory fallback
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    # In-memory fallback
    global memory_reviews
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
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
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    # In-memory fallback
    global memory_wishlists
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
                    
                    cursor.execute("SELECT SUM(earned_points) as earned, SUM(redeemed_points) as redeemed FROM orders")
                    pts = cursor.fetchone()
                    points_earned = int(pts["earned"] or 0)
                    points_redeemed = int(pts["redeemed"] or 0)
                    
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
                    for row in trend_rows:
                        d_str = row["date"].strftime("%Y-%m-%d") if hasattr(row["date"], "strftime") else str(row["date"])
                        daily_trend.append({
                            "date": d_str,
                            "revenue": float(row["daily_revenue"] or 0.0),
                            "orders": int(row["daily_orders"] or 0)
                        })
                        
            return jsonify({
                "summary": {
                    "total_revenue": total_revenue,
                    "total_orders": total_orders,
                    "aov": aov,
                    "points_earned": points_earned,
                    "points_redeemed": points_redeemed
                },
                "category_sales": category_sales,
                "daily_trend": daily_trend
            })
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
            
    total_orders = len(memory_orders)
    total_revenue = sum(float(o.get("total", 0.0)) for o in memory_orders)
    aov = total_revenue / total_orders if total_orders > 0 else 0.0
    
    points_earned = sum(int(o.get("earned_points", 0)) for o in memory_orders)
    points_redeemed = sum(int(o.get("redeemed_points", 0)) for o in memory_orders)
    
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
    for d_str in sorted(trend_dict.keys()):
        daily_trend.append({
            "date": d_str,
            "revenue": trend_dict[d_str]["revenue"],
            "orders": trend_dict[d_str]["orders"]
        })
        
    return jsonify({
        "summary": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "aov": aov,
            "points_earned": points_earned,
            "points_redeemed": points_redeemed
        },
        "category_sales": category_sales,
        "daily_trend": daily_trend
    })


@app.post("/api/orders")
@require_login
def create_order():
    data = json_payload()
    items = data.get("items", [])
    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    user = session["user"]
    customer_name = (data.get("customer_name") or "").strip() or user["full_name"]
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()
    payment_mode = data.get("payment_mode", "Cash on delivery")
    if not phone or not address:
        return jsonify({"error": "Phone and address are required"}), 400

    product_map = {product["id"]: product for product in list_products_for_order()}
    total = 0
    order_items = []
    for item in items:
        product_id = safe_int(item.get("product_id"))
        quantity = max(safe_int(item.get("quantity"), 1), 1)
        size = (item.get("size") or "").strip() or "M"
        product = product_map.get(product_id)
        if not product:
            continue
            
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
            except Exception:
                pass
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
                    expiry_dt = None
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
            discount = subtotal * (disc_val / 100.0)
        elif disc_type == "fixed":
            discount = disc_val

    delivery_standard = float(settings.get("delivery_fee_standard", 99.0))
    delivery_threshold = float(settings.get("delivery_fee_threshold", 999.0))
    gst_rate = float(settings.get("gst_rate", 5.0)) / 100.0
    other_charges = float(settings.get("other_charges", 0.0))

    delivery = 0 if (subtotal > delivery_threshold or coupon_code == "FREEDELIVERY") else delivery_standard
    if not order_items:
        delivery = 0
        other_charges = 0

    # Loyalty points processing
    loyalty_enabled = settings.get("loyalty_enabled", "1") == "1"
    loyalty_redeem_ratio = float(settings.get("loyalty_redeem_ratio", 10.0))
    loyalty_min_order_to_earn = float(settings.get("loyalty_min_order_to_earn", 0.0))
    loyalty_min_order_to_redeem = float(settings.get("loyalty_min_order_to_redeem", 0.0))
    loyalty_max_redemption_percent = float(settings.get("loyalty_max_redemption_percent", 100.0))
    loyalty_tier1_limit = float(settings.get("loyalty_tier1_limit", 1000.0))
    loyalty_tier1_rate = float(settings.get("loyalty_tier1_rate", 5.0))
    loyalty_tier2_limit = float(settings.get("loyalty_tier2_limit", 3000.0))
    loyalty_tier2_rate = float(settings.get("loyalty_tier2_rate", 10.0))
    loyalty_tier3_limit = float(settings.get("loyalty_tier3_limit", 5000.0))
    loyalty_tier3_rate = float(settings.get("loyalty_tier3_rate", 15.0))
    loyalty_tier4_limit = float(settings.get("loyalty_tier4_limit", 7000.0))
    loyalty_tier4_rate = float(settings.get("loyalty_tier4_rate", 20.0))
    loyalty_tier5_limit = float(settings.get("loyalty_tier5_limit", 10000.0))
    loyalty_tier5_rate = float(settings.get("loyalty_tier5_rate", 25.0))
    loyalty_tier6_limit = float(settings.get("loyalty_tier6_limit", 15000.0))
    loyalty_tier6_rate = float(settings.get("loyalty_tier6_rate", 30.0))
    loyalty_tier7_rate = float(settings.get("loyalty_tier7_rate", 35.0))

    redeemed_points = safe_int(data.get("redeemed_points"), 0)
    applied_redeemed_points = 0
    points_discount = 0.0
    user_points = 100

    if loyalty_enabled and redeemed_points > 0 and subtotal >= loyalty_min_order_to_redeem and loyalty_redeem_ratio > 0:
        if check_db_health():
            try:
                with db_connection() as connection:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT loyalty_points FROM users WHERE id = %s", (user["id"],))
                        u_row = cursor.fetchone()
                        if u_row and u_row[0] is not None:
                            user_points = u_row[0]
            except Exception:
                pass
        else:
            user_points = memory_users.get(user["username"], {}).get("loyalty_points", 100)

        if redeemed_points > user_points:
            return jsonify({"error": "Insufficient loyalty points"}), 400
        
        points_discount = float(redeemed_points) / loyalty_redeem_ratio
        
        max_allowed_discount = (subtotal - discount) * (loyalty_max_redemption_percent / 100.0)
        if points_discount > max_allowed_discount:
            points_discount = max_allowed_discount
            
        applied_redeemed_points = int(points_discount * loyalty_redeem_ratio)

    if loyalty_enabled and subtotal >= loyalty_min_order_to_earn:
        if subtotal < loyalty_tier1_limit:
            earn_rate = loyalty_tier1_rate
        elif subtotal < loyalty_tier2_limit:
            earn_rate = loyalty_tier2_rate
        elif subtotal < loyalty_tier3_limit:
            earn_rate = loyalty_tier3_rate
        elif subtotal < loyalty_tier4_limit:
            earn_rate = loyalty_tier4_rate
        elif subtotal < loyalty_tier5_limit:
            earn_rate = loyalty_tier5_rate
        elif subtotal < loyalty_tier6_limit:
            earn_rate = loyalty_tier6_rate
        else:
            earn_rate = loyalty_tier7_rate
        
        net_spent = max(0.0, subtotal - discount - points_discount)
        earned_points = int((net_spent * earn_rate) // 100)
    else:
        earned_points = 0

    tax = (subtotal - discount - points_discount) * gst_rate
    if tax < 0:
        tax = 0.0
    total = (subtotal - discount - points_discount) + delivery + tax + other_charges
    if total < 0:
        total = 0.0

    save_profile = data.get("save_profile") == True

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
                        INSERT INTO orders (user_id, customer_name, phone, address, payment_mode, total, redeemed_points, earned_points)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (user["id"], customer_name, phone, address, payment_mode, total, applied_redeemed_points, earned_points),
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
                        cursor.execute("SELECT stock FROM products WHERE id = %s", (item["product_id"],))
                        p_row = cursor.fetchone()
                        if p_row:
                            current_stock = p_row[0]
                            new_stock = decrement_stock_string(current_stock)
                            cursor.execute("UPDATE products SET stock = %s WHERE id = %s", (new_stock, item["product_id"]))
                    if coupon_code:
                        cursor.execute("UPDATE coupons SET usage_count = usage_count + 1 WHERE code = %s", (coupon_code,))
                    
                    # Update user points in database
                    cursor.execute("SELECT loyalty_points FROM users WHERE id = %s", (user["id"],))
                    u_row = cursor.fetchone()
                    current_pts = u_row[0] if u_row and u_row[0] is not None else 100
                    new_pts = max(0, current_pts - applied_redeemed_points + earned_points)
                    cursor.execute("UPDATE users SET loyalty_points = %s WHERE id = %s", (new_pts, user["id"]))
                    
                    connection.commit()
        except Exception as exc:
            return jsonify({"error": f"Database error: {str(exc)}"}), 500
    else:
        if save_profile:
            session["saved_name"] = customer_name
            session["saved_phone"] = phone
            username = user["username"]
            if username in memory_users:
                current_saved = memory_users[username].get("saved_address") or ""
                updated_address_book = update_user_address_book(current_saved, address, customer_name, phone)
                memory_users[username]["saved_name"] = customer_name
                memory_users[username]["saved_phone"] = phone
                memory_users[username]["saved_address"] = updated_address_book
                session["saved_address"] = updated_address_book
            else:
                session["saved_address"] = address
                
        for item in order_items:
            for p in memory_products:
                if p["id"] == item["product_id"]:
                    p["stock"] = decrement_stock_string(p.get("stock", ""))
                    break
                    
        order_id = len(memory_orders) + 1
        if coupon_code:
            for c in memory_coupons:
                if c["code"].upper() == coupon_code:
                    c["usage_count"] = c.get("usage_count", 0) + 1
                    break
                    
        # Update user points in memory
        username = user["username"]
        if username in memory_users:
            current_pts = memory_users[username].get("loyalty_points", 100)
            new_pts = max(0, current_pts - applied_redeemed_points + earned_points)
            memory_users[username]["loyalty_points"] = new_pts

        memory_orders.insert(
            0,
            {
                "id": order_id,
                "customer_name": customer_name,
                "phone": phone,
                "address": address,
                "payment_mode": payment_mode,
                "total": total,
                "status": "New",
                "items": order_items,
                "redeemed_points": applied_redeemed_points,
                "earned_points": earned_points,
                "created_at": datetime.now(UTC).isoformat(),
            },
        )

    update_quest_progress(user["id"], "place_order")
    if subtotal >= 3000:
        update_quest_progress(user["id"], "high_spender")

    return jsonify({
        "order_id": order_id, 
        "total": total,
        "subtotal": subtotal,
        "discount": discount,
        "delivery": delivery,
        "tax": tax,
        "other": other_charges,
        "coupon_code": coupon_code,
        "redeemed_points": applied_redeemed_points,
        "earned_points": earned_points,
        "points_discount": points_discount
    })


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

    return {
        "name": (data.get("name") or "").strip(),
        "category": category,
        "price": price,
        "old_price": old_price,
        "size": (data.get("size") or "").strip(),
        "color": (data.get("color") or "").strip(),
        "stock": stock,
        "rating": rating,
        "badge": (data.get("badge") or "").strip(),
        "description": (data.get("description") or "").strip(),
        "image": image,
        "images": images,
    }


def list_products_for_order():
    if check_db_health():
        try:
            with db_connection() as connection:
                with connection.cursor(dictionary=True) as cursor:
                    cursor.execute("SELECT * FROM products")
                    rows = [product_row_to_dict(row) for row in cursor.fetchall()]
            return rows
        except Exception:
            return []
    return memory_products


# Initialize database on import (essential for WSGI servers like Waitress)
init_mysql()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

