FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV VITE_API_BASE=${VITE_API_BASE}
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}
ENV VITE_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html

RUN cat >/etc/nginx/conf.d/default.conf <<'EOF2'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF2
