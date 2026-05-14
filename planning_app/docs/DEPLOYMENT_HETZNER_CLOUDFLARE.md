# Hetzner And Cloudflare Deployment Notes

## Target Layout

```text
Cloudflare DNS and SSL
  -> Hetzner Cloud VPS in Germany
    -> reverse proxy on ports 80/443
      -> lkw_planning_web:3000
      -> lkw_planning_api:4000
      -> lkw_planning_postgres:5432, private only
```

## Hetzner VPS

Recommended starting size for MVP:

- Location: Germany.
- OS: Ubuntu LTS.
- CPU/RAM: 2 vCPU / 4 GB RAM minimum.
- Disk: 80 GB or more, with monitoring for `storage/backups`.
- Firewall: allow only SSH, HTTP, HTTPS from internet.
- PostgreSQL port must not be exposed publicly.

Production files:

- Keep `.env` only on the server.
- Do not commit production secrets.
- Use a dedicated database `lkw_planning`.
- Use a dedicated PostgreSQL user for the planning app.

## Docker

Start or update:

```bash
docker compose up -d --build
```

Check health:

```bash
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
```

Docker JSON logs are limited in `docker-compose.yml`:

- max size: `10m`
- max files: `5`

## Reverse Proxy

Use Caddy or Traefik. Keep the public domain on HTTPS and proxy:

- `/` to `web:3000`
- `/api/*` to `api:4000`

Set `CORS_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL` to the production HTTPS domain.

## Cloudflare

DNS:

- Create an `A` record for the planning app subdomain pointing to the Hetzner VPS public IP.
- Keep proxy enabled unless direct troubleshooting is needed.

SSL:

- Use Full or Full Strict mode.
- Install a valid certificate on the reverse proxy, or use Cloudflare Origin Certificate.

Security:

- Enable basic WAF protections.
- Do not expose PostgreSQL through Cloudflare.
- Restrict admin access with strong passwords and role-based access in the app.

## Backups

Local VPS backups are not enough for production. Add one external target:

- Hetzner Storage Box.
- S3-compatible object storage.
- Another secured backup host.

Keep at least 30 daily backups and perform a restore test once per month.
