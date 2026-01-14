@echo off
echo ========================================
echo   Restarting NDC Booking Engine
echo ========================================
echo.

echo [1/3] Stopping existing servers...
taskkill /F /FI "WINDOWTITLE eq *Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *Frontend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *npm*" >nul 2>&1
echo   Done.
echo.

echo [2/3] Starting Backend Server (port 3001)...
start "NDC Backend Server" cmd /k "cd /d "%~dp0backend" && echo Starting Backend... && npm run dev"
echo   Backend window opened.
timeout /t 8 /nobreak >nul
echo.

echo [3/3] Starting Frontend Server (port 5173)...
start "NDC Frontend Server" cmd /k "cd /d "%~dp0frontend" && echo Starting Frontend... && npm run dev"
echo   Frontend window opened.
echo.

echo ========================================
echo   Servers Starting...
echo ========================================
echo.
echo   Backend:  http://localhost:3001/api
echo   Frontend: http://localhost:5173
echo.
echo   Check the server windows for logs.
echo   Wait 10-15 seconds for full startup.
echo.
echo ========================================
pause
