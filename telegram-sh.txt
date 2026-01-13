#!/bin/bash
set -e

echo "Configuring Telegram webhook reverse proxy in nginx..."

NGINX_CONF="/etc/nginx/sites-available/reporeply"

# Create file if it doesn't exist
if [ ! -f "$NGINX_CONF" ]; then
  echo "Creating nginx config file..."
  cat > "$NGINX_CONF" <<'EOF'
server {
    listen 80;
    server_name coderxrohan.engineer;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF
fi

# Add Telegram webhook location if not already present
if ! grep -q "location /telegram/webhook" "$NGINX_CONF"; then
  echo "Adding Telegram webhook proxy..."
  sed -i '/server {/a \
\
    # Telegram webhook → Node.js\
    location /telegram/webhook {\
        proxy_pass http://127.0.0.1:3000;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
    }\
' "$NGINX_CONF"
else
  echo "Telegram webhook proxy already exists. Skipping."
fi

# Enable site if not enabled
ln -sf /etc/nginx/sites-available/reporeply /etc/nginx/sites-enabled/reporeply

echo "Testing nginx configuration..."
nginx -t

echo "Reloading nginx..."
systemctl reload nginx

echo "Telegram webhook nginx setup completed."