$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$v8 = "C:\Program Files\1cv8\8.5.1.1529\bin\1cv8.exe"
$httpd = "C:\server\Apache24\bin\httpd.exe"
$ib = "C:\Users\79115\Documents\InfoBase33"
$src = Join-Path $root "Expansion\СчетаМагазина"
$cfe = Join-Path $root "СчетаМагазина.cfe"
$build = Join-Path $root "build"
New-Item -ItemType Directory -Force -Path $build | Out-Null

function Get-V8ProcessIds {
	$ids = New-Object System.Collections.Generic.List[int]
	foreach ($name in @("1cv8", "1cv8c")) {
		foreach ($proc in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
			if ($null -ne $proc) { $ids.Add([int]$proc.Id) }
		}
	}
	return [int[]]$ids.ToArray()
}

function Test-Utf16LeText {
	param([byte[]]$Bytes)
	if ($Bytes.Length -lt 8 -or ($Bytes.Length % 2) -ne 0) { return $false }
	$sample = [Math]::Min($Bytes.Length, 200)
	if ($sample % 2 -ne 0) { $sample-- }
	$pairs = 0
	$wide = 0
	for ($i = 0; $i -lt $sample; $i += 2) {
		$pairs++
		$hi = $Bytes[$i + 1]
		if ($hi -eq 0 -or $hi -eq 4) { $wide++ }
	}
	return ($pairs -ge 4 -and $wide -ge [Math]::Ceiling($pairs * 0.8))
}

function Read-DesignerLogText {
	param([byte[]]$Bytes)
	if ($Bytes.Length -eq 0) { return "" }
	if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xFE) {
		return [Text.Encoding]::Unicode.GetString($Bytes).TrimStart([char]0xFEFF)
	}
	if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFE -and $Bytes[1] -eq 0xFF) {
		return [Text.Encoding]::BigEndianUnicode.GetString($Bytes)
	}
	if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
		$utf8Bom = New-Object System.Text.UTF8Encoding $true
		return $utf8Bom.GetString($Bytes).TrimStart([char]0xFEFF)
	}
	if (Test-Utf16LeText $Bytes) {
		return [Text.Encoding]::Unicode.GetString($Bytes).TrimStart([char]0xFEFF)
	}
	$utf8 = New-Object System.Text.UTF8Encoding $false, $true
	try {
		return $utf8.GetString($Bytes)
	} catch {
		return [Text.Encoding]::GetEncoding(1251).GetString($Bytes)
	}
}

function Test-DesignerLog {
	param([string]$Path, [string]$StepName)
	$appeared = (Get-Date).AddSeconds(5)
	while (-not (Test-Path -LiteralPath $Path)) {
		if ((Get-Date) -gt $appeared) { throw "$StepName не записал лог $Path" }
		Start-Sleep -Milliseconds 200
	}
	$bytes = $null
	for ($attempt = 0; $attempt -lt 20; $attempt++) {
		try {
			$bytes = [IO.File]::ReadAllBytes($Path)
			break
		} catch {
			Start-Sleep -Milliseconds 250
		}
	}
	if ($null -eq $bytes) { throw "$StepName : не удалось прочитать $Path" }
	$text = Read-DesignerLogText -Bytes $bytes
	if ($text -match 'Ошибка' -or $text -match 'блокиров' -or $text -match 'locked') {
		$preview = ($text -replace '\s+', ' ').Trim()
		if ($preview.Length -gt 400) { $preview = $preview.Substring(0, 400) }
		throw "$StepName : в логе ошибка или блокировка. $preview"
	}
}

function Wait-DesignerProcesses {
	param([int[]]$BeforeIds, [string]$StepName)
	# 1cv8.exe DESIGNER возвращает управление до выхода дочернего конфигуратора.
	$deadline = (Get-Date).AddMinutes(15)
	$seen = New-Object 'System.Collections.Generic.HashSet[int]'
	$quietSince = $null
	$started = Get-Date
	$spawnGrace = $started.AddSeconds(10)
	while ((Get-Date) -lt $deadline) {
		$running = @(Get-V8ProcessIds)
		foreach ($id in $running) {
			if ($BeforeIds -notcontains $id) { [void]$seen.Add([int]$id) }
		}
		$alive = 0
		foreach ($id in $running) {
			if ($seen.Contains([int]$id)) { $alive++ }
		}
		if ($seen.Count -gt 0 -and $alive -eq 0) {
			if (-not $quietSince) { $quietSince = Get-Date }
			if (((Get-Date) - $quietSince).TotalSeconds -ge 2) {
				return [pscustomobject]@{ Count = $seen.Count; Seconds = [int]((Get-Date) - $started).TotalSeconds }
			}
		} else {
			$quietSince = $null
		}
		if ($seen.Count -eq 0 -and (Get-Date) -gt $spawnGrace) {
			return [pscustomobject]@{ Count = 0; Seconds = [int]((Get-Date) - $started).TotalSeconds }
		}
		Start-Sleep -Milliseconds 300
	}
	throw "$StepName : процесс 1cv8 не завершился за 15 минут"
}

function Complete-DesignerStep {
	param([string]$StepName, [int[]]$BeforeIds, [string]$LogName, [int]$LauncherCode)
	$wait = Wait-DesignerProcesses -BeforeIds $BeforeIds -StepName $StepName
	Test-DesignerLog -Path (Join-Path $build $LogName) -StepName $StepName
	if ($wait.Count -eq 0) {
		throw "$StepName : процесс 1cv8 не появился после возврата лаунчера"
	}
	Write-Output "$StepName : launcher=$LauncherCode waited=$($wait.Seconds)s processes=$($wait.Count)"
}

& $httpd -k stop
Start-Sleep -Seconds 2

$before = @(Get-V8ProcessIds)
if (Test-Path -LiteralPath (Join-Path $build "load.log")) { Remove-Item -LiteralPath (Join-Path $build "load.log") -Force }
& $v8 DESIGNER /F $ib /N"Администратор" /DisableStartupDialogs /DisableStartupMessages `
  /LoadConfigFromFiles $src -Extension "СчетаМагазина" `
  /Out (Join-Path $build "load.log")
Complete-DesignerStep "LoadConfigFromFiles" $before "load.log" $LASTEXITCODE

$before = @(Get-V8ProcessIds)
if (Test-Path -LiteralPath (Join-Path $build "update.log")) { Remove-Item -LiteralPath (Join-Path $build "update.log") -Force }
& $v8 DESIGNER /F $ib /N"Администратор" /DisableStartupDialogs /DisableStartupMessages `
  /UpdateDBCfg -Extension "СчетаМагазина" `
  /Out (Join-Path $build "update.log")
Complete-DesignerStep "UpdateDBCfg" $before "update.log" $LASTEXITCODE

$before = @(Get-V8ProcessIds)
if (Test-Path -LiteralPath (Join-Path $build "dump.log")) { Remove-Item -LiteralPath (Join-Path $build "dump.log") -Force }
& $v8 DESIGNER /F $ib /N"Администратор" /DisableStartupDialogs /DisableStartupMessages `
  /DumpCfg $cfe -Extension "СчетаМагазина" `
  /Out (Join-Path $build "dump.log")
Complete-DesignerStep "DumpCfg" $before "dump.log" $LASTEXITCODE

& $httpd -k start
Start-Sleep -Seconds 2
Write-Output "loaded $cfe"
