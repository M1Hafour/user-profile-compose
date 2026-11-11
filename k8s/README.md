# User Profile on K3s

These manifests deploy the existing app as three workloads:

- `mongodb`: one-replica StatefulSet with a 2 GiB local-path PVC.
- `user-profile-backend`: Node.js API Deployment and ClusterIP Service.
- `user-profile-frontend`: Nginx Deployment and ClusterIP Service.
- `user-profile` Ingress: Traefik routes HTTP traffic to Nginx.

## One-time cluster preparation

Run on the K3s master. This pins the app and database pods to the worker to keep the small master focused on control-plane services:

```bash
sudo kubectl label node ip-10-0-12-9 workload=user-profile --overwrite
sudo kubectl create namespace user-profile
```

Create the database credentials as a Kubernetes Secret. Use the same username/password that you want the API and MongoDB to share; do not commit these values to Git:

```bash
sudo kubectl create secret generic user-profile-secrets \
  --namespace user-profile \
  --from-literal=MONGO_USERNAME='CHOOSE_A_DB_USERNAME' \
  --from-literal=MONGO_PASSWORD='CHOOSE_A_LONG_RANDOM_PASSWORD'
```

The namespace manifest is also included in the deployment, so creating it here is optional. The Secret must exist before MongoDB and the backend start.

## Deploy manually (without Jenkins)

Build and push public Docker Hub repositories named `user-profile-api` and `user-profile-frontend`. Replace `DOCKERHUB_USER` and `IMAGE_TAG` in the manifests, then apply them:

```bash
sudo kubectl apply -f k8s/
sudo kubectl get pods -n user-profile -o wide
sudo kubectl get ingress -n user-profile
```

## Access

The Traefik ServiceLB listens on the cluster nodes. If the master has a public IP and its AWS security group permits inbound TCP 80 from your client, browse to `http://MASTER_PUBLIC_IP/`.

MongoDB and the backend are ClusterIP-only; they are not exposed directly to the internet.

## Storage warning

The `local-path` PVC is local to the worker. It is appropriate for this learning lab but is not replicated or backed up automatically. Do not delete the PVC if you want to keep MongoDB data.
