param(
  [switch]$NoBrowser,
  [switch]$AutoShutdown,
  [switch]$ProbeOnly,
  [switch]$ReuseExisting,
  [switch]$StopExistingOnly,
  [string]$Mode = ""
)

# 这个脚本负责一键启动本地工作台：
# 1. 默认先关闭当前项目的旧后端实例，避免反复双击后留下多个 Node 服务。
# 2. 只关闭能确认属于本项目的进程，不能粗暴结束所有 node.exe。
# 3. 优先使用后端写入的运行清单和本地令牌做优雅关闭，旧版本残留再按本机监听端口与命令行兜底。
# 4. 如果没有旧实例，则在 5177-5185 之间选择空闲端口并启动服务。
# 5. 默认不根据浏览器标签页自动关闭，避免后台标签页被暂停时误关服务。

$ErrorActionPreference = "Stop"

# 根据脚本所在目录定位项目根目录，避免用户从其他目录双击时路径错乱。
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ServerEntryCandidate = Join-Path $Root "server\index.js"
$PortCandidates = 5177..5185
$RuntimeDir = Join-Path $Root "data\runtime"
$RuntimeFile = Join-Path $RuntimeDir "workbench-server.json"

function Write-Info {
  param([string]$Message)
  Write-Host "[工作台] $Message"
}

function ConvertTo-CanonicalPath {
  param([string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return ""
  }
  try {
    return ([System.IO.Path]::GetFullPath($PathValue).TrimEnd("\", "/")).ToLowerInvariant()
  } catch {
    return ($PathValue.TrimEnd("\", "/")).ToLowerInvariant()
  }
}

function Test-ProcessAlive {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return $false
  }
  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    return $null -ne $process
  } catch {
    return $false
  }
}

function Get-CimProcessById {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return $null
  }
  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  } catch {
    return $null
  }
}

function Test-WorkbenchStateShape {
  param([object]$Response)
  if ($null -eq $Response -or -not $Response.ok -or $null -eq $Response.state) {
    return $false
  }
  # 这里检查的是本项目状态对象的基本形状，用来避免误杀其它刚好也有 /api/state 的服务。
  return $null -ne $Response.state.version `
    -and $null -ne $Response.state.providers `
    -and $null -ne $Response.state.novels `
    -and $null -ne $Response.state.backgroundSettings
}

function Get-WorkbenchLauncherInfoOnPort {
  param([int]$Port)
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/launcher-info" -Method Get -TimeoutSec 1
  } catch {
    return $null
  }
}

function Test-WorkbenchLauncherInfoShape {
  param([object]$Response)
  if ($null -eq $Response -or -not $Response.ok) {
    return $false
  }
  $currentRoot = ConvertTo-CanonicalPath $Root
  $responseRoot = ConvertTo-CanonicalPath ([string]$Response.rootDir)
  $responsePid = 0
  if ($null -ne $Response.pid) {
    $responsePid = [int]$Response.pid
  }
  return $responseRoot -and $responseRoot -eq $currentRoot -and $responsePid -gt 0
}

function Get-WorkbenchStateOnPort {
  param([int]$Port)
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/state" -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-WorkbenchAlive {
  param([int]$Port)
  $launcherInfo = Get-WorkbenchLauncherInfoOnPort -Port $Port
  if (Test-WorkbenchLauncherInfoShape $launcherInfo) {
    return $true
  }
  return (Test-WorkbenchStateShape (Get-WorkbenchStateOnPort -Port $Port))
}

function Test-ProcessLooksLikeThisProject {
  param([object]$ProcessInfo)
  if ($null -eq $ProcessInfo) {
    return $false
  }

  $commandLine = [string]$ProcessInfo.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return $false
  }

  $canonicalRoot = ConvertTo-CanonicalPath $Root
  $canonicalServerEntry = ConvertTo-CanonicalPath $ServerEntry
  $lowerCommandLine = $commandLine.ToLowerInvariant()

  # 新版启动器会用绝对 server/index.js 启动，命令行中能直接确认项目归属。
  if ($lowerCommandLine.Contains($canonicalServerEntry.Replace("\", "\\")) -or $lowerCommandLine.Contains($canonicalServerEntry)) {
    return $true
  }

  # 兼容 PowerShell / Node 对路径分隔符的不同展示。
  $serverEntrySlash = $canonicalServerEntry.Replace("\", "/")
  if ($lowerCommandLine.Contains($serverEntrySlash)) {
    return $true
  }

  # 旧版启动器只留下相对路径 server/index.js；如果命令行同时带有项目根目录，也视为本项目。
  if (($lowerCommandLine -match "server[\\/]+index\.js") -and $lowerCommandLine.Contains($canonicalRoot)) {
    return $true
  }

  return $false
}

function Add-WorkbenchCandidate {
  param(
    [hashtable]$Map,
    [int]$ProcessId,
    [string]$Source,
    [int]$Port = 0,
    [string]$Token = ""
  )

  if ($ProcessId -le 0 -or -not (Test-ProcessAlive -ProcessId $ProcessId)) {
    return
  }

  $processInfo = Get-CimProcessById -ProcessId $ProcessId
  if ($null -eq $processInfo) {
    return
  }

  $looksLikeProject = Test-ProcessLooksLikeThisProject -ProcessInfo $processInfo
  $looksLikeHttpWorkbench = $false
  if ($Port -gt 0) {
    $looksLikeHttpWorkbench = Test-WorkbenchAlive -Port $Port
  }

  if (-not $looksLikeProject -and -not $looksLikeHttpWorkbench) {
    return
  }

  $key = [string]$ProcessId
  if ($Map.ContainsKey($key)) {
    $existing = $Map[$key]
    if ($Port -gt 0 -and -not $existing.port) {
      $existing.port = $Port
    }
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
      $existing.token = $Token
    }
    $existing.sources = @($existing.sources + $Source | Select-Object -Unique)
    return
  }

  $Map[$key] = [ordered]@{
    pid = $ProcessId
    port = if ($Port -gt 0) { $Port } else { $null }
    token = $Token
    sources = @($Source)
    commandLine = [string]$processInfo.CommandLine
  }
}

function Add-RuntimeManifestCandidate {
  param([hashtable]$Map)
  if (-not (Test-Path -LiteralPath $RuntimeFile)) {
    return
  }

  try {
    $manifest = Get-Content -LiteralPath $RuntimeFile -Raw | ConvertFrom-Json
  } catch {
    Write-Info "运行清单无法读取，稍后会按端口兜底：$($_.Exception.Message)"
    return
  }

  $manifestRoot = ConvertTo-CanonicalPath ([string]$manifest.rootDir)
  $currentRoot = ConvertTo-CanonicalPath $Root
  if ($manifestRoot -and $manifestRoot -ne $currentRoot) {
    return
  }

  $processIdValue = 0
  if ($null -ne $manifest.pid) {
    $processIdValue = [int]$manifest.pid
  }
  $port = 0
  if ($null -ne $manifest.port) {
    $port = [int]$manifest.port
  }
  $token = [string]$manifest.launcherToken
  Add-WorkbenchCandidate -Map $Map -ProcessId $processIdValue -Source "运行清单" -Port $port -Token $token
}

function Get-LocalNodeListeningPorts {
  try {
    $nodeProcessIds = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop | ForEach-Object { [int]$_.ProcessId })
  } catch {
    Write-Info "读取 Node 进程失败，跳过监听端口扫描：$($_.Exception.Message)"
    return @()
  }

  if ($nodeProcessIds.Count -eq 0) {
    return @()
  }

  try {
    return @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
      $nodeProcessIds -contains [int]$_.OwningProcess `
        -and ($_.LocalAddress -eq "127.0.0.1" -or $_.LocalAddress -eq "0.0.0.0" -or $_.LocalAddress -eq "::1" -or $_.LocalAddress -eq "::")
    })
  } catch {
    Write-Info "读取监听端口失败，跳过监听端口扫描：$($_.Exception.Message)"
    return @()
  }
}

function Add-PortListenerCandidates {
  param([hashtable]$Map)
  $listeners = @(Get-LocalNodeListeningPorts)

  foreach ($listener in $listeners) {
    $port = [int]$listener.LocalPort
    $processIdValue = [int]$listener.OwningProcess
    # 不再只扫 5177-5185。旧版反复启动时可能落在 5588、5599 等历史端口；
    # 是否属于当前项目由 /api/launcher-info 的 rootDir 和命令行共同确认，避免误杀其它 Node 服务。
    Add-WorkbenchCandidate -Map $Map -ProcessId $processIdValue -Source "监听端口 $port" -Port $port
  }
}

function Add-CommandLineCandidates {
  param([hashtable]$Map)
  try {
    $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop
  } catch {
    Write-Info "读取 Node 进程失败，跳过命令行兜底：$($_.Exception.Message)"
    return
  }

  foreach ($processInfo in $nodeProcesses) {
    if (Test-ProcessLooksLikeThisProject -ProcessInfo $processInfo) {
      Add-WorkbenchCandidate -Map $Map -ProcessId ([int]$processInfo.ProcessId) -Source "命令行"
    }
  }
}

function Get-ExistingWorkbenchCandidates {
  $map = @{}
  Add-RuntimeManifestCandidate -Map $map
  Add-PortListenerCandidates -Map $map
  Add-CommandLineCandidates -Map $map
  return @($map.Values | Sort-Object { $_.port }, { $_.pid })
}

function Wait-ProcessExit {
  param(
    [int]$ProcessId,
    [int]$TimeoutMs = 5000
  )

  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-ProcessAlive -ProcessId $ProcessId)) {
      return $true
    }
    Start-Sleep -Milliseconds 200
  }
  return -not (Test-ProcessAlive -ProcessId $ProcessId)
}

function Invoke-LauncherShutdown {
  param([object]$Candidate)
  if ($null -eq $Candidate.port -or [string]::IsNullOrWhiteSpace([string]$Candidate.token)) {
    return $false
  }

  try {
    Invoke-RestMethod `
      -Uri "http://127.0.0.1:$($Candidate.port)/api/launcher/shutdown" `
      -Method Post `
      -Headers @{ "x-roleplay-launcher-token" = [string]$Candidate.token } `
      -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Stop-WorkbenchCandidate {
  param([object]$Candidate)

  $processIdValue = [int]$Candidate.pid
  if ($processIdValue -le 0 -or -not (Test-ProcessAlive -ProcessId $processIdValue)) {
    return
  }

  $sourceText = ($Candidate.sources -join "、")
  $portText = if ($Candidate.port) { "，端口 $($Candidate.port)" } else { "" }
  Write-Info "关闭旧后端 PID $processIdValue$portText（来源：$sourceText）"

  # 新版后端支持带令牌的本地关闭入口，优先让它自己收尾运行清单。
  if (Invoke-LauncherShutdown -Candidate $Candidate) {
    if (Wait-ProcessExit -ProcessId $processIdValue -TimeoutMs 7000) {
      return
    }
    Write-Info "旧后端没有及时退出，改用进程树关闭。"
  }

  # 先不用 /F，让 Windows 尽量正常结束进程树；失败或超时后再强制。
  try {
    $null = & taskkill.exe /PID $processIdValue /T 2>$null
  } catch {
    Write-Info "普通关闭失败，准备强制关闭：$($_.Exception.Message)"
  }
  if (Wait-ProcessExit -ProcessId $processIdValue -TimeoutMs 3000) {
    return
  }

  $null = & taskkill.exe /PID $processIdValue /T /F 2>$null
  if (-not (Wait-ProcessExit -ProcessId $processIdValue -TimeoutMs 3000)) {
    throw "旧后端 PID $processIdValue 无法关闭，请手动结束该进程后重试。"
  }
}

function Stop-ExistingWorkbench {
  $candidates = @(Get-ExistingWorkbenchCandidates)
  if ($candidates.Count -eq 0) {
    Write-Info "没有检测到当前项目的旧后端实例。"
    return
  }

  if ($ProbeOnly) {
    Write-Info "将会关闭以下当前项目旧实例："
    foreach ($candidate in $candidates) {
      $portText = if ($candidate.port) { " 端口=$($candidate.port)" } else { "" }
      Write-Info "PID=$($candidate.pid)$portText 来源=$($candidate.sources -join '、')"
    }
    return
  }

  foreach ($candidate in $candidates) {
    Stop-WorkbenchCandidate -Candidate $candidate
  }

  # 被强制关闭的旧版本来不及删除运行清单，这里只清掉本项目启动清单。
  if (Test-Path -LiteralPath $RuntimeFile) {
    Remove-Item -LiteralPath $RuntimeFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-ListeningCandidatePorts {
  $candidateMap = @{}
  foreach ($port in $PortCandidates) {
    $candidateMap[[int]$port] = $true
  }

  try {
    $ports = [System.Collections.Generic.HashSet[int]]::new()
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    foreach ($listener in $listeners) {
      $port = [int]$listener.Port
      if ($candidateMap.ContainsKey($port)) {
        [void]$ports.Add($port)
      }
    }
    return @($ports) | Sort-Object
  } catch {
    Write-Info "读取监听端口表失败，改用兼容探测：$($_.Exception.Message)"
    return $PortCandidates
  }
}

function Test-PortFree {
  param([int]$Port)
  $listener = $null
  try {
    $address = [System.Net.IPAddress]::Parse("127.0.0.1")
    $listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $listener) {
      $listener.Stop()
    }
  }
}

function Open-Workbench {
  param([string]$Url)
  if (-not $NoBrowser) {
    Start-Process $Url
  }
}

# Node 是当前项目的唯一运行依赖；缺少 Node 时直接给出明确错误。
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "未找到 Node.js。请先安装 Node.js 20 或更新版本，再重新运行一键启动。"
}

if (-not (Test-Path -LiteralPath $ServerEntryCandidate)) {
  throw "没有找到后端入口：$ServerEntryCandidate"
}
$ServerEntry = (Resolve-Path $ServerEntryCandidate).Path

if ($ReuseExisting) {
  foreach ($port in (Get-ListeningCandidatePorts)) {
    if (Test-WorkbenchAlive -Port $port) {
      $url = "http://127.0.0.1:$port"
      if ($ProbeOnly) {
        Write-Info "检测到可复用的工作台服务：$url"
        Write-Info "探测完成，没有打开浏览器，也没有启动新服务。"
        exit 0
      }
      Write-Info "检测到工作台已经运行，按 -ReuseExisting 复用：$url"
      Open-Workbench -Url $url
      exit 0
    }
  }
  Write-Info "没有可复用的旧服务，继续启动新的工作台。"
} else {
  Stop-ExistingWorkbench
}

if ($ProbeOnly) {
  Write-Info "探测完成，没有真正启动服务。"
  exit 0
}

if ($StopExistingOnly) {
  Write-Info "旧实例清理完成，按 -StopExistingOnly 不启动新服务。"
  exit 0
}

$selectedPort = $null
foreach ($port in $PortCandidates) {
  if (Test-PortFree -Port $port) {
    $selectedPort = $port
    break
  }
}

if ($null -eq $selectedPort) {
  throw "5177-5185 端口都不可用，请关闭占用这些端口的程序后重试。"
}

if (-not (Test-Path -LiteralPath $RuntimeDir)) {
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}

$launcherToken = [Guid]::NewGuid().ToString("N")
$env:HOST = "127.0.0.1"
$env:PORT = [string]$selectedPort
$env:AUTO_SHUTDOWN = if ($AutoShutdown) { "1" } else { "0" }
$env:OPEN_BROWSER = if ($NoBrowser) { "0" } else { "1" }
$env:ROLEPLAY_LAUNCHER_TOKEN = $launcherToken
$env:ROLEPLAY_LAUNCHER_ROOT = $Root
$env:ROLEPLAY_LAUNCHER_INSTANCE_ID = [Guid]::NewGuid().ToString("N")
$url = "http://127.0.0.1:$selectedPort"

Write-Info "项目目录：$Root"
Write-Info "启动地址：$url"
if ($AutoShutdown) {
  Write-Info "已启用标签页心跳自动关闭；关闭所有工作台浏览器标签页后，后端会在宽限期后退出。"
} else {
  Write-Info "后端会保持运行；关闭此窗口或按 Ctrl+C 才会停止服务。"
}

	# 前台运行 Node 服务，方便用户看到日志，也方便用 Ctrl+C 结束。
# 使用绝对入口路径启动，后续启动器才能准确识别”这就是当前项目的旧实例”。
# 加上 --expose-gc 是为了本地长时间使用时能在清理大缓存后主动回收 V8 堆，避免误以为会话对象一直叠加。
Push-Location $Root
try {
  $env:MODE = $Mode
  & node --expose-gc $ServerEntry
} finally {
  Pop-Location
  Remove-Item Env:\ROLEPLAY_LAUNCHER_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:\ROLEPLAY_LAUNCHER_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:\ROLEPLAY_LAUNCHER_INSTANCE_ID -ErrorAction SilentlyContinue
}
