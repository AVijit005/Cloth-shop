# SHIBANI — Premium Fashion E-Commerce Platform

<p align="center">
  <img src="https://img.shields.io/badge/Flask-3.0-000?style=flat-square&logo=flask" alt="Flask 3.0"/>
  <img src="https://img.shields.io/badge/MySQL-9.7-4479A1?style=flat-square&logo=mysql" alt="MySQL 9.7"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-CDN-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind CSS CDN"/>
  <img src="https://img.shields.io/badge/Firebase_Auth-FFCA28?style=flat-square&logo=firebase" alt="Firebase Auth"/>
  <img src="https://img.shields.io/badge/Render_Ready-46E3B7?style=flat-square&logo=render" alt="Render Ready"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"/>
</p>

A **production-ready Flask e-commerce application** featuring a luxury frontend with glassmorphism aesthetics, dual-storage architecture (MySQL primary + in-memory fallback), Firebase Google OAuth, role-based admin panels, and full e-commerce UX with checkout, coupons, wishlists, and order management.

Built as a monolithic single-file Flask backend with a declarative vanilla JavaScript frontend — no React, no heavy frameworks. Focused on **engineering quality**, **resilience**, and **UX polish**.

---

## Screenshots

> **Note:** Add screenshots to a `screenshots/` folder in the repository root.
>
> Suggested captures:
>
> | Area | File |
> |---|---|
> | Homepage hero + featured products | `screenshots/homepage.png` |
> | Shop catalog with filters | `screenshots/shop.png` |
> | Product detail page | `screenshots/product-detail.png` |
> | Shopping cart with coupon | `screenshots/cart.png` |
> | Checkout form | `screenshots/checkout.png` |
> | Admin dashboard | `screenshots/admin-overview.png` |
> | Admin product management | `screenshots/admin-products.png` |
> | Order management | `screenshots/admin-orders.png` |
> | Analytics charts | `screenshots/admin-analytics.png` |
> | Quick view modal | `screenshots/quick-view.png` |
> | Mini cart drawer | `screenshots/mini-cart.png` |
> | Mobile responsive view | `screenshots/mobile.png` |

---

## Feature Highlights

### Storefront
- **Product Catalog** — Category/sort/price/size/color/rating filters with live search
- **Product Quick View** — Hover-activated modal with image thumbnails, size selector, add-to-cart/wishlist
- **Smart Search** — Debounced suggestions with keyboard navigation and product thumbnails
- **Advanced Filters** — Color swatch picker, star rating filter, in-stock toggle, price range
- **Recently Viewed** — Persistent across sessions via localStorage (up to 6 items)
- **Personalized Recommendations** — Category-based suggestions sorted by rating
- **Image Zoom** — Magnifier lens on product detail (2x, auto-disabled on touch devices)
- **Size Recommendation** — BMI-based fit calculator with stock-aware suggestions

### Cart & Checkout
- **Sticky Mini Cart Drawer** — Slide-out panel with quantity controls, remove, subtotal
- **Full Cart Page** — Quantity adjust, save-for-later, coupon codes (percentage/free-delivery)
- **Checkout Flow** — Address form, saved address selector, COD / UPI QR payment modes
- **Order Confirmation** — Email notification with order summary (dev log or SMTP)
- **Order History** — Status tracking, view invoice, cancel within "New" status

### User Experience
- **Toast Notification System** — Animated slide-in/out, deduplication, success/error variants, dismiss button
- **Loading States** — Skeleton placeholders on cart and admin tables; fullscreen loading overlay
- **Focus Trapping** — Accessible modal/drawer keyboard navigation (Tab/Shift+Tab)
- **Responsive Design** — Mobile-first with collapsible nav, touch-friendly targets, scrollable admin tables
- **Accessibility** — ARIA labels, live regions, roles, and expanded states on all interactive elements

### Admin Dashboard
- **Overview** — Revenue/orders/customers/reviews stats cards; GST/delivery fee settings; low stock warnings
- **Product Management** — Full CRUD table with search, image upload, modal form
- **Order Management** — Status filter tabs (New/Processing/Shipped/Delivered/Cancelled), inline status update
- **Customer Directory** — Read-only searchable user list
- **Review Moderation** — Approve/reject pending reviews
- **Analytics** — Canvas-drawn sales trend line chart + category pie chart (no Chart.js dependency)

### Authentication & Security
- **Password Login** — bcrypt hashing, brute-force lockout (5 failed → 5 min block), strength validation
- **Google OAuth** — Firebase Admin SDK token verification, auto-account creation
- **Email Verification** — Token-based verification required before checkout
- **Password Reset** — Secure token with 1-hour expiry, email delivery
- **CSRF Protection** — Per-session token validated on all POST/PUT/DELETE
- **Session Security** — HttpOnly, SameSite=Lax, 30-min lifetime (30-day with "remember me")
- **Role-Based Access** — Admin decorators with 403 on unauthorized endpoints

### Resilience
- **Dual Storage** — MySQL primary with automatic in-memory fallback on connection failure
- **Graceful Degradation** — Frontend remains fully browseable even without a database
- **Connection Pooling** — MySQL connection pool (size 10) for production throughput
- **Default Seed Data** — 25 products, 3 coupon codes, admin + customer demo accounts

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12+, Flask 3.0, Werkzeug |
| **Database** | MySQL (mysql-connector-python 9.7) |
| **Auth** | Firebase Admin SDK (Google OAuth) + session-based password auth |
| **Frontend** | Vanilla JavaScript (ES6+), Tailwind CSS (Play CDN), custom 4000+ line CSS |
| **Fonts** | Google Fonts (Outfit + Inter) |
| **Icons** | Font Awesome 6 (Free) |
| **Server** | Waitress (production), Flask dev (local) |
| **Deploy** | Render (blueprint via `render.yaml`) |
| **Templating** | Jinja2 server-side rendering |

---

## Architecture Overview

```
Browser ──HTTP──> Flask (app.py) ──┬── MySQL (primary)
                                    │     connection_pool_size=10
                                    │
                                    └── Memory Store (fallback)
                                         in-memory lists/dicts
                                         auto-seeded on boot

Static Assets:
  /static/main.js         3220 lines — SPA-style controller with page router
  /static/styles.css       4022 lines — Custom CSS (glassmorphism, animations)
  /static/firebase-config.js   — Firebase SDK client init
  /static/firebase-auth.js     — Google sign-in popup handler

Templates (Jinja2):
  base.html / admin_base.html  — layouts
  16 page templates + 6 admin templates
```

The app uses a **single-file Flask backend** with a declarative JavaScript frontend. The JS file contains a path-based router (`/shop → initShop()`, `/product/... → initProductDetail()`, etc.) and all page-specific controllers, keeping the architecture simple without a frontend framework.

---

## Firebase Authentication

This project supports Google Sign-In via Firebase:

1. **Client**: `firebase-auth.js` opens a Google popup via Firebase SDK v10, retrieves an ID token
2. **Server**: `app.py:57-65` initializes Firebase Admin from `FIREBASE_SERVICE_ACCOUNT` env variable (JSON string). The `/api/login/google` endpoint verifies the ID token and creates/authenticates the user
3. **Fallback**: If Firebase is not configured, Google sign-in returns a 503 — password login continues to work

To enable: set `FIREBASE_SERVICE_ACCOUNT` in your environment to your Firebase service account JSON string.

---

## Responsive Design

- **Mobile**: Collapsible hamburger menu, slide-out search bar, scrollable admin tables (`min-w-[700px]`), touch-friendly button targets
- **Tablet**: Adaptive grid layouts (2-3 columns), preserved desktop nav
- **Desktop**: Full glassmorphism navbar, sidebar admin panel, multi-column product grids
- **CSS**: Tailwind responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`) throughout templates
- **Images**: `object-cover object-top` for consistent product aspect ratios

---

## Security Features

| Feature | Implementation |
|---|---|
| Password hashing | `werkzeug.security.generate_password_hash` (scrypt) |
| Brute-force protection | Per-username + per-IP lockout with configurable thresholds |
| CSRF tokens | Per-session random token, validated on all state-changing requests |
| Session security | HttpOnly, SameSite=Lax, configurable Secure flag in production |
| Input validation | Server-side length/pattern checks on all auth endpoints |
| XSS mitigation | Jinja2 autoescaping + `escapeHTML()` utility for dynamic JS content |
| Role enforcement | `@require_admin` decorator gates all admin endpoints |
| Email verification | Required before checkout; token-based with expiry |

---

## Installation

### Prerequisites
- Python 3.12+
- MySQL 8+ (or compatible)

### Local Setup

```bash
# Clone
git clone https://github.com/AVijit005/Cloth-shop.git
cd Cloth-shop

# Virtual environment
python -m venv venv
venv\Scripts\activate    # Windows
# source venv/bin/activate  # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Setup MySQL
# Run database.sql in your MySQL client to create the 'shibani_store' database
mysql -u root -p < database.sql

# Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials and a secret key

# Run
python app.py
# → http://127.0.0.1:5000
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MYSQL_HOST` | Yes | MySQL server hostname |
| `MYSQL_USER` | Yes | MySQL username |
| `MYSQL_PASSWORD` | Yes | MySQL password |
| `MYSQL_DATABASE` | Yes | Database name (default: `shibani_store`) |
| `MYSQL_PORT` | No | MySQL port (default: `3306`) |
| `SECRET_KEY` | Yes | Flask session signing key (generate: `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `FIREBASE_SERVICE_ACCOUNT` | No | Firebase Admin SDK service account JSON string |
| `SMTP_HOST` | No | SMTP server for email sending |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `FLASK_ENV` | No | Set to `production` for secure cookies |

---

## Deployment on Render

This project includes a `render.yaml` blueprint for one-click deployment:

1. Push the repository to GitHub
2. In [Render Dashboard](https://dashboard.render.com), click **New + → Blueprint**
3. Connect your GitHub repository
4. Render auto-detects `render.yaml`, installs dependencies, and starts with:
   ```
   waitress-serve --host=0.0.0.0 --port=$PORT app:app
   ```
5. Add environment variables (especially `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `SECRET_KEY`) in the Render service dashboard
6. For a production MySQL database, use Render's MySQL add-on, Railway, Aiven, or AWS RDS

---

## Demo Credentials

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Customer | `customer` | `customer123` |

The app also exposes a `/api/status` endpoint that returns all valid demo credentials at runtime.

---

## Roadmap

- [ ] **Stripe / Razorpay Payment Gateway** — Real payment processing beyond COD/UPI QR
- [ ] **Product Variants** — Color + size matrix with per-variant stock and images
- [ ] **Wishlist Notifications** — Email alerts when wishlist items go on sale
- [ ] **Progressive Web App** — Service worker for offline product browsing
- [ ] **Unit / Integration Tests** — pytest suite for API endpoints and critical flows
- [ ] **Docker Compose** — Single-command local setup with MySQL container
- [ ] **i18n Support** — Multi-language product descriptions and checkout

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/AVijit005">Avijit</a></sub>
  <br>
  <sub>Full-Stack Web Developer</sub>
</p>
