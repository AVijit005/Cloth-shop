# Technical Case Study: Shibani Fashion Store

## Overview

A production-grade fashion e-commerce platform built with Flask, MySQL,
and vanilla JavaScript. Designed for resilience, security, and portfolio
demonstration.

**Role**: Solo full-stack engineer  
**Timeline**: Iterative development with progressive hardening  
**Stack**: Python/Flask, MySQL, vanilla JS, Tailwind CSS, Docker, Sentry  

---

## Architecture Decisions

### 1. "Why not Django?"

Django is the conventional choice for e-commerce, but Flask was chosen because:
- **Interview alignment**: Most junior-interview codebases use Flask. Being proficient in Flask's lower-level patterns (sessions, middleware, decorators) demonstrates stronger fundamentals.
- **Learning surface**: Flask forces you to understand WSGI, session signing, CSRF token generation, and connection pooling — Django abstracts these away.
- **Monolith honesty**: Rather than pretending this is a microservice architecture, we own the monolith and have a clear modularization path.

### 2. "Why no React/Vue?"

The frontend is vanilla JavaScript, deliberately:
- **Zero build tooling**: No webpack, no Babel, no npm. Deploy by dropping files on a server.
- **Portfolio signal**: Shows competence in DOM APIs, event delegation, and ES modules — skills that transfer to any framework.
- **Migration path**: The modular `static/js/` architecture mirrors a component tree. Extracting to React would mean wrapping each module in a `React.Component`.

### 3. "Why raw SQL instead of SQLAlchemy?"

For a project of this scale, SQLAlchemy adds:
- 50ms+ import time overhead
- Complex query debugging (when does it flush?)
- An abstraction layer that obscures performance issues  

Raw SQL with `mysql-connector-python`:
- Full query visibility in code review
- Easy to explain in interviews ("This query joins orders+items, filtered by user_id")
- Connection pooling handles production throughput

---

## Security Philosophy

The OWASP Top 10 was the threat model:

| Threat | Mitigation |
|---|---|
| Injection (SQLi) | Parameterized queries everywhere (no string interpolation) |
| XSS | Jinja2 autoescaping + `html.escape()` in emails + DOM escaping |
| Broken auth | bcrypt hashing, brute-force lockout, session rotation |
| CSRF | Per-session random token, validated on all state-changing requests |
| Security misconfig | CSP headers, HSTS, nosniff, X-Frame-Options |
| Sensitive data exposure | No PII in logs, session signed with secret key |
| Broken access control | `@require_admin` decorator gates all admin endpoints |

---

## Resilience Engineering

The dual-storage pattern is the most interesting architectural decision:

```
Normal operation:          MySQL outage:
┌──────────┐               ┌──────────┐
│  Client   │               │  Client   │
└────┬─────┘               └────┬─────┘
     │ HTTP                     │ HTTP
┌────▼─────┐               ┌────▼─────┐
│  Flask   │               │  Flask   │
└────┬─────┘               └────┬─────┘
     │                          │
┌────▼─────┐               ┌────▼──────────┐
│  MySQL   │               │  Memory Store │
│ (primary)│               │  (fallback)   │
└──────────┘               └───────────────┘
     │                          │
     └── Connection pool ───────┘
         (auto-retry every 15s)
```

Key insight: the `check_db_health()` function acts as a circuit breaker.
When MySQL fails, the app shifts to read-only-from-memory mode within
one request. On the next successful connection, it shifts back.
Users never see a 500 error.

---

## Testing Strategy

113 integration tests organized by domain:

```
tests/
├── test_auth.py      # 31 tests — register, login, authorization
├── test_orders.py    # 14 tests — creation, stock, coupons, cancel
├── test_products.py  # 16 tests — listing, CRUD, pagination
├── test_admin.py     # 14 tests — dashboard, settings, order management
├── test_reviews.py   # 11 tests — CRUD, moderation
├── test_profile.py   # 10 tests — profile, address book
├── test_security.py  # 14 tests — CSRF, XSS, brute-force, input validation
└── test_health.py    # 3 tests — health check, status
```

**Pattern**: Each test file follows AAA (Arrange-Act-Assert).
Tests use the app's in-memory fallback mode for determinism.

---

## Lessons Learned

### What went right
1. **Security-first mindset**: Finding and fixing the session race condition (C1), missing CSRF exemptions (C2), and unescaped email output (C3) early prevented production incidents.
2. **Dual-storage**: The memory fallback was originally a development convenience but became the most impressive architecture feature.
3. **Testing investment**: The 113-test suite catches regressions immediately and serves as living documentation.

### What I'd improve
1. **Start modular**: The monolithic `run.py` grew organically. Starting with Blueprints from day one would have saved refactoring effort.
2. **Type hints**: Python type hints on all functions would catch interface mismatches earlier.
3. **CI with MySQL**: Currently tests only exercise the memory path. A Docker-based CI job that tests against a real MySQL would catch storage-specific bugs.

### For the next version
- [ ] Stripe/Razorpay payment integration (replacing manual COD/UPI QR)
- [ ] Product variants (color × size matrix with per-variant stock)
- [ ] Redis caching layer (replace simple in-memory fallback)
- [ ] Webhook-driven payment confirmation
- [ ] Admin push notifications (new order alerts)
