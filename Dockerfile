# Velum Luau Obfuscator - Static site
FROM nginx:alpine

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy the site
COPY index.html /usr/share/nginx/html/
COPY obfuscator.js /usr/share/nginx/html/
COPY README.md /usr/share/nginx/html/

# Optional: custom nginx config for better caching & security headers
RUN cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
