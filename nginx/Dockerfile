# Build from the repository root: docker build -f nginx/Dockerfile -t IMAGE .
FROM nginx:1.27-alpine

COPY frontend/public/ /usr/share/nginx/html/
COPY nginx/k8s.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
