# Coming Soon — codereviewtrends.com

Temporary static landing page for SEO / domain indexing while the full site is under development. Delete this folder when the production app goes live.

## Deploy

Deployed to Cloud Run as a standalone service. See deploy instructions in the team's internal docs.

### Redeploy after changes

Edit files in `public/`, then redeploy:

```bash
cd coming-soon
gcloud run deploy crt-coming-soon \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

## Going live

When the production app is ready:

1. Deploy the real Next.js app to Cloud Run
2. Update DNS to point to the production service
3. Delete this `coming-soon/` folder from the repo
4. Clean up: `gcloud run services delete crt-coming-soon --region us-central1`

## SEO checklist

- [ ] Verify domain in [Google Search Console](https://search.google.com/search-console)
- [ ] Submit sitemap: `https://codereviewtrends.com/sitemap.xml`
- [ ] Test OG image: [opengraph.xyz](https://www.opengraph.xyz/)

## Files

| File | Purpose |
|------|---------|
| `public/index.html` | Landing page (dark theme, logo, SEO meta tags) |
| `public/og-image.png` | OpenGraph image for social shares (1200×630) |
| `public/robots.txt` | Allows all crawlers, points to sitemap |
| `public/sitemap.xml` | Single-page sitemap for search engines |
| `public/icon.svg` | SVG favicon |
| `public/favicon.ico` | ICO favicon |
| `public/apple-icon.png` | Apple touch icon |
| `nginx.conf` | Nginx config (port 8080, www redirect, caching) |
| `Dockerfile` | nginx:alpine serving static files |
