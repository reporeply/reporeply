#!/bin/bash
set -e

cd /root/reporeply

echo "Pulling latest code..."
git fetch origin
git reset --hard origin/main

echo "Installing dependencies..."
npm install --production

echo "Deploying nginx index.html..."
cp nginx/index.html /var/www/html/index.html
chown www-data:www-data /var/www/html/index.html
chmod 644 /var/www/html/index.html

echo "Deploying nginx privacy-policy.html..."
cp nginx/privacy-policy.html /var/www/html/privacy-policy.html
chown www-data:www-data /var/www/html/privacy-policy.html
chmod 644 /var/www/html/privacy-policy.html

echo "Deploying nginx contact-us.html..."
cp nginx/contact-us.html /var/www/html/contact-us.html
chown www-data:www-data /var/www/html/contact-us.html
chmod 644 /var/www/html/contact-us.html

echo "Deploying nginx favicon.png..."
cp nginx/favicon.png /var/www/html/favicon.png
chown www-data:www-data /var/www/html/favicon.png
chmod 644 /var/www/html/favicon.png

echo "Deploying nginx rohansatkar.html..."
cp nginx/rohansatkar.html /var/www/html/rohansatkar.html
chown www-data:www-data /var/www/html/rohansatkar.html
chmod 644 /var/www/html/rohansatkar.html

echo "Deploying nginx coderxrohan.html..."
cp nginx/coderxrohan.html /var/www/html/coderxrohan.html
chown www-data:www-data /var/www/html/coderxrohan.html
chmod 644 /var/www/html/coderxrohan.html

echo "Deploying nginx sitemap.xml..."
cp nginx/sitemap.xml /var/www/html/sitemap.xml
chown www-data:www-data /var/www/html/sitemap.xml
chmod 644 /var/www/html/sitemap.xml

echo "Reloading nginx..."
nginx -t
systemctl reload nginx

echo "Restarting app..."
pm2 restart reporeply --update-env

echo "Deployment finished successfully"
