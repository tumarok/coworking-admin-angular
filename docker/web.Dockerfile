# The production build of the app, served by nginx; /api is proxied to $API_UPSTREAM.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY angular.json tsconfig*.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# The unprivileged build of the official nginx image (maintained by the NGINX team): it runs as
# the nginx user and listens on 8080, so the container needs no root and no extra capabilities.
# It renders /etc/nginx/templates/*.template with the environment at start-up, like the plain image.
FROM nginxinc/nginx-unprivileged:1.30-alpine
ENV API_UPSTREAM=http://api:4010
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/coworking-admin-angular/browser /usr/share/nginx/html
EXPOSE 8080
