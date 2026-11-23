param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'restored'))
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($partName in $manifest.database.parts) {
    $part = Join-Path $PSScriptRoot $partName
    $expected = $manifest.files | Where-Object { $_.path -eq $partName }
    if (-not $expected -or -not (Test-Path -LiteralPath $part -PathType Leaf)) { throw ('Missing part: ' + $partName) }
    if ((Get-Item -LiteralPath $part).Length -ne $expected.bytes) { throw ('Incorrect size; run git lfs pull: ' + $partName) }
    if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash -ne $expected.sha256) { throw ('Checksum mismatch: ' + $partName) }
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output = Join-Path $OutputDirectory $manifest.database.filename
if (Test-Path -LiteralPath $output) { throw ('Output already exists: ' + $output) }
$target = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
    foreach ($partName in $manifest.database.parts) {
        $source = [IO.File]::OpenRead((Join-Path $PSScriptRoot $partName))
        try { $source.CopyTo($target) } finally { $source.Dispose() }
    }
} finally { $target.Dispose() }
if ((Get-Item -LiteralPath $output).Length -ne $manifest.database.bytes -or (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash -ne $manifest.database.sha256) {
    throw 'Reassembled database checksum mismatch'
}
Write-Output ('Verified database dump: ' + $output)
