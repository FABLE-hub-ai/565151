@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the current LTS version from https://nodejs.org/
  pause
  exit /b 1
)
:install
if not exist "node_modules\express\package.json" goto install-packages
if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" goto install-packages
if not exist "node_modules\sqlite3\build\Release\node_sqlite3.node" goto install-packages
goto start-server

:install-packages
(
  echo Installing the website's required packages...
  call npm.cmd install
  if errorlevel 1 (
    echo Package installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  call npm.cmd install-scripts --help >nul 2>nul
  if not errorlevel 1 (
    echo Preparing the SQLite database drivers for this version of npm...
    call npm.cmd install-scripts approve better-sqlite3 sqlite3
    if errorlevel 1 (
      echo Could not approve the required SQLite drivers.
      pause
      exit /b 1
    )
    call npm.cmd rebuild better-sqlite3 sqlite3 --no-audit --no-fund
    if errorlevel 1 (
      echo The SQLite drivers could not be built. Install the latest Node.js LTS and try again.
      pause
      exit /b 1
    )
  )
)

:start-server
echo.
echo The site is available at http://127.0.0.1:3000
echo Keep this window open while you use the site.
echo.
call npm.cmd start
pause
