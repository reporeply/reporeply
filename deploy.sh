#!/bin/bash
set -e

cd /root/reporeply

echo "Pulling latest code..."
git pull origin main

echo "Installing dependencies..."
npm install --production

echo "Deploying nginx index.html..."
cp nginx/index.html /var/www/html/index.html
chown www-data:www-data /var/www/html/index.html
chmod 644 /var/www/html/index.html

echo "Reloading nginx..."
nginx -t
systemctl reload nginx

echo "Restarting app..."
pm2 restart reporeply --update-env

echo "Deployment finished successfully"
