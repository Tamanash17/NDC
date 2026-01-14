# Restart NDC Booking Engine Servers
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NDC Booking Engine - Server Restart" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop existing processes
Write-Host "[1/4] Stopping existing servers..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*Backend Server*" -or
    $_.MainWindowTitle -like "*Frontend Server*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill processes on ports 3001 and 5173
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Stop-Process -Id $port3001.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "  - Stopped process on port 3001" -ForegroundColor Gray
}

$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($port5173) {
    Stop-Process -Id $port5173.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "  - Stopped process on port 5173" -ForegroundColor Gray
}

Start-Sleep -Seconds 2

# Start Backend
Write-Host ""
Write-Host "[2/4] Starting Backend Server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm run dev" -WindowStyle Normal

Write-Host "  Waiting for backend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Check if backend started
$backendRunning = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "  ✓ Backend running on http://localhost:3001" -ForegroundColor Green
} else {
    Write-Host "  ✗ Backend failed to start!" -ForegroundColor Red
}

# Start Frontend
Write-Host ""
Write-Host "[3/4] Starting Frontend Server..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -WindowStyle Normal

Write-Host "  Waiting for frontend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Check if frontend started
$frontendRunning = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "  ✓ Frontend running on http://localhost:5173" -ForegroundColor Green
} else {
    Write-Host "  ✗ Frontend failed to start!" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Server Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($backendRunning) {
    Write-Host "  Backend:  http://localhost:3001/api ✓" -ForegroundColor Green
} else {
    Write-Host "  Backend:  Not Running ✗" -ForegroundColor Red
}

if ($frontendRunning) {
    Write-Host "  Frontend: http://localhost:5173 ✓" -ForegroundColor Green
} else {
    Write-Host "  Frontend: Not Running ✗" -ForegroundColor Red
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($backendRunning -and $frontendRunning) {
    Write-Host "✓ Both servers are running successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now:" -ForegroundColor White
    Write-Host "  1. Open http://localhost:5173 in your browser" -ForegroundColor Gray
    Write-Host "  2. Log in with your credentials" -ForegroundColor Gray
    Write-Host "  3. Check server logs in the opened PowerShell windows" -ForegroundColor Gray
} else {
    Write-Host "⚠ Some servers failed to start. Check the logs above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
