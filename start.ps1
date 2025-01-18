# Clean up
Write-Host "Cleaning up..." -ForegroundColor Yellow
npm cache clean --force
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
Remove-Item port.txt -ErrorAction SilentlyContinue

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Start server
Write-Host "Starting server..." -ForegroundColor Green
node server.js 