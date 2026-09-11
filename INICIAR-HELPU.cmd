@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22.13 ou posterior e tente novamente.
  pause
  exit /b 1
)
node --input-type=module -e "import {checkNode} from './scripts/runtime.mjs'; try {checkNode()} catch(e) {console.error(e.message); process.exitCode=1}"
if errorlevel 1 (
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Npm nao encontrado. Reinstale o Node.js com npm e abra novamente esta janela.
  pause
  exit /b 1
)
echo.
echo Helpu - Marketing em movimento
echo Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.
echo.
node --input-type=module -e "import {checkDependencies} from './scripts/runtime.mjs'; try {checkDependencies()} catch {process.exitCode=1}"
if errorlevel 1 (
  echo Instalando as dependencias da Helpu...
  call npm ci --ignore-scripts
  if errorlevel 1 (
    echo Nao foi possivel instalar. Confira a conexao e tente novamente.
    pause
    exit /b 1
  )
)
node scripts/start.mjs --open
if errorlevel 1 (
  pause
  exit /b 1
)
