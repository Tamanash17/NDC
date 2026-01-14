# Login Network Error - Troubleshooting Guide

## Issue
Getting a network error when trying to log in to the NDC Booking Portal.

## Root Cause
The **backend server is not running** on port 3001. The frontend is trying to connect to `http://localhost:3001/api/auth/login` but nothing is listening on that port.

---

## ✅ Solution: Start the Backend Server

### Step 1: Navigate to Backend Directory
```bash
cd "c:\Booking Engine\backend"
```

### Step 2: Install Dependencies (if not already done)
```bash
npm install
```

### Step 3: Start the Backend Server
```bash
npm run dev
```

You should see output like:
```
========================================
  NDC Booking Tool - Enterprise Backend
  Version: 3.1.0
========================================
  Environment: development
  Port: 3001
  NDC Base URL: https://ndc-api-uat.jetstar.com/ndc
  NDC Auth URL: https://ndc-api-uat.jetstar.com/jq/ndc/api
========================================
```

### Step 4: Start the Frontend (in a separate terminal)
```bash
cd "c:\Booking Engine\frontend"
npm run dev
```

---

## 🔍 Verification Steps

### 1. Check if Backend is Running
Open your browser and navigate to:
```
http://localhost:3001/api
```

You should see:
```json
{
  "name": "ndc-backend-enterprise",
  "version": "3.1.0",
  "status": "operational"
}
```

### 2. Check if Port 3001 is in Use
In PowerShell/Command Prompt:
```bash
netstat -ano | findstr :3001
```

Should show something like:
```
TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       12345
```

### 3. Test Login Endpoint Directly
Using PowerShell (with your actual credentials):
```powershell
$body = @{
    domain = "EXT"
    apiId = "YOUR_API_ID"
    password = "YOUR_PASSWORD"
    subscriptionKey = "YOUR_SUBSCRIPTION_KEY"
    environment = "UAT"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -Body $body -ContentType "application/json"
```

---

## ❌ Common Issues & Solutions

### Issue 1: Port 3001 Already in Use
**Error**: `EADDRINUSE: address already in use :::3001`

**Solution**:
```bash
# Find the process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Then start the backend again
npm run dev
```

### Issue 2: Module Not Found
**Error**: `Cannot find module 'express'` or similar

**Solution**:
```bash
cd "c:\Booking Engine\backend"
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue 3: TypeScript Compilation Errors
**Error**: Various TypeScript errors

**Solution**:
```bash
cd "c:\Booking Engine\backend"
npm run build
npm run dev
```

### Issue 4: Environment Variables Not Loaded
**Error**: `NDC_BASE_URL is undefined`

**Solution**:
Ensure `.env` file exists in `backend` directory with:
```env
NODE_ENV=development
PORT=3001
NDC_BASE_URL=https://ndc-api-uat.jetstar.com/ndc
NDC_AUTH_URL=https://ndc-api-uat.jetstar.com/jq/ndc/api
NDC_UAT_HEADER=Jetstar3.12
CORS_ORIGINS=http://localhost:5173
```

### Issue 5: CORS Error (even with backend running)
**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Solution**:
Add your frontend URL to `CORS_ORIGINS` in backend `.env`:
```env
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173
```

Then restart the backend server.

---

## 🚀 Quick Start Script

Save this as `start-both.bat` in the root `Booking Engine` folder:

```batch
@echo off
echo Starting NDC Booking Engine...

echo.
echo [1/2] Starting Backend Server...
start cmd /k "cd backend && npm run dev"

timeout /t 3 /nobreak > nul

echo.
echo [2/2] Starting Frontend Server...
start cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo.
pause
```

Then just double-click `start-both.bat` to start both servers.

---

## 🧪 Testing the Full Flow

### 1. Backend Health Check
```bash
curl http://localhost:3001/api
```

### 2. Frontend Running Check
Open browser to:
```
http://localhost:5173
```

Should show the login page.

### 3. Login Test
1. Fill in credentials:
   - **Domain**: EXT
   - **API ID**: Your API ID
   - **Password**: Your password
   - **Subscription Key**: Your Ocp-Apim-Subscription-Key
   - **Environment**: UAT

2. Click "Sign In"

3. If successful, you'll be redirected to the dashboard

### 4. Check Browser Console
Press `F12` to open DevTools, go to Console tab:
- ✅ Should see: Successful API calls
- ❌ Should NOT see: "Network Error" or "ERR_CONNECTION_REFUSED"

### 5. Check Backend Logs
Look at the terminal running the backend:
```
[Auth] Authenticating: EXT\YOUR_API_ID
[Auth] URL: https://ndc-api-uat.jetstar.com/jq/ndc/api/Selling/r3.x/Auth
[Auth] Success - Token expires in 1800s
```

---

## 📝 Configuration Files Reference

### Frontend: `frontend\.env`
```env
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=NDC Booking Tool
```

### Backend: `backend\.env`
```env
NODE_ENV=development
PORT=3001
NDC_BASE_URL=https://ndc-api-uat.jetstar.com/ndc
NDC_AUTH_URL=https://ndc-api-uat.jetstar.com/jq/ndc/api
NDC_UAT_HEADER=Jetstar3.12
CORS_ORIGINS=http://localhost:5173
```

---

## 🔧 Advanced Debugging

### Enable Detailed Backend Logging
In `backend\.env`:
```env
LOG_LEVEL=debug
PRETTY_LOGS=true
ENABLE_REQUEST_LOGGING=true
```

### Check Network Request in Browser
1. Open DevTools (`F12`)
2. Go to Network tab
3. Try logging in
4. Look for the request to `/api/auth/login`
5. Check:
   - **Status**: Should be `200 OK`
   - **Response**: Should contain `token` and `expires_in`
   - **Headers**: Check `Authorization`, `Ocp-Apim-Subscription-Key`

### Backend Not Accessible?
Test if the backend is reachable:
```bash
# PowerShell
Test-NetConnection -ComputerName localhost -Port 3001

# Or curl
curl http://localhost:3001/api
```

---

## 📞 Still Having Issues?

1. **Check firewall**: Ensure Windows Firewall isn't blocking port 3001
2. **Check antivirus**: Some antivirus software blocks local servers
3. **Try different port**: Change `PORT=3002` in backend `.env`
4. **Check Node version**: Ensure Node.js v18+ is installed: `node --version`
5. **Clear browser cache**: Hard refresh with `Ctrl + Shift + R`

---

## ✅ Success Checklist

- [ ] Backend server running on http://localhost:3001
- [ ] Frontend server running on http://localhost:5173
- [ ] `/api` endpoint returns JSON response
- [ ] No CORS errors in browser console
- [ ] Login page loads without errors
- [ ] Network tab shows request to `/api/auth/login`
- [ ] Backend logs show authentication attempt

---

**Once both servers are running, try logging in again. The network error should be resolved!**
