# User Profile App (Docker Compose)

A small web app: a page to add, list and delete users, backed by an API and a database.
All of it runs with Docker Compose on **one server**:

| Container | What it does | Reachable from the internet |
|---|---|---|
| `nginx` | Serves the web page and forwards `/api` and `/health` to the app | Yes: ports 80 and 443 |
| `app` | Node.js + Express REST API (`backend/`) | No |
| `mongodb` | MongoDB 7, data kept in the `mongo-data` volume | No |

HTTPS is **not** set up automatically. The default is plain HTTP. Turning on HTTPS is a
manual step (see GUIDE.md, part 8). Automatic deploys with Jenkins are in part 9.

## Layout

```
docker-compose.yml        the three services
.env.example              copy to .env and fill in (passwords)
Jenkinsfile               test, scan and deploy to the server (GUIDE.md, part 9)
nginx/default.conf        nginx config (HTTP, the default)
nginx/https.conf.example  nginx config for HTTPS; copied to nginx/https.conf on the server (not committed)
certs/                    HTTPS certificate files go here (not committed)
frontend/public/          the web page
backend/                  the API (Dockerfile, app.js, server.js, models/, tests)
GUIDE.md                  step-by-step: server setup, start, daily use, HTTPS, Jenkins
```

## Quick start

```bash
cp .env.example .env        # then edit it: set MONGO_USERNAME and MONGO_PASSWORD
docker compose up -d --build
curl -s http://localhost/health
```

Full steps for a fresh server are in [GUIDE.md](GUIDE.md).

## Tests (backend only)

```bash
cd backend
npm ci
npm test          # Jest
npx eslint .      # lint
```

## Deploy to the two-node K3s lab

The Docker Compose setup remains available for local development. For the AWS K3s cluster, see [k8s/README.md](k8s/README.md). The Kubernetes deployment uses separate Nginx and Node.js images, MongoDB with a persistent volume, and Traefik Ingress.

The Jenkinsfile now builds and tests the backend, builds and pushes both images to Docker Hub, then applies the Kubernetes manifests to the K3s master over SSH. Configure Jenkins credentials `dockerhub-creds` (Docker Hub username + access token) and `k3s-master-ssh` (SSH private key with username `ubuntu`). Make both Docker Hub repositories public for this initial setup. Create the `user-profile-secrets` Kubernetes Secret on the cluster before the first pipeline run; instructions are in [k8s/README.md](k8s/README.md).
