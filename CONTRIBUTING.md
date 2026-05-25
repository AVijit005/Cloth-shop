# Contributing to SHIBANI Fashion E-Commerce

Thank you for considering contributing! This project is a portfolio-grade e-commerce platform, and contributions that improve engineering quality, UX, or documentation are welcome.

## How to Contribute

1. **Fork** the repository
2. **Create a feature branch** (`git checkout -b feat/your-feature`)
3. **Make changes** — follow existing code style (single-file Flask, vanilla JS, Tailwind utility classes)
4. **Test** — ensure the app runs locally with `python app.py` and the frontend loads without console errors
5. **Commit** with a clear message (`feat: add wishlist email notifications`)
6. **Push** and open a Pull Request

## Guidelines

- **No React/Vue** — this project intentionally uses vanilla JS. Keep it that way.
- **No package.json** — Tailwind is loaded via CDN. No npm needed.
- **Engineer for resilience** — if you add a feature that depends on an external service, ensure graceful degradation.
- **Accessibility** — new UI elements must include ARIA labels and keyboard navigation.
- **Mobile-first** — use Tailwind responsive prefixes; test on small viewports.

## What Needs Help

See the [Roadmap](./README.md#roadmap) in the README for planned features. PRs for any roadmap item are welcome.
