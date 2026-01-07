#!/bin/bash
set -e

cd /root/reporeply

echo "Pulling latest code..."
git pull origin main

echo "Installing dependencies..."
npm install --production

echo "Restarting app..."
pm2 restart reporeply --update-env

echo "Deployment finished successfully"