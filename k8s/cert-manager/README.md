# cert-manager and Let's Encrypt

This project uses cert-manager to automatically issue and renew TLS certificates.

## 1. Install cert-manager

Install version 1.21.3:

    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.3/cert-manager.yaml

Wait for all components:

    kubectl get pods -n cert-manager

## 2. Create the issuers

For testing:

    kubectl apply -f k8s/cert-manager/cluster-issuer-staging.yaml

For production:

    kubectl apply -f k8s/cert-manager/cluster-issuer-prod.yaml

Check status:

    kubectl get clusterissuer

## 3. Configure HTTPS

Apply the Ingress:

    kubectl apply -f k8s/40-ingress.yaml

Check certificate status:

    kubectl get certificate -n user-profile

## Requirements

- DNS points to the EC2 public IP.
- AWS Security Group allows inbound TCP ports 80 and 443.
- Traefik is installed and accessible.
- HTTP-01 validation requires public access to port 80.

## Security

Never commit TLS Secrets, ACME private keys, or application credentials to GitHub.
cert-manager generates and manages its own private resources.
