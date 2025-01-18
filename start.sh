#!/bin/bash

# Clean up
echo "Cleaning up..."
npm cache clean --force
rm -rf node_modules
rm -f package-lock.json
rm -f port.txt

# Install dependencies
echo "Installing dependencies..."
npm install

# Start server
echo "Starting server..."
node server.js 