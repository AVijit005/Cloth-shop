# System Design: Shibani Fashion Store

This document frames the project as a system design interview answer —
useful for practicing the "Design an e-commerce platform" question.

---

## 1. Requirements

### Functional
- Users can browse products by category, search, filter, sort
- Users can register, log in, manage profile
- Users can add items to cart, apply coupons, place orders
- Users can write reviews, manage wishlist
- Admins can manage products, orders, customers, reviews, settings
- Email notifications for verification, password reset, order confirmation

### Non-Functional
- **Resilience**: Survive database outages without downtime
- **Security**: OWASP Top 10 protection
- **Performance**: Paginated API, cached assets, lazy-loaded images
- **Observability**: Sentry error tracking, request IDs, structured logging
- **Portability**: Docker container, 12-factor app config

---

## 2. High-Level Architecture

```
                         ┌──────────────────────┐
                         │    Load Balancer      │
                         │  (Render / Cloudflare)│
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    Flask Application  │
                         │    (Waitress, 4 workers)│
                         └──────────┬───────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
     │  MySQL 8.0      │  │  In-Memory      │  │  External       │
     │  (primary)      │  │  Store (fallback)│  │  Services       │
     │  pool_size=10   │  │  Python dicts    │  │  Sentry, SMTP   │
     └─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Data Flow: Read Request

```
1. Client → GET /api/products?page=1&per_page=20
2. Flask receives request
3. check_db_health() → True? Use MySQL. False? Use memory store.
4. Query products with pagination offset/limit
5. Return JSON response with products + pagination metadata
6. Response headers: X-Request-ID, CSP, Cache-Control
```

### Data Flow: Write Request (Order)

```
1. Client → POST /api/orders (with CSRF token)
2. validate_csrf() → checks X-CSRF-Token header
3. require_login decorator → checks session["user"]
4. Parse items, validate stock levels
5. Calculate subtotal, apply coupon, compute tax/delivery
6. Save order (MySQL INSERT or memory_orders.append)
7. Decrement product stock
8. Send async email confirmation (background thread)
9. Return order_id + totals
```

---

## 3. Database Schema

### Users
```sql
id INT PK, username VARCHAR(80) UNIQUE, password_hash VARCHAR(255),
role ENUM('admin','customer'), full_name VARCHAR(120), email VARCHAR(120),
email_verified TINYINT, verification_token VARCHAR(100),
reset_token VARCHAR(100), reset_token_expires DATETIME,
saved_name VARCHAR(120), saved_phone VARCHAR(40), saved_address TEXT
```

### Products
```sql
id INT PK, name VARCHAR(160), category ENUM('men','women','kids'),
price DECIMAL(10,2), old_price DECIMAL(10,2), size VARCHAR(120),
color VARCHAR(80), stock VARCHAR(40), rating DECIMAL(2,1),
badge VARCHAR(80), description TEXT, image LONGTEXT, images LONGTEXT
```

### Orders + Order Items
```sql
orders: id INT PK, user_id INT FK, customer_name, phone, address,
        payment_mode, total DECIMAL(10,2), status VARCHAR(40)

order_items: id INT PK, order_id INT FK, product_id INT FK,
             product_name, quantity INT, price DECIMAL(10,2), size VARCHAR(40)
```

### Indexes
- `orders(user_id, created_at, status)` — order history queries
- `order_items(order_id)` — join on order detail
- `products(category, rating, created_at)` — catalog browsing
- `reviews(product_id, status)` — product page reviews
- `coupons(code)` — coupon validation
- `users(email)` — login/verification lookups

---

## 4. Key Design Decisions

### Why session-based auth instead of JWT?
JWT is popular but unnecessary here. The app is a monolith serving both
API and HTML — sessions are simpler and more secure (server-controlled
invalidation, no token refresh logic).

### Why no Redis?
The in-memory fallback serves as a primitive cache. For this scale
(< 10K products, < 100 concurrent users), it's sufficient. Redis
would be added when:
- Session storage needs to be shared across multiple app instances
- Product catalog exceeds memory limits (> 100K products)
- Rate limiting requires atomic counters

### Why Waitress instead of Gunicorn?
Waitress is a pure-Python WSGI server that works on Windows (where this
app was developed). Gunicorn requires a Unix-only worker model. In
production, both are equivalent for this workload.

---

## 5. Scalability Considerations

### Current limits
| Dimension | Limit | Bottleneck |
|---|---|---|
| Concurrent users | ~50-100 | Single Flask process |
| Products | ~10,000 | In-memory store (product list) |
| Orders/day | ~1,000 | Single MySQL instance |
| File storage | ~500MB | Local disk |

### Scaling path
1. **Multiple app workers**: Increase Waitress workers (4-8)
2. **Session sharing**: Move sessions to Redis or database
3. **Read replicas**: MySQL read replica for product catalog queries
4. **CDN**: Serve static assets and product images via CDN (Cloudflare)
5. **Queue**: Background email/sms via Redis queue (RQ or Celery)
6. **Horizontal scaling**: Multiple app instances behind load balancer

---

## 6. Security Architecture

```
                           ┌─────────────────────────┐
                           │      Client Browser      │
                           │  CSRF token in <meta>    │
                           └───────────┬─────────────┘
                                       │ HTTPS
                           ┌───────────▼─────────────┐
                           │    Flask Middleware      │
                           │                          │
                           │ 1. assign_request_id()   │
                           │ 2. ensure_csrf_token()   │
                           │ 3. validate_csrf()       │
                           │ 4. Route handler         │
                           │ 5. add_security_headers()│
                           └─────────────────────────┘
```

### Defense in depth
- **Network**: HTTPS, HSTS, CSP headers
- **Application**: CSRF tokens, input validation, parameterized queries
- **Authentication**: bcrypt hashing, brute-force lockout, session signing
- **Authorization**: Session-based role check (`@require_admin`)
- **Output**: Jinja2 autoescaping, HTML entity encoding in emails
