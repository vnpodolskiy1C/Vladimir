$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$v8 = "C:\Program Files\1cv8\8.5.1.1529\bin\1cv8.exe"
$httpd = "C:\server\Apache24\bin\httpd.exe"
$ib = "C:\Users\79115\Documents\InfoBase33"
$src = Join-Path $root "Expansion\СчетаМагазина"
$cfe = Join-Path $root "СчетаМагазина.cfe"
$build = Join-Path $root "build"
New-Item -ItemType Directory -Force -Path $build | Out-Null

& $httpd -k stop
Start-Sleep -Seconds 2

& $v8 DESIGNER /F $ib /N"Администратор" /DisableStartupDialogs /DisableStartupMessages `
  /LoadConfigFromFiles $src -Extension "СчетаМагазина" `
  /Out (Join-Path $build "load.log")
if ($LASTEXITCODE -ne 0) { throw "LoadConfigFromFiles завершился с кодом $LASTEXITCODE" }

& $v8 DESIGNER /F $ib /N"Администратор" /DisableStartupDialogs /DisableStartupMessages `
  /UpdateDBCfg -Extension "СчетаМагазина" `
  /Out (Join-Path $build "update.log")
if ($LASTEXITCODE -ne 0) { throw "UpdateDBCfg завершился с кодом $LASTEXITCODE" }

& $v8 DESIGNER /F $ib /N"Администратор" /DisableStartupDialogs /DisableStartupMessages `
  /DumpCfg $cfe -Extension "СчетаМагазина" `
  /Out (Join-Path $build "dump.log")
if ($LASTEXITCODE -ne 0) { throw "DumpCfg завершился с кодом $LASTEXITCODE" }

& $httpd -k start
Start-Sleep -Seconds 2
Write-Output "loaded $cfe"
