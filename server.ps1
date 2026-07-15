$ErrorActionPreference = "Stop"

$root = Join-Path $PSScriptRoot "docs"
$port = 8787
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()

Write-Host "Investment simulator running at http://localhost:$port/"
Write-Host "Press Ctrl+C to stop."

function Send-Text {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$Text,
        [string]$ContentType = "text/plain; charset=utf-8",
        [int]$StatusCode = 200
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Get-ContentType {
    param([string]$Path)
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html; charset=utf-8" }
        ".css" { "text/css; charset=utf-8" }
        ".js" { "application/javascript; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".svg" { "image/svg+xml" }
        default { "application/octet-stream" }
    }
}

while ($listener.IsListening) {
    $context = $null
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $path = [uri]::UnescapeDataString($request.Url.AbsolutePath)

        if ($path -eq "/api/chart") {
            $symbol = $request.QueryString["symbol"]
            $range = $request.QueryString["range"]
            $interval = $request.QueryString["interval"]
            if ([string]::IsNullOrWhiteSpace($symbol)) { $symbol = "QQQ" }
            if ([string]::IsNullOrWhiteSpace($range)) { $range = "1mo" }
            if ([string]::IsNullOrWhiteSpace($interval)) { $interval = "1d" }

            $safeSymbol = [uri]::EscapeDataString($symbol)
            $safeRange = [uri]::EscapeDataString($range)
            $safeInterval = [uri]::EscapeDataString($interval)
            $url = "https://query1.finance.yahoo.com/v8/finance/chart/$safeSymbol`?range=$safeRange&interval=$safeInterval"

            try {
                $json = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0" } -TimeoutSec 12 | ConvertTo-Json -Depth 20
                Send-Text -Response $response -Text $json -ContentType "application/json; charset=utf-8"
            }
            catch {
                Send-Text -Response $response -Text (@{ error = $_.Exception.Message; symbol = $symbol } | ConvertTo-Json) -ContentType "application/json; charset=utf-8" -StatusCode 502
            }
            continue
        }

        if ($path -eq "/") { $path = "/index.html" }
        $relative = $path.TrimStart("/")
        $file = Join-Path $root $relative
        $resolvedRoot = [System.IO.Path]::GetFullPath($root)
        $resolvedFile = [System.IO.Path]::GetFullPath($file)

        if (-not $resolvedFile.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $resolvedFile -PathType Leaf)) {
            Send-Text -Response $response -Text "Not found" -StatusCode 404
            continue
        }

        $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
        $response.StatusCode = 200
        $response.ContentType = Get-ContentType -Path $resolvedFile
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.OutputStream.Close()
    }
    catch {
        if ($null -ne $context) {
            try {
                Send-Text -Response $context.Response -Text "Server error: $($_.Exception.Message)" -StatusCode 500
            }
            catch {}
        }
        if ($listener.IsListening) {
            Write-Warning $_.Exception.Message
        }
    }
}
