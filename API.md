# Shibani Fashion Store — API Reference

Base URL: `https://your-app.onrender.com` (or `http://localhost:5000`)

## Authentication

Most endpoints require a logged-in session. Use `/api/login` first.

### CSRF Protection
All POST/PUT/DELETE requests require a valid CSRF token:
```
X-CSRF-Token: <token-from-meta[name=csrf-token]>
```
Or bypass with the app's secret key during development:
```
X-Bypass-CSRF: <SECRET_KEY>
```

---

## Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/register` | No | Create account |
| POST | `/api/login` | No | Log in (returns session) |
| POST | `/api/logout` | No | Clear session |
| POST | `/api/forgot-password` | No | Send reset email |
| POST | `/api/reset-password` | No | Reset password with token |
| GET | `/api/me` | Yes | Current user info |

**POST /api/register**
```json
{ "username": "...", "password": "StrongPass1!", "full_name": "...", "email": "..." }
// → 200 { "user": { "id", "username", "role", "full_name", "email_verified": 0 } }
```

**POST /api/login**
```json
{ "username": "...", "password": "...", "remember": false }
// → 200 { "user": { "id", "username", "role", "full_name", "email_verified" } }
```

### Products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/products` | No | List (paginated) |
| POST | `/api/products` | Admin | Create |
| PUT | `/api/products/<id>` | Admin | Update |
| DELETE | `/api/products/<id>` | Admin | Delete |

**GET /api/products** `?page=1&per_page=50&search=...&category=women`
```json
{ "products": [...], "page": 1, "per_page": 50, "total": 20, "pages": 1 }
```

### Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/orders` | Yes | Create order |
| GET | `/api/orders/my` | Yes | User's orders |
| GET | `/api/orders` | Admin | All orders |
| PATCH | `/api/orders/<id>/status` | Admin | Update status |
| PUT | `/api/orders/<id>/cancel` | Yes | Cancel own order |

**POST /api/orders**
```json
{
  "items": [{ "product_id": 1, "quantity": 1, "size": "M" }],
  "customer_name": "...", "phone": "...", "address": "...",
  "payment_mode": "Cash on delivery",
  "coupon_code": "SHIBANI10",       // optional
  "save_profile": false              // optional, appends address
}
// → 200 { "order_id": 1, "total": 622.95, "subtotal": 499, "discount": 49.9, ... }
```

### Reviews

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reviews?product_id=N` | No | Product reviews |
| POST | `/api/reviews` | Yes | Create review |
| GET | `/api/admin/reviews` | Admin | All reviews |
| PATCH | `/api/admin/reviews/<id>` | Admin | Moderate (status) |
| DELETE | `/api/admin/reviews/<id>` | Admin | Delete |

### Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profile` | Yes | Get profile |
| PUT | `/api/profile` | Yes | Update saved address/name/phone |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/customers` | Admin | Customer list |
| GET | `/api/admin/coupons` | Admin | Coupon list |
| POST | `/api/admin/coupons` | Admin | Create coupon |
| DELETE | `/api/admin/coupons/<id>` | Admin | Delete coupon |
| GET | `/api/admin/reviews` | Admin | All reviews |
| PATCH | `/api/admin/reviews/<id>` | Admin | Moderate review |
| DELETE | `/api/admin/reviews/<id>` | Admin | Delete review |
| GET | `/api/settings` | Admin | App settings |
| PUT | `/api/settings` | Admin | Update settings |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Load-balancer check |
| GET | `/api/status` | No | App status + demo accounts |

### Frontend Routes

| Path | Description |
|------|-------------|
| `/` | Home / Hero |
| `/shop` | Product grid |
| `/product/<id>` | Product detail |
| `/cart` | Cart page |
| `/wishlist` | Wishlist |
| `/orders` | Order history |
| `/profile` | User profile |
| `/login` | Login |
| `/signup` | Registration |
| `/admin` | Dashboard |
| `/admin/products` | Product management |
| `/admin/orders` | Order management |
| `/admin/customers` | Customer list |
| `/admin/reviews` | Review moderation |
| `/admin/analytics` | Sales analytics |

---

## Error Responses

```json
{ "error": "Description of what went wrong" }
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation) |
| 401 | Not authenticated |
| 403 | Forbidden (not admin) |
| 404 | Not found |
| 429 | Rate-limited (too many login attempts) |
| 500 | Internal server error |
| 503 | Service unavailable (Firebase not configured) |

## Environment Variables

See `.env.example` for all configuration options.
