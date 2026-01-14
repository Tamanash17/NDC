Set-Location "c:\Booking Engine"
Remove-Item -Recurse -Force deploy_backend -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path deploy_backend
Copy-Item -Recurse -Force backend\src deploy_backend\
Copy-Item -Force backend\package.json deploy_backend\
Copy-Item -Force backend\tsconfig.json deploy_backend\
