# Production Deployment Checklist

## Pre-Deployment

- [ ] `.env` configured with production values
- [ ] `SECRET_KEY` is a strong random string (`python -c "import secrets; print(secrets.token_hex(32))"`)
- [ ] `FLASK_ENV=production` (enables Secure cookies, HSTS)
- [ ] MySQL connection credentials are production-grade (not root)
- [ ] `SENTRY_DSN` configured for error tracking
- [ ] Firebase service account configured (if using Google sign-in)
- [ ] SMTP credentials configured (for email verification + order confirmations)

## Security Checklist

- [ ] CSRF protection active (verify `X-CSRF-Token` header on all POST/PUT/DELETE)
- [ ] CSP headers applied (check browser console for violations)
- [ ] HSTS enabled (Strict-Transport-Security)
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy restricts camera/mic/geolocation
- [ ] Session cookies: HttpOnly, SameSite=Lax, Secure=true
- [ ] Password strength validation enforced on registration
- [ ] Brute-force lockout active (5 failures → 5 min block)
- [ ] Image upload: MIME whitelist, size limit, magic byte verification

## Performance Checklist

- [ ] Static assets cached (`Cache-Control: max-age=31536000, immutable`)
- [ ] Uploaded images cached (`Cache-Control: max-age=604800, immutable`)
- [ ] Product API paginated (max 200 per page)
- [ ] Database indexes applied (orders, products, reviews, coupons, users)
- [ ] Image lazy loading (`loading="lazy"` on all product images)
- [ ] Debounced search (300ms delay)
- [ ] Connection pool configured (pool_size=10)

## Monitoring Checklist

- [ ] Sentry error tracking active
- [ ] Request IDs logged on every response (`X-Request-ID` header)
- [ ] `/api/health` endpoint returns 200 for load balancer
- [ ] Docker HEALTHCHECK configured
- [ ] Application logs available (Render dashboard or log aggregator)

## Deployment Architecture

```
                          ┌─────────────┐
                          │  Cloudflare  │  (optional — CDN + DDoS protection)
                          └──────┬──────┘
                                 │
                          ┌──────▼──────┐
                          │    Render    │
                          │  (Waitress)  │
                          └──────┬──────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
     ┌────────▼──────┐  ┌───────▼────────┐  ┌──────▼──────┐
     │    MySQL 8.0   │  │   Sentry       │  │    SMTP     │
     │  (Render/Aiven) │  │  (error tracking)│  │ (email)    │
     └────────────────┘  └────────────────┘  └────────────┘
```

## Incident Recovery

### Database failure
1. App automatically falls back to in-memory store
2. Catalog remains browseable, cart/checkout work from memory
3. MySQL retries every 15 seconds (`check_db_health()`)
4. When MySQL recovers, all operations resume using database
5. **Data loss**: In-memory orders placed during outage are lost

### Application crash
1. Render auto-restarts the process (health check monitors `/api/health`)
2. In-memory state is reset to seed data
3. Persistent data in MySQL survives

### Deployment rollback
1. Render supports one-click rollback to previous version
2. Database schema changes should be backward-compatible for one version

## Backup Strategy

- **Database**: Use Render's automated MySQL backups or `mysqldump` daily
- **Uploads**: Back up `uploads/` directory (static images)
- **Environment variables**: Store securely (Render dashboard or 1Password)
