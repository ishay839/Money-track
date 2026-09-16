@echo off
cd /d C:\CodexSpent
set NODE_ENV=production
"C:\Program Files\nodejs\node.exe" "C:\CodexSpent\node_modules\next\dist\bin\next" start -H 127.0.0.1 -p 3000 > "C:\CodexSpent\dev-server.log" 2>&1
echo.
echo Server stopped. See C:\CodexSpent\dev-server.log
pause
