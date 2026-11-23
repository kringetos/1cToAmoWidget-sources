# Creates a separate test publication. Does not configure the router or firewall.
# Run in an elevated 64-bit PowerShell window.
[CmdletBinding()]
param(
    [string]$DatabasePath,
    [string]$PlatformBin = 'G:\1С8.5\8.5.1.1522\bin',
    [int]$Port = 8081,
    [string]$ListenAddress = '127.0.0.1',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($DatabasePath)) {
    $DatabasePath = Join-Path $scriptDirectory '../restored/verification'
}
$DatabasePath = (Resolve-Path -LiteralPath $DatabasePath).Path
if (-not (Test-Path -LiteralPath (Join-Path $DatabasePath '1Cv8.1CD'))) { throw 'Test database not found.' }
$dll = Join-Path $PlatformBin 'wsisapi.dll'
if (-not (Test-Path -LiteralPath $dll)) { throw '1C web extension not found.' }
$publication = [IO.Path]::GetFullPath((Join-Path $scriptDirectory '../restored/web-publication'))
$parsedAddress = $null
if (-not [Net.IPAddress]::TryParse($ListenAddress, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'ListenAddress must be an explicit local IPv4 address.'
}
if ([IntPtr]::Size -ne 8) { throw 'Use 64-bit Windows PowerShell to configure IIS.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }
if ($CheckOnly) {
    Write-Output ('Database: ' + $DatabasePath)
    Write-Output ('1C web extension: ' + $dll)
    Write-Output ('Publication directory: ' + $publication)
    Write-Output ('Binding: ' + $ListenAddress + ':' + $Port)
    Write-Output 'Preflight passed. No settings were changed.'
    return
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell window. No settings were changed.'
}
$siteName = 'AMO-1C-Test'
Add-Type -Path "$env:windir\System32\inetsrv\Microsoft.Web.Administration.dll"
$manager = [Microsoft.Web.Administration.ServerManager]::new()
try {
    $site = $manager.Sites[$siteName]
    $pool = $manager.ApplicationPools[$siteName]
    $expectedBinding = $ListenAddress + ':' + $Port + ':'
    if ($site) {
        $existingApp = $site.Applications['/']
        if (-not $existingApp -or $existingApp.ApplicationPoolName -ne $siteName -or
            -not $existingApp.VirtualDirectories['/'] -or
            [IO.Path]::GetFullPath($existingApp.VirtualDirectories['/'].PhysicalPath) -ne $publication) {
            throw 'Existing test site does not match the expected publication. Nothing will be overwritten.'
        }
        if ($site.Bindings.Count -ne 1 -or $site.Bindings[0].Protocol -ne 'http' -or
            $site.Bindings[0].BindingInformation -ne $expectedBinding) {
            throw 'Existing test site has a different binding. Inspect it before continuing.'
        }
        Write-Output 'Resuming configuration of the existing dedicated test site.'
    } elseif (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
        throw 'The chosen port is already in use by another site or process.'
    }
    if ($pool) {
        foreach ($otherSite in $manager.Sites) {
            foreach ($otherApp in $otherSite.Applications) {
                if ($otherApp.ApplicationPoolName -eq $siteName -and
                    ($otherSite.Name -ne $siteName -or $otherApp.Path -ne '/')) {
                    throw 'The test pool is shared with another application; configuration stopped.'
                }
            }
        }
    }
    $appcmd = "$env:windir\System32\inetsrv\appcmd.exe"
    & $appcmd add backup ('Before-AMO-Test-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if ($LASTEXITCODE -ne 0) { throw 'IIS backup failed.' }
    New-Item -ItemType Directory -Path $publication -Force | Out-Null
    $escapedDatabase = [Security.SecurityElement]::Escape(('File="' + $DatabasePath + '";'))
    $vrd = @"
<?xml version="1.0" encoding="UTF-8"?>
<point xmlns="http://v8.1c.ru/8.2/virtual-resource-system" base="/" ib="$escapedDatabase" enable="false" allowexecutescheduledjobs="off">
  <httpServices publishByDefault="false" publishExtensionsByDefault="true" />
  <standardOdata enable="false" />
  <ws enable="false" pointEnableCommon="false" publishExtensionsByDefault="false" />
</point>
"@
    $escapedDll = [Security.SecurityElement]::Escape($dll)
    $webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration><system.webServer><handlers><clear />
<add name="1C Test HTTP API" path="*" verb="*" modules="IsapiModule" scriptProcessor="$escapedDll" resourceType="Unspecified" requireAccess="None" />
</handlers><httpErrors existingResponse="PassThrough" /></system.webServer></configuration>
"@
    [IO.File]::WriteAllText((Join-Path $publication 'default.vrd'), $vrd, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $publication 'web.config'), $webConfig, [Text.UTF8Encoding]::new($false))
    if (-not $pool) { $pool = $manager.ApplicationPools.Add($siteName) }
    $pool.Enable32BitAppOnWin64 = $true
    $pool.ManagedRuntimeVersion = ''
    $pool.ManagedPipelineMode = [Microsoft.Web.Administration.ManagedPipelineMode]::Classic
    $pool.ProcessModel.IdentityType = [Microsoft.Web.Administration.ProcessModelIdentityType]::ApplicationPoolIdentity
    $pool.ProcessModel.LoadUserProfile = $true
    if (-not $site) { $site = $manager.Sites.Add($siteName, 'http', $expectedBinding, $publication) }
    $site.Applications['/'].ApplicationPoolName = $siteName
    $anonymous = $manager.GetApplicationHostConfiguration().GetSection('system.webServer/security/authentication/anonymousAuthentication', $siteName)
    $anonymous.SetAttributeValue('enabled', $true)
    $anonymous.SetAttributeValue('userName', '')
    $restrictions = $manager.GetApplicationHostConfiguration().GetSection('system.webServer/security/isapiCgiRestriction').GetCollection()
    $exists = $false
    foreach ($item in $restrictions) { if ([string]$item['path'] -eq $dll) { $exists = $true } }
    if (-not $exists) {
        $item = $restrictions.CreateElement('add')
        $item['path'] = $dll; $item['allowed'] = $true; $item['description'] = '1C test publication'
        $restrictions.Add($item)
    }
    $manager.CommitChanges()
    # Read the committed pool again so its computed SID is available.
    $manager.Dispose()
    $manager = [Microsoft.Web.Administration.ServerManager]::new()
    $pool = $manager.ApplicationPools[$siteName]
    $poolSid = [string]$pool.GetAttributeValue('applicationPoolSid')
    if ([string]::IsNullOrWhiteSpace($poolSid)) { throw 'IIS did not return applicationPoolSid for the committed pool.' }
    $sid = [Security.Principal.SecurityIdentifier]::new($poolSid)
    if (-not $sid.Value.StartsWith('S-1-5-82-')) { throw 'Unexpected IIS pool SID; permissions were not changed.' }
    Write-Output ('IIS pool SID: ' + $sid.Value)
    $aclIdentity = '*' + $sid.Value
    & icacls.exe $publication /grant ($aclIdentity + ':(OI)(CI)(RX)')
    if ($LASTEXITCODE -ne 0) { throw 'Publication permissions failed.' }
    & icacls.exe $DatabasePath /grant ($aclIdentity + ':(OI)(CI)(M)')
    if ($LASTEXITCODE -ne 0) { throw 'Test database permissions failed.' }
    if ($pool.State -eq [Microsoft.Web.Administration.ObjectState]::Stopped) { $pool.Start() | Out-Null }
    $site = $manager.Sites[$siteName]
    if ($site.State -eq [Microsoft.Web.Administration.ObjectState]::Stopped) { $site.Start() | Out-Null }
    Write-Output ('Publication: http://' + $ListenAddress + ':' + $Port + '/hs/integration/v1/')
    Write-Output 'Router and firewall are unchanged.'
} finally {
    $manager.Dispose()
}
