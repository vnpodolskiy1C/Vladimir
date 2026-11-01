$ErrorActionPreference = "Stop"
Set-Location -LiteralPath "D:\II\HTTP Demo BSP"

function Read-JsonFile($path) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $bytes = [IO.File]::ReadAllBytes($path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "В ответе есть BOM: $path"
  }
  return $utf8.GetString($bytes) | ConvertFrom-Json
}

function Import-DotEnv($path) {
  Get-Content $path -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $pair = $_.Split('=', 2)
    Set-Item -Path "env:$($pair[0].Trim())" -Value $pair[1].Trim()
  }
}

function Invoke-Objects {
  param(
    [string]$Method = "GET",
    [string]$Path,
    [hashtable]$Query,
    [string]$OutFile
  )
  $args = @("-sS", "-o", $OutFile, "-w", "%{http_code}", "-D", "$OutFile.hdr", "-H", "Authorization: $env:OBJECTS_AUTH", "-X", $Method)
  if ($Query) {
    $args += "-G"
    foreach ($key in $Query.Keys) {
      $args += "--data-urlencode"
      $args += "$key=$($Query[$key])"
    }
  }
  $args += "$env:OBJECTS_URL$Path"
  $code = & curl.exe @args
  return [int]$code
}

function Fail($msg) {
  $script:fails += $msg
  Write-Output "FAIL: $msg"
}

function Pass($msg) {
  Write-Output "PASS: $msg"
}

function Get-ErrorCode($path) {
  $j = Read-JsonFile $path
  return $j.error.code
}

function HeaderNames($obj) {
  return @($obj.header.PSObject.Properties.Name)
}

Import-DotEnv ".\.env"
$script:fails = @()
New-Item -ItemType Directory -Force -Path .\build | Out-Null

# --- GET /type for partner schema (unwritable fields) ---
$code = Invoke-Objects -Path "/type" -Query @{ name = "Справочник._ДемоПартнеры" } -OutFile ".\build\type-partner.json"
$schema = Read-JsonFile ".\build\type-partner.json"
if ($code -ne 200) { Fail "GET /type partner status $code" } else { Pass "GET /type partner 200" }
$unwritable = @()
foreach ($f in $schema.fields) {
  if (-not $f.writable) { $unwritable += $f.name }
}
Write-Output ("unwritable fields: " + ($unwritable -join ", "))

# --- GET /object partner ---
$code = Invoke-Objects -Path "/object" -Query @{ type = "Справочник._ДемоПартнеры"; id = $env:PARTNER_ID } -OutFile ".\build\object-partner.json"
Write-Output "GET /object partner status=$code"
$hdr = Get-Content ".\build\object-partner.json.hdr" -Raw
Write-Output $hdr
if ($code -ne 200) {
  Fail "GET /object partner expected 200 got $code"
  Get-Content ".\build\object-partner.json" -Encoding UTF8
} else {
  $obj = Read-JsonFile ".\build\object-partner.json"
  if ($obj.type -ne "Справочник._ДемоПартнеры") { Fail "type=$($obj.type)" } else { Pass "type" }
  if ($obj.id -ne $env:PARTNER_ID) { Fail "id=$($obj.id) expected $($env:PARTNER_ID)" } else { Pass "id" }
  $name = $obj.header.Наименование
  if ([string]::IsNullOrEmpty($name)) { Fail "header.Наименование empty" } else { Pass "Наименование=$name" }
  if ($obj.header.ЭтоГруппа -ne $false) { Fail "ЭтоГруппа=$($obj.header.ЭтоГруппа)" } else { Pass "ЭтоГруппа=false" }
  if ($obj.header.Ссылка -ne $obj.id) { Fail "Ссылка=$($obj.header.Ссылка) id=$($obj.id)" } else { Pass "Ссылка=id" }
  $vp = $obj.header.ВидПартнера
  if ($null -eq $vp -or $vp -is [string]) { Pass "ВидПартнера=$vp" } else { Fail "ВидПартнера unexpected $($vp.GetType().Name)=$vp" }
  $t1 = $obj.tables.ДополнительныеРеквизиты
  $t2 = $obj.tables.КонтактнаяИнформация
  if ($t1 -isnot [System.Array] -and $null -ne $t1) {
    # ConvertFrom-Json may yield a single object instead of array if one element
    if ($t1 -is [System.Management.Automation.PSCustomObject]) { Pass "ДополнительныеРеквизиты is object/array-like" }
    else { Fail "ДополнительныеРеквизиты type $($t1.GetType().FullName)" }
  } else { Pass "ДополнительныеРеквизиты is array count=$(@($t1).Count)" }
  if ($null -eq $t2) { Fail "КонтактнаяИнформация missing" }
  else { Pass "КонтактнаяИнформация present count=$(@($t2).Count)" }
  $hn = HeaderNames $obj
  foreach ($u in $unwritable) {
    if ($hn -notcontains $u) { Fail "header missing unwritable field $u" }
    else { Pass "header has unwritable $u" }
  }
  Write-Output ("header fields: " + ($hn -join ", "))
  Write-Output ("tables: " + (@($obj.tables.PSObject.Properties.Name) -join ", "))
  Write-Output ("Родитель=$($obj.header.Родитель)")
}

# --- rejects ---
$code = Invoke-Objects -Path "/object" -Query @{ type = "Справочник._ДемоПартнеры"; id = "не-uuid" } -OutFile ".\build\object-bad-uuid.json"
$ec = Get-ErrorCode ".\build\object-bad-uuid.json"
if ($code -ne 400 -or $ec -ne "invalid_request") { Fail "bad uuid status=$code code=$ec" } else { Pass "не-uuid 400 invalid_request" }

$code = Invoke-Objects -Path "/object" -Query @{ type = "Справочник._ДемоПартнеры"; id = "9203492B-EA3E-11DE-8634-001D600D9AD2" } -OutFile ".\build\object-upper-uuid.json"
$ec = Get-ErrorCode ".\build\object-upper-uuid.json"
if ($code -ne 400 -or $ec -ne "invalid_request") { Fail "upper uuid status=$code code=$ec" } else { Pass "upper UUID 400 invalid_request" }

$code = Invoke-Objects -Path "/object" -Query @{ type = "Справочник._ДемоПартнеры"; id = "00000000-0000-0000-0000-000000000000" } -OutFile ".\build\object-zero-uuid.json"
$ec = Get-ErrorCode ".\build\object-zero-uuid.json"
if ($code -ne 404 -or $ec -ne "not_found") { Fail "zero uuid status=$code code=$ec" } else { Pass "zero UUID 404 not_found" }

$code = Invoke-Objects -Path "/object" -Query @{ type = "РегистрСведений.КурсыВалют"; id = "00000000-0000-0000-0000-000000000000" } -OutFile ".\build\object-unsupported.json"
$ec = Get-ErrorCode ".\build\object-unsupported.json"
if ($code -ne 400 -or $ec -ne "unsupported_type") { Fail "unsupported status=$code code=$ec" } else { Pass "register 400 unsupported_type" }

# --- attached files / unsupported storage ---
$code = Invoke-Objects -Path "/search" -Query @{ type = "Справочник._ДемоНоменклатураПрисоединенныеФайлы"; q = "а" } -OutFile ".\build\files.json"
Write-Output "search attached files status=$code"
$files = Read-JsonFile ".\build\files.json"
Write-Output ("files items=$($files.items.Count) hasMore=$($files.hasMore)")
if ($files.items.Count -gt 0) {
  $fid = $files.items[0].id
  Write-Output "first file id=$fid name=$($files.items[0].name)"
  $code = Invoke-Objects -Path "/object" -Query @{ type = "Справочник._ДемоНоменклатураПрисоединенныеФайлы"; id = $fid } -OutFile ".\build\object-file.json"
  if ($code -ne 200) { Fail "read file object status=$code" }
  else {
    $fo = Read-JsonFile ".\build\object-file.json"
    if ($null -ne $fo.header.ФайлХранилище) { Fail "ФайлХранилище=$($fo.header.ФайлХранилище)" } else { Pass "ФайлХранилище=null" }
  }
} else {
  Write-Output "NOTE: no attached files in demo; skip live ФайлХранилище read"
}

# --- stage 1-3 repeats ---
$code = Invoke-Objects -Path "/types" -Query @{ q = "партнер" } -OutFile ".\build\types-partner.json"
$types = Read-JsonFile ".\build\types-partner.json"
$names = @($types.items | ForEach-Object { $_.name })
if ($code -ne 200 -or $names -notcontains "Справочник._ДемоПартнеры") { Fail "GET /types partner status=$code" } else { Pass "GET /types 200 includes partner" }

$code = Invoke-Objects -Path "/types" -Query @{ q = "" } -OutFile ".\build\types-empty.json"
$ec = Get-ErrorCode ".\build\types-empty.json"
if ($code -ne 400 -or $ec -ne "invalid_request") { Fail "types empty q status=$code code=$ec" } else { Pass "GET /types empty q 400" }

$code = Invoke-Objects -Path "/search" -Query @{ type = "Справочник._ДемоПартнеры"; q = "Альфа" } -OutFile ".\build\search-alpha.json"
$sa = Read-JsonFile ".\build\search-alpha.json"
if ($code -ne 200 -or $sa.items.Count -ne 1) { Fail "search alpha status=$code count=$($sa.items.Count)" } else { Pass "GET /search Альфа 200 count=1" }

$code = Invoke-Objects -Path "/search" -Query @{ type = "Документ._ДемоСчетНаОплатуПокупателю"; q = "0" } -OutFile ".\build\search-doc.json"
$sd = Read-JsonFile ".\build\search-doc.json"
if ($code -ne 200) { Fail "search doc status=$code" } else { Pass "GET /search document 200 count=$($sd.items.Count)" }

$code = Invoke-Objects -Path "/search" -Query @{ type = "Справочник._ДемоНоменклатура"; q = "а" } -OutFile ".\build\search-nom.json"
$sn = Read-JsonFile ".\build\search-nom.json"
if ($code -ne 200 -or $sn.items.Count -ne 20 -or $sn.hasMore -ne $true) { Fail "search nom status=$code count=$($sn.items.Count) hasMore=$($sn.hasMore)" } else { Pass "GET /search nomenclature 200 page cap" }

$code = Invoke-Objects -Path "/search" -Query @{ type = "Справочник._ДемоПартнеры"; q = "" } -OutFile ".\build\search-empty.json"
$ec = Get-ErrorCode ".\build\search-empty.json"
if ($code -ne 400 -or $ec -ne "invalid_request") { Fail "search empty q status=$code code=$ec" } else { Pass "GET /search empty q 400" }

$code = Invoke-Objects -Method "POST" -Path "/object" -OutFile ".\build\post-object.json"
$ec = Get-ErrorCode ".\build\post-object.json"
if ($code -ne 501 -or $ec -ne "not_implemented") { Fail "POST /object status=$code code=$ec" } else { Pass "POST /object 501 not_implemented" }

Write-Output "==== SUMMARY ===="
Write-Output ("FAILS=" + $script:fails.Count)
$script:fails | ForEach-Object { Write-Output $_ }
if ($script:fails.Count -eq 0) { Write-Output "ALL PASS" }
