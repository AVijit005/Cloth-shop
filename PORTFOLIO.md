# Portfolio & Interview Guide

## One-Liner (for resume / LinkedIn headline)

> **Full-stack engineer who built a production-grade e-commerce platform (Flask + MySQL) with 113 integration tests, Sentry error tracking, Docker deployment, dual-storage resilience, role-based access control, and a modular architecture — all vanilla JS frontend, no frameworks.**

---

## Resume Bullet Points

### For the project entry

1. **Engineered a full-stack e-commerce platform** (Flask, MySQL, Tailwind CSS) featuring product catalog with search/filter/pagination, cart/wishlist/checkout flow, coupon engine, and admin dashboard with real-time analytics — deployed on Render with Docker.

2. **Implemented production security hardening**: CSRF token validation, bcrypt password hashing, brute-force lockout (5 failures → 5-min block), session race condition fix, XSS sanitization in email templates, and image upload MIME/magic-byte verification — eliminating 4 OWASP Top 10 vulnerabilities.

3. **Built a 113-test integration suite** (pytest + coverage) covering auth, products, orders, reviews, admin, and security — using in-memory fallback mode for deterministic, MySQL-free CI execution.

4. **Designed a dual-storage resilience architecture** — MySQL connection pooling (pool_size=10) with automatic in-memory fallback on database failure, ensuring the storefront remains fully browseable during outages.

5. **Integrated Sentry error tracking** with structured request IDs across all endpoints, plus Docker HEALTHCHECK and `/api/health` endpoint for production observability and load-balancer health monitoring.

6. **Refactored monolithic codebase toward modular architecture** — created `app/` package with service layer (email, auth), middleware (CSRF, brute-force), utils (image processing, data normalization), and Blueprint sample — enabling progressive migration without disrupting production.

7. **Built a 4000+ line CSS design system** with glassmorphism aesthetics, responsive grid layouts (mobile/tablet/desktop), skeleton loading states, toast notifications, focus-trapped modals, and WCAG-accessible interactive elements.

### General full-stack skills
8. **Full-stack development**: Python (Flask), SQL (MySQL), JavaScript (vanilla ES6+), HTML/CSS (Tailwind, Jinja2), REST API design, session management, OAuth integration.
9. **DevOps & tooling**: Docker, Docker Compose, GitHub Actions (CI/CD), Sentry, Render deployment, Waitrace production server.
10. **Engineering practices**: pytest, TDD, code coverage, security-first mindset, progressive refactoring, dual-storage patterns, structured logging.

---

## STAR Interview Answers

### Q: "Tell me about a challenging project you built."

**Situation:** I wanted to build a production-grade e-commerce platform that would demonstrate real-world engineering — not just a tutorial app. It needed to handle real security threats, survive database outages, and scale to multiple users.

**Task:** Build a Flask fashion store with resilient architecture, proper security, professional testing, and deployment-ready infrastructure — with a recruiter-impressing codebase.

**Action:**
1. **Security-first**: Fixed a session race condition where `app.permanent_session_lifetime` was mutated per-request (would crash multi-threaded Waitress). Removed unnecessary CSRF exemptions. Added XSS escaping across all email templates. Built brute-force lockout with configurable thresholds.
2. **Dual-storage resilience**: Designed MySQL as primary with automatic in-memory fallback. If the database goes down, the entire storefront stays up — older products remain browsable, cart/checkout work from memory — users never see a 500 error.
3. **Professional testing**: Wrote 113 pytest integration tests covering auth, products, orders, coupons, reviews, admin, CSRF, XSS, brute-force, and authorization. Used an in-memory-only mode so tests run anywhere without MySQL.
4. **Security bug uncovered**: Found an `update_quest_progress` function that was called but never defined — it would crash on any review creation. Fixed it.
5. **Observability**: Added Sentry SDK (env-flag enabled), request IDs on every response (`X-Request-ID` header), Docker HEALTHCHECK, and a `/api/health` endpoint for load-balancer monitoring.

**Result:**
- 113/113 tests passing, 53% backend coverage in first pass
- Zero OWASP Top 10 vulnerabilities in audit
- Dual-storage failover tested and working
- README with architecture diagram, API docs, and deployment guide
- CI/CD pipeline with GitHub Actions (Ruff lint + pytest + coverage)

### Q: "What's the most interesting bug you fixed?"

**Session Race Condition (C1):**
The app had `app.permanent_session_lifetime = timedelta(minutes=30)` at startup, then *overrode* it per-request in login/logout based on "remember me". In a single-threaded dev server this works by luck — but under Waitress (multi-threaded), two concurrent requests could race: Request A (remember=true) sets lifetime to 30 days, Request B (remember=false) sets it back to 30 minutes, and User A gets booted prematurely.

**Fix:** Remove all per-request mutations. Set lifetime once at startup to `timedelta(days=30)`. Control actual expiry via `session.permanent = True/False` — which Flask natively interprets as "extend session cookie to lifetime". Simple, clean, race-condition-free.

### Q: "How do you ensure code quality?"

1. **Tests first**: Every API endpoint has at least happy-path + error-case tests. Auth tests cover registration validation, strength rules, duplicate detection, authorization boundaries.
2. **Security review**: Before any merge, I check: CSRF protection on all POST/PUT/DELETE, XSS in user-controlled output, rate limiting on auth endpoints, input validation, authorization decorators.
3. **CI pipeline**: GitHub Actions runs Ruff lint + pytest on every push. Coverage report generated but not gated (yet).
4. **Progressive refactoring**: The monolithic `app.py` coexists with a modular `app/` package. Routes are extracted one at a time into Blueprints — zero risk, continuous delivery.

---

## LinkedIn Project Post

```
🔥 I built a production-grade e-commerce platform from scratch.

No CMS. No paid template. No "just another CRUD app."

After spending months learning Flask, I challenged myself: 
"Can I build something that would actually pass a production security review?"

The result: Shibani Fashion Store — a full-stack e-commerce platform with:

✅ 113 integration tests (pytest, CI on every push)
✅ Security hardening (CSRF, XSS, brute-force lockout, bcrypt)
✅ Dual-storage resilience (MySQL + in-memory fallback)
✅ Role-based admin dashboard with analytics
✅ Sentry error tracking + structured logging
✅ Docker deployment with HEALTHCHECK
✅ Glassmorphism UI — 100% vanilla JS, zero frameworks

→ https://github.com/AVijit005/Cloth-shop

Skills: Python • Flask • MySQL • Docker • CI/CD • OWASP • REST APIs
```

---

## GitHub Repository Description

> **Production-grade Flask e-commerce platform** with security hardening (CSRF, XSS, brute-force), 113 integration tests, dual-storage resilience (MySQL + in-memory), Docker deployment, Sentry monitoring, role-based admin dashboard, and a glassmorphism vanilla-JS frontend. Built for portfolio demonstration of full-stack engineering quality.

---

## Tagline for Portfolio

> *"Full-stack engineer who ships secure, tested, production-ready code. This project demonstrates real-world engineering: not just features that work, but resilience when they break."*
