# Adding a new app behind Caddy

A repeatable runbook for adding a new internal app at `<name>.eppi.center` with automatic Let's Encrypt TLS, served via the Caddy reverse proxy on the lab box.

**Time required:** ~5 minutes per app, plus DNS propagation wait (1–10 min, usually instant).

## Two approaches

This playbook covers two ways to obtain TLS certs from Let's Encrypt for our private-IP setup. Both use the DNS-01 challenge (required because the lab box isn't reachable from the public internet on port 80). Pick **one** and follow that section.

| Approach                    | Per-app setup                                        | Credential blast radius                                                       | When to use                                                                                              |
|-----------------------------|------------------------------------------------------|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| **A — acme-dns**            | Register account + add CNAME in Porkbun + edit JSON  | Tiny — credentials can only write `_acme-challenge` TXT records               | Default. Works when Porkbun's API is broken. Survives DNS provider migration without re-issuing certs.   |
| **B — Porkbun API**         | Just add the site block to `Caddyfile`               | Wide — Caddy can edit any DNS record on any domain in the Porkbun account     | Want fewer per-app steps and trust the Porkbun API to stay up.                                           |

**Currently deployed:** Approach A (acme-dns). If you're maintaining this and want to switch, see [Migrating between approaches](#migrating-between-approaches).

---

## Common prerequisites

These apply regardless of which approach you use:

- App is running on the lab box and reachable from another container on the `web` Docker network (or on the host).
- You can edit files in `/opt/caddy/` and run `docker compose` there.
- You have access to the Porkbun dashboard for `eppi.center`.
- A wildcard `A *.eppi.center → <lab-box-IP>` record exists in Porkbun (covers every current and future subdomain).

## Common naming conventions

Pick these once for the new app and use the same string everywhere:

- **Subdomain:** `<name>` (lowercase, no underscores, e.g. `jupyter`, `arwen`, `sampledb3`)
- **FQDN:** `<name>.eppi.center`
- **Container/service name** (in the app's `docker-compose.yml`): `<name>`

Keeping these identical means there's only one string to remember.

---

# Approach A — acme-dns

Caddy obtains certs by writing TXT records to a separate `acme-dns` server (we use the public `auth.acme-dns.io`). Porkbun only sees a one-time CNAME per subdomain.

## A — Quick checklist (for experienced users)

```
[ ] curl -X POST https://auth.acme-dns.io/register   # save the JSON
[ ] Porkbun: CNAME _acme-challenge.<name>  →  <fulldomain-from-step-1>.
[ ] dig CNAME _acme-challenge.<name>.eppi.center +short    # verify
[ ] Append entry to /opt/caddy/acmedns.json
[ ] Add site block to /opt/caddy/Caddyfile
[ ] Ensure app container is on the `web` network
[ ] docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
[ ] curl -I https://<name>.eppi.center        # expect 200 / 3xx, not 502
```

## A — One-time setup (skip if Caddy is already configured for acme-dns)

If you're setting up acme-dns from scratch (or migrating from Porkbun API):

1. **Build Caddy with the acme-dns plugin.** `/opt/caddy/Dockerfile`:

   ```dockerfile
   FROM caddy:2-builder AS builder
   RUN xcaddy build --with github.com/caddy-dns/acmedns

   FROM caddy:2-alpine
   COPY --from=builder /usr/bin/caddy /usr/bin/caddy
   ```

2. **Create `/opt/caddy/acmedns.json`** as an empty object (mode 600):

   ```bash
   echo '{}' | sudo tee /opt/caddy/acmedns.json
   sudo chmod 600 /opt/caddy/acmedns.json
   ```

3. **Mount it into the container.** In `/opt/caddy/docker-compose.yml`:

   ```yaml
   volumes:
     - ./Caddyfile:/etc/caddy/Caddyfile:ro
     - ./acmedns.json:/etc/caddy/acmedns.json:ro
     - caddy_data:/data
     - caddy_config:/config
   ```

4. **Configure the global block** in `/opt/caddy/Caddyfile`:

   ```caddyfile
   {
       email you@eppi.center
       acme_dns acmedns /etc/caddy/acmedns.json
   }
   ```

5. **Build and start:**

   ```bash
   cd /opt/caddy
   docker compose up -d --build
   ```

## A — Step-by-step: adding a new app

### A1. Register an acme-dns account

```bash
curl -sX POST https://auth.acme-dns.io/register | jq .
```

Save the entire JSON response somewhere safe (password manager). Example:

```json
{
  "username": "eabcdef0-1234-5678-90ab-cdef12345678",
  "password": "long-random-string-from-acme-dns",
  "fulldomain": "a1b2c3d4-5678-90ab-cdef-1234567890ab.auth.acme-dns.io",
  "subdomain": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "allowfrom": []
}
```

> One account = one subdomain. Don't reuse credentials across apps.

### A2. Add the CNAME in Porkbun

In the Porkbun dashboard for `eppi.center` → **DNS Records**:

| Type  | Host                      | Answer                                                      | TTL |
|-------|---------------------------|-------------------------------------------------------------|-----|
| CNAME | `_acme-challenge.<name>`  | `<fulldomain-from-A1>.` *(note trailing dot)*               | 600 |

Example for `jupyter`:

- Host: `_acme-challenge.jupyter`
- Answer: `a1b2c3d4-5678-90ab-cdef-1234567890ab.auth.acme-dns.io.`

### A3. Verify the CNAME propagated

```bash
dig CNAME _acme-challenge.<name>.eppi.center +short
```

Expected output: the `fulldomain` value, ending in a dot. If empty, wait 1–2 minutes and retry. **Don't proceed until this works** — Caddy will fail to issue the cert otherwise.

### A4. Add credentials to `/opt/caddy/acmedns.json`

```bash
sudo vim /opt/caddy/acmedns.json
```

Append a new top-level entry (mind the trailing comma on the previous block):

```json
{
  "sampledb3.eppi.center": {
    "username": "...",
    "password": "...",
    "subdomain": "...",
    "server_url": "https://auth.acme-dns.io"
  },
  "<name>.eppi.center": {
    "username": "<username from A1>",
    "password": "<password from A1>",
    "subdomain": "<subdomain from A1>",
    "server_url": "https://auth.acme-dns.io"
  }
}
```

**Required field names exactly:** `username`, `password`, `subdomain`, `server_url`. Do not include `fulldomain` or `allowfrom` — they're harmless but unused.

Validate before continuing:

```bash
jq . /opt/caddy/acmedns.json > /dev/null && echo "OK" || echo "BROKEN JSON"
```

If broken, fix it before reloading Caddy or the whole proxy will crash-loop.

### A5. Add the site block to `/opt/caddy/Caddyfile`

```bash
sudo vim /opt/caddy/Caddyfile
```

Append:

```caddyfile
<name>.eppi.center {
    reverse_proxy <name>:<port>
}
```

Where:

- `<name>` (host) is the FQDN — must match the JSON key in `acmedns.json` exactly.
- `<name>:<port>` (upstream) is the **container name** on the shared `web` Docker network and the port the app listens on inside its container.

Examples:

```caddyfile
arwen.eppi.center {
    reverse_proxy arwen:8787
}

jupyter.eppi.center {
    reverse_proxy jupyter:8000
}
```

If the app isn't dockerized and runs as a host process, use `host.docker.internal:<port>` instead and make sure the app binds to `0.0.0.0` (not `127.0.0.1`) — see [Troubleshooting](#troubleshooting).

### A6. Make sure the app is on the `web` network

In the app's own `docker-compose.yml`:

```yaml
services:
  <name>:
    container_name: <name>
    # ...
    networks:
      - web

networks:
  web:
    external: true
```

If you just added this, recreate the container:

```bash
cd /path/to/<app>
docker compose up -d --force-recreate
```

Quick sanity check from inside Caddy:

```bash
docker compose -f /opt/caddy/docker-compose.yml exec caddy \
  wget -qO- http://<name>:<port>/   # or /health if the app has one
```

If this returns 502 / connection refused, the app isn't on the `web` network or isn't listening yet.

### A7. Reload Caddy and verify

```bash
cd /opt/caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs -f caddy | grep -E "obtain|certificate|<name>"
```

Look for `certificate obtained successfully`. Takes ~10–30 seconds.

```bash
curl -I https://<name>.eppi.center
```

Expected: `HTTP/2 200` (or `301`/`302`) and `server: Caddy`. Open in a browser and confirm the padlock is green and the cert is issued by Let's Encrypt.

If the app uses cookies for auth, log in and reload to confirm cookies stick (the `Secure` flag requires HTTPS — this is the moment of truth).

## A — Removing an app

1. Remove the site block from `/opt/caddy/Caddyfile`.
2. Remove the entry from `/opt/caddy/acmedns.json`.
3. `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
4. (Optional) Delete the CNAME in Porkbun.
5. (Optional) Caddy will keep the cert in `/data` until expiry; safe to leave or `docker compose exec caddy rm -rf /data/caddy/certificates/.../<name>.eppi.center/`.

The acme-dns account at `auth.acme-dns.io` lives forever and can't be deleted by you — just stop using it.

---

# Approach B — Porkbun API

Caddy obtains certs by writing TXT records directly to your Porkbun zone via the Porkbun API. No CNAMEs, no `acmedns.json`, no per-subdomain registration.

## B — Quick checklist (for experienced users)

```
[ ] Add site block to /opt/caddy/Caddyfile
[ ] Ensure app container is on the `web` network
[ ] docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
[ ] curl -I https://<name>.eppi.center        # expect 200 / 3xx, not 502
```

That's it. The trade-off for this brevity is the wider credential blast radius (see comparison table at top).

## B — One-time setup (skip if Caddy is already configured for Porkbun API)

### B-S1. Enable Porkbun API access

1. **Account level:** Porkbun dashboard → Account → API Access → enable, then generate keys. You get an `API Key` (`pk1_...`) and a `Secret API Key` (`sk1_...`). Save both.
2. **Domain level (often missed):** Domain Management → `eppi.center` → toggle **API Access** ON for that specific domain. Without this, the API returns 401 even with valid account-level keys.

### B-S2. Build Caddy with the Porkbun plugin

`/opt/caddy/Dockerfile`:

```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/porkbun

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

(For migration periods, install both: `--with github.com/caddy-dns/porkbun --with github.com/caddy-dns/acmedns`.)

### B-S3. Add API credentials

Create `/opt/caddy/.env` (mode 600):

```bash
PORKBUN_API_KEY=pk1_xxxxxxxxxxxxxxxx
PORKBUN_API_SECRET=sk1_xxxxxxxxxxxxxxxx
```

```bash
sudo chmod 600 /opt/caddy/.env
```

In `/opt/caddy/docker-compose.yml`, pass them through to the container:

```yaml
services:
  caddy:
    # ... rest of config ...
    environment:
      PORKBUN_API_KEY: ${PORKBUN_API_KEY}
      PORKBUN_API_SECRET: ${PORKBUN_API_SECRET}
```

(Compose automatically loads `.env` from the same directory as `docker-compose.yml`.)

### B-S4. Configure the global block in `/opt/caddy/Caddyfile`

```caddyfile
{
    email you@eppi.center
    acme_dns porkbun {
        api_key {env.PORKBUN_API_KEY}
        api_secret_key {env.PORKBUN_API_SECRET}
    }
}
```

### B-S5. Build and start

```bash
cd /opt/caddy
docker compose up -d --build --force-recreate
docker compose logs -f caddy
```

You should see Caddy contact Porkbun and obtain certs for any existing site blocks.

## B — Step-by-step: adding a new app

### B1. Add the site block to `/opt/caddy/Caddyfile`

```bash
sudo vim /opt/caddy/Caddyfile
```

Append:

```caddyfile
<name>.eppi.center {
    reverse_proxy <name>:<port>
}
```

Where `<name>:<port>` is the **container name** on the shared `web` Docker network and the port the app listens on inside its container.

If the app isn't dockerized, use `host.docker.internal:<port>` and make sure the app binds to `0.0.0.0` (not `127.0.0.1`) — see [Troubleshooting](#troubleshooting).

### B2. Make sure the app is on the `web` network

In the app's own `docker-compose.yml`:

```yaml
services:
  <name>:
    container_name: <name>
    # ...
    networks:
      - web

networks:
  web:
    external: true
```

If you just added this, recreate the container:

```bash
cd /path/to/<app>
docker compose up -d --force-recreate
```

### B3. Reload Caddy and verify

```bash
cd /opt/caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs -f caddy | grep -E "obtain|certificate|<name>"
```

Look for `certificate obtained successfully`. Takes ~10–30 seconds.

```bash
curl -I https://<name>.eppi.center
```

Expected: `HTTP/2 200` (or `301`/`302`) and `server: Caddy`. Open in a browser and confirm the padlock is green.

## B — Removing an app

1. Remove the site block from `/opt/caddy/Caddyfile`.
2. `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
3. (Optional) Caddy keeps the cert in `/data` until expiry; safe to leave or delete it manually.

There's nothing else to clean up — no CNAME, no JSON entry, no acme-dns account.

---

# Migrating between approaches

Certs already on disk in the `caddy_data` volume keep working until they near expiry (~30 days remaining), at which point Caddy renews them using whichever DNS provider is currently configured. So you can switch freely between approaches and existing certs won't break.

## A → B (acme-dns → Porkbun API)

1. Build Caddy with **both** plugins (Approach B, step S2, but include both `--with` lines).
2. Do all of Approach B's one-time setup (S1, S3, S4, S5). The Porkbun global block replaces the acme-dns global block in `Caddyfile`.
3. New issuances + renewals now use Porkbun. Existing certs continue working.
4. Wait ~60 days for all certs to renew naturally, or force re-issuance per cert via `caddy reload` after deleting the cert from `/data/caddy/certificates/`.
5. Once nothing is using acme-dns, clean up:
   - Remove `/opt/caddy/acmedns.json`
   - Remove the volume mount for it from `docker-compose.yml`
   - Delete the `_acme-challenge.*` CNAMEs in Porkbun
   - Optionally rebuild Caddy without the acme-dns plugin

## B → A (Porkbun API → acme-dns)

1. Build Caddy with both plugins.
2. Do Approach A's one-time setup (acmedns.json + global block).
3. For each subdomain currently served, follow Approach A steps A1–A4 (register account, add CNAME, add JSON entry).
4. Replace the global Porkbun block with the acme-dns block.
5. `docker compose up -d --force-recreate`. New renewals will use acme-dns.
6. Once nothing is using Porkbun:
   - Remove `PORKBUN_*` from `.env` and the compose `environment:` block
   - Optionally rotate/disable the Porkbun API key for safety
   - Optionally rebuild without the Porkbun plugin

---

# Troubleshooting

## Common (both approaches)

| Symptom                                                  | Likely cause                                                   | Fix                                                               |
|----------------------------------------------------------|----------------------------------------------------------------|-------------------------------------------------------------------|
| `502 Bad Gateway` from `https://<name>.eppi.center`      | Caddy can't reach upstream                                     | `docker compose exec caddy wget http://<upstream>/`; if refused, app isn't on `web` network or not listening |
| `502` and `wget` from Caddy returns "Connection refused" to `172.17.0.1` | App bound to `127.0.0.1` on host, Caddy comes from docker0 | Put both on the `web` Docker network and proxy by container name |
| Cert issuance fails with rate-limit error                | Too many failed attempts in last hour                          | Wait 1 hour; fix the underlying problem first; LE staging available for testing |
| Login works once but doesn't persist                     | App cookies marked `Secure` but page served over HTTP          | Verify the URL bar shows `https://`, not `http://` after redirect |
| `nslookup host.docker.internal` "times out" in Alpine    | BusyBox `nslookup` doesn't read `/etc/hosts`                   | Not actually a problem; use `cat /etc/hosts` or `wget` to verify  |
| Caddyfile change doesn't take effect after edit          | Caddy not reloaded, or wrong file edited                       | `docker compose exec caddy cat /etc/caddy/Caddyfile` to confirm what Caddy sees |

## Approach A specific (acme-dns)

| Symptom                                                  | Likely cause                                                   | Fix                                                               |
|----------------------------------------------------------|----------------------------------------------------------------|-------------------------------------------------------------------|
| Caddy crash-loops on startup, "Failed to read config"    | `acme_dns acmedns` path in Caddyfile uses host path            | Use the *container* path: `/etc/caddy/acmedns.json`               |
| "Failed to unmarshall config"                            | Invalid JSON syntax or wrong field names in `acmedns.json`     | Run `jq . acmedns.json`; ensure keys are `username`/`password`/`subdomain`/`server_url` |
| Cert issuance fails with "no TXT record found"           | CNAME not propagated yet, or wrong target                      | `dig CNAME _acme-challenge.<name>.eppi.center +short` — must return the acme-dns fulldomain |
| `acmedns.json` mounts as a directory                     | File didn't exist on host when `docker compose up` first ran   | `docker compose down`, `rm -rf` the bogus directory, create the file, `up -d` |

## Approach B specific (Porkbun API)

| Symptom                                                  | Likely cause                                                   | Fix                                                               |
|----------------------------------------------------------|----------------------------------------------------------------|-------------------------------------------------------------------|
| Cert issuance fails with "401 unauthorized" or "API key invalid" | API access not enabled on the *domain* (separate from account-level access) | Porkbun → Domain Management → `eppi.center` → toggle API access ON for that specific domain |
| Cert issuance hangs or fails intermittently              | Porkbun API outage / rate limit                                | Check status.porkbun.com; consider falling back to acme-dns (see migration steps above) |
| `{env.PORKBUN_API_KEY}` appears literally in logs        | Env var not passed into container                              | Confirm `environment:` block in `docker-compose.yml` references the var, and `.env` file exists in same directory |

---

## SPA and reverse-proxy caching (optional)

When the app is **only** behind Caddy with `reverse_proxy` to the container, the SampleDB process sets `Cache-Control` for HTML, hashed static assets, and the version endpoint. If you add a **CDN**, another reverse proxy, or Caddy’s `cache` / custom `header` rules in front, align with that policy: **do not** apply long `max-age` to HTML (including SPA fallbacks) or to `/api/app-version`; you **may** set long, immutable-style caching for hashed files under paths such as `/assets/`. Stale `index.html` in a shared cache is a common reason users see broken or outdated UIs right after a deploy.

---

# File reference

| What                                | Where on the lab box                                        | Used by      |
|-------------------------------------|-------------------------------------------------------------|--------------|
| Caddy compose file                  | `/opt/caddy/docker-compose.yml`                             | Both         |
| Caddy site config                   | `/opt/caddy/Caddyfile`                                      | Both         |
| Caddy custom Dockerfile             | `/opt/caddy/Dockerfile`                                     | Both         |
| Issued certs (don't edit)           | `caddy_data` Docker volume → `/data/caddy/certificates/` inside container | Both         |
| Caddy logs                          | `docker compose -f /opt/caddy/docker-compose.yml logs caddy` | Both         |
| acme-dns credentials                | `/opt/caddy/acmedns.json` (mode 600)                        | Approach A   |
| Porkbun API credentials             | `/opt/caddy/.env` (mode 600)                                | Approach B   |

---

# Backup

Whichever approach you use, **back up the credentials file** alongside the SampleDB DB backup:

- **Approach A:** `/opt/caddy/acmedns.json` — losing it means re-registering every acme-dns account and re-adding every Porkbun CNAME.
- **Approach B:** `/opt/caddy/.env` — losing it means generating a new Porkbun API key (low effort, but you'll have a brief window with no auto-renewal).

Both: the Porkbun zone file itself is worth a periodic export from the Porkbun dashboard.

The `caddy_data` Docker volume holds the issued certs and ACME account keys. Losing it just means re-issuing certs on next renewal (rate-limited by Let's Encrypt but recoverable). Back it up if you want zero-downtime disaster recovery.

If `/opt/caddy/` is ever version-controlled, ensure both `acmedns.json` and `.env` are in `.gitignore`.
