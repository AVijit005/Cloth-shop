# Architecture Decision Records

## What is an ADR?
An Architecture Decision Record captures a significant architectural decision
with its context, consequences, and rationale. These are written for future
engineers (and your interviewers) to understand *why* the system is built
the way it is.

---

## ADR-001: Dual-Storage Architecture (MySQL + In-Memory)

### Status
Accepted

### Context
The application needs to remain functional during database outages.
A single point of failure (the MySQL database) would make the entire
storefront unavailable, resulting in lost sales and poor user experience.

### Decision
Implement a **dual-storage pattern**: MySQL as the primary data store
with automatic in-memory fallback using Python lists/dicts.

```
read request → check_db_health()?
  ├── Yes → query MySQL (connection pool, pool_size=10)
  └── No  → query in-memory store (fallback)
```

Write operations in fallback mode mutate the in-memory store and are
lost on restart — acceptable for a read-mostly catalog with transient
order/cart state.

### Consequences

**Positive:**
- Zero downtime during MySQL failures — the catalog remains fully browseable
- Cart and order placement continue working from memory
- Simple implementation, no additional infrastructure (Redis, etc.)
- Automatic reconnection retry every 15 seconds

**Negative:**
- In-memory fallback data is ephemeral (lost on process restart)
- No ordering/user persistence in fallback mode (pre-seeded admin/customer only)
- Dual code paths increase test surface and complexity

### Alternatives Considered
- **Redis cache layer**: More robust, but adds infrastructure dependency
- **Read replicas**: Over-engineered for this scale
- **Static error page**: Simplest but worst UX

---

## ADR-002: Monolithic Backend with Progressive Modularization

### Status
Accepted

### Context
The project started as a single `app.py` file (~3000 lines). This is
unsustainable for a growing codebase but a full rewrite would block
feature delivery.

### Decision
Keep `app.py` as the production entry point while creating a
progressive migration scaffold in `app/` package:

```
app/
├── config/          ← Config classes (env-based)
├── middleware/       ← CSRF, brute-force, auth decorators
├── routes/          ← Blueprint-based route modules
├── services/        ← Business logic (email, security)
└── utils/           ← Pure functions (image processing, helpers)
```

Migration pattern: extract one route at a time into a Blueprint,
register it in `app.py`, delete the original route. This is additive
and never breaks production.

### Consequences

**Positive:**
- Zero risk — production app never stops working
- Easy to roll back individual migrations
- Provides a clear architectural target
- Demonstrates progressive refactoring skills

**Negative:**
- Two parallel codebases during transition
- `app.py` still contains duplicate logic until fully migrated
- Import conflicts between `app.py` module and `app/` package

---

## ADR-003: Vanilla JavaScript with Modular Migration Path

### Status
Accepted

### Context
The frontend is a 3200-line `main.js` file with page-specific
controllers, a path-based router, and shared utilities. A framework
(React/Vue) would add build tooling complexity and a steep learning
curve for new contributors.

### Decision
Keep vanilla JS but refactor into ES modules (`static/js/`) with a
future-oriented architecture:

```
static/js/
├── api/          ← Backend client modules
├── components/   ← Reusable UI (toast, product-card, modal)
├── pages/        ← Page controllers (one per route)
├── state/        ← Reactive stores (cart, wishlist)
└── utils/        ← Pure utilities (storage, dom, formatters)
```

The `data-page` attribute on `<body>` selects the controller.
`type="module"` on the script tag enables ES imports without a bundler.
Both old (`main.js`) and new (`js/main.js`) entry points coexist
during migration.

### Consequences

**Positive:**
- Zero build tooling — works with any static file server
- Clear separation of concerns
- Easy to extract into a React/Vue app later (same API layer)
- Event delegation on container elements reduces listener count

**Negative:**
- No tree-shaking or bundling — still multiple HTTP requests
- `type="module"` requires modern browsers (no IE11)
- Inline `onclick` handlers in templates can't use module-scoped functions
  (must expose on `window`)

---

## ADR-004: Session-Based Authentication (No JWT)

### Status
Accepted

### Context
The app needs user sessions for an e-commerce checkout flow.
The choice was between server-side sessions (Flask default) and
stateless JWT tokens.

### Decision
Use **Flask server-side sessions** with signed cookies.

```
Login success → session["user"] = { id, username, role, ... }
                                ↓
                        Encrypted with app.secret_key
                                ↓
                        Set-Cookie: session=<signed>
```

### Consequences

**Positive:**
- Simple — no token management, no refresh logic
- Session invalidation is immediate (clear session or server-side store)
- Built-in CSRF protection via per-session token
- "Remember me" via `session.permanent` flag

**Negative:**
- Session data limited to 4KB (cookie size)
- Not suitable for microservices (no cross-origin sharing)
- Requires `SameSite=Lax`/`Secure` flags for production

---

## ADR-005: No ORM — Raw SQL via mysql-connector-python

### Status
Accepted

### Context
The project needed database access. Options included SQLAlchemy (Flask's
default ORM), Peewee, or raw SQL.

### Decision
Use **raw SQL** via `mysql-connector-python` with a connection pool.

```python
def db_connection():
    return db_pool.get_connection()
```

### Consequences

**Positive:**
- Full control over queries — easy to optimize
- No ORM overhead or learning curve
- Clear SQL in code review
- Connection pool prevents connection leak issues

**Negative:**
- More verbose (no model classes, no migration framework)
- Manual result mapping
- No query builder — must write raw SQL strings

---

## ADR-006: In-Memory Testing (No Test Database)

### Status
Accepted

### Context
Tests need to run in CI without a MySQL database. The app's
dual-storage pattern makes this straightforward.

### Decision
Force in-memory mode in tests by monkeypatching `check_db_health()`
to return `False`. Seed the memory store with starter products
and auto-generated admin/customer users.

```python
# conftest.py
app_module.check_db_health = lambda: False
app_module.init_memory_store()
app_module.memory_users["admin"] = { "email_verified": 1, ... }
```

### Consequences

**Positive:**
- Tests run anywhere — no MySQL, no Docker
- Deterministic — no test database state pollution
- Fast — no network round trips
- CI pipeline is simple (just `pip install && pytest`)

**Negative:**
- Only tests the memory code path, not MySQL
- May miss MySQL-specific bugs (transaction isolation, encoding)
- CI should also run a subset of tests against MySQL (optional)
