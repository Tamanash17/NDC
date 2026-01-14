@echo off
echo ========================================
echo   NDC Booking Engine Startup
echo ========================================
echo.

echo [1/2] Starting Backend Server on port 3001...
start "Backend Server" cmd /k "cd /d "%~dp0backend" && npm run dev"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak > nul

echo.
echo [2/2] Starting Frontend Server on port 5173...
start "Frontend Server" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================
echo   Servers Starting...
echo ========================================
echo   Backend:  http://localhost:3001/api
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to exit this window...
echo (Servers will continue running in separate windows)
pause > nul
