# Deployment Checklist

Use this guide to publish and deploy the RankWrangler API container through GitHub Actions.

## GitHub Container Registry

1. Ensure GitHub Packages is enabled for the `merchbaseco` organization.
2. Generate a classic Personal Access Token with `write:packages`, `read:packages`, and `repo` scopes. Save it as `GHCR_WRITE_TOKEN`.
3. Add these repository secrets:
   - `GHCR_USERNAME` – GitHub username that owns the token.
   - `GHCR_TOKEN` – The value of `GHCR_WRITE_TOKEN`.

## Remote Deployment Access

The workflow connects to the Hetzner host as the dedicated `rankwrangler` user. Add these secrets:

- `DEPLOY_SSH_HOST` – Hostname or IP of the deployment box.
- `DEPLOY_SSH_USER` – Should be set to `rankwrangler`.
- `DEPLOY_SSH_PRIVATE_KEY` – Private key (PEM) for the `rankwrangler` user.
- `DEPLOY_SSH_PASSPHRASE` – Optional passphrase for the private key (leave blank if none).

## Runtime Secrets (GitHub Actions)

Store the application secrets as repository secrets; the workflow renders `stack/rankwrangler/.env` on the server automatically.

- `RANKWRANGLER_DATABASE_PASSWORD`
- `RANKWRANGLER_LICENSE_SECRET`
- `RANKWRANGLER_SESSION_SECRET`
- `RANKWRANGLER_ADMIN_EMAIL` (optional)
- `RANKWRANGLER_ADMIN_PASSWORD_HASH` (optional)
- `RANKWRANGLER_SPAPI_REFRESH_TOKEN`
- `RANKWRANGLER_SPAPI_CLIENT_ID`
- `RANKWRANGLER_SPAPI_APP_CLIENT_SECRET`

## Server Preparation

1. Provision the `rankwrangler` user on the server with membership in the `docker` group and a locked-down home (e.g. `/home/rankwrangler`).
2. Clone [`merchbaseco/infra`](https://github.com/merchbaseco/infra) into `~/merchbase-infra` for that user.
3. Authenticate Docker to GHCR with a read-only token: `echo "$TOKEN" | docker login ghcr.io -u <username> --password-stdin`.
4. Ensure the shared network exists: `docker network create webserver || true`.

Once configured, pushes to `main` build and push the container image. The workflow logs in as `rankwrangler`, updates `merchbase-infra`, writes `stack/rankwrangler/.env` from the stored secrets, and executes `stack/rankwrangler/deploy.sh` automatically.
