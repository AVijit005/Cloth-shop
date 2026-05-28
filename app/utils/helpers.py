import json
import re
import secrets
import base64
import binascii
import os
import logging

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


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


def json_payload():
    from flask import request
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def parse_images(images_value, fallback_image=""):
    if isinstance(images_value, list):
        images = list(images_value)
    else:
        try:
            images = json.loads(images_value or "[]")
        except (TypeError, json.JSONDecodeError, ValueError):
            images = []
    if fallback_image and fallback_image not in images:
        images.insert(0, fallback_image)
    return [img for img in images if img]


def product_row_to_dict(row):
    images = parse_images(row.get("images"), row.get("image") or "")
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "price": float(row["price"] or 0),
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


def save_base64_image(base64_str, upload_folder):
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
            data = base64.b64decode(encoded)
            if len(data) > MAX_IMAGE_SIZE:
                logger.warning("Rejected image upload exceeding %d bytes", MAX_IMAGE_SIZE)
                return ""
            is_valid = any(data.startswith(sig) for sig in [b"\xff\xd8\xff", b"\x89PNG", b"GIF87a", b"GIF89a"])
            if not is_valid:
                is_valid = ext == "webp" and data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"WEBP"
            if not is_valid:
                logger.warning("Rejected upload: invalid image magic bytes")
                return ""
            filename = f"{secrets.token_hex(16)}.{ext}"
            filepath = os.path.join(upload_folder, filename)
            with open(filepath, "wb") as f:
                f.write(data)
            return f"/uploads/{filename}"
        except (ValueError, TypeError, binascii.Error) as exc:
            logger.error("Failed to save base64 image: %s", exc)
    return base64_str


def normalize_product(data, upload_folder):
    saved_cache = {}

    def get_or_save_image(img_str):
        if not img_str:
            return ""
        if img_str in saved_cache:
            return saved_cache[img_str]
        saved = save_base64_image(img_str, upload_folder)
        saved_cache[img_str] = saved
        return saved

    image = data.get("image")
    if not isinstance(image, str):
        image = ""
    image = image.strip()
    if image:
        image = get_or_save_image(image)

    raw_images = data.get("images") or []
    if not isinstance(raw_images, list):
        raw_images = []

    images = []
    for img in raw_images:
        if isinstance(img, str) and img.strip():
            images.append(get_or_save_image(img.strip()))

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
