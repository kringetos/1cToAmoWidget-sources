# Enables the existing dedicated test publication on one LAN address and TCP port.
# Does not change the router. Run with administrator rights after local API checks.
[CmdletBinding()]
param([string]$LocalAddress = '192.168.0.131', [int]$Port = 8081)
$ErrorActionPreference = 'Stop'
if (-not [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator rights are required. No settings were changed.'
}
if ([IntPtr]::Size -ne 8) { throw 'Use 64-bit Windows PowerShell.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid TCP port.' }
if (-not (Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LocalAddress -ErrorAction SilentlyContinue)) { throw 'The LAN address is not assigned to this computer.' }
$siteName = 'AMO-1C-Test'
$publication = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '../restored/web-publication'))
Add-Type -Path "$env:windir\System32\inetsrv\Microsoft.Web.Administration.dll"
$manager = [Microsoft.Web.Administration.ServerManager]::new()
try {
    $site = $manager.Sites[$siteName]
    if (-not $site) { throw 'The locally tested IIS site does not exist.' }
    $app = $site.Applications['/']
    if (-not $app -or $app.ApplicationPoolName -ne $siteName -or
        [IO.Path]::GetFullPath($app.VirtualDirectories['/'].PhysicalPath) -ne $publication) { throw 'Unexpected site configuration; no changes made.' }
    $bindingInfo = $LocalAddress + ':' + $Port + ':'
    foreach ($existing in $site.Bindings) {
        if ($existing.Protocol -ne 'http' -or $existing.BindingInformation -notin @(('127.0.0.1:' + $Port + ':'), $bindingInfo)) { throw 'Unexpected binding on the test site; inspect before continuing.' }
    }
    foreach ($other in $manager.Sites) {
        if ($other.Name -eq $siteName) { continue }
        foreach ($binding in $other.Bindings) {
            if ($binding.Protocol -eq 'http' -and $binding.BindingInformation -in @($bindingInfo, ('*:' + $Port + ':'), (':' + $Port + ':'))) { throw 'Another IIS site uses the requested binding.' }
        }
    }
    $found = $false
    foreach ($binding in $site.Bindings) { if ($binding.Protocol -eq 'http' -and $binding.BindingInformation -eq $bindingInfo) { $found = $true } }
    if (-not $found) {
        & "$env:windir\System32\inetsrv\appcmd.exe" add backup ('Before-AMO-Test-LAN-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        if ($LASTEXITCODE -ne 0) { throw 'IIS backup failed.' }
        $site.Bindings.Add($bindingInfo, 'http') | Out-Null
        $manager.CommitChanges()
    }
    $ruleName = 'AMO-1C-Test-TCP-' + $Port
    $existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existingRule) {
        $ports = $existingRule | Get-NetFirewallPortFilter
        $addresses = $existingRule | Get-NetFirewallAddressFilter
        if ([string]$ports.LocalPort -ne [string]$Port -or [string]$ports.Protocol -notin @('TCP','6') -or
            [string]$addresses.LocalAddress -ne $LocalAddress -or [string]$addresses.RemoteAddress -ne 'Any' -or
            [string]$existingRule.Direction -ne 'Inbound' -or [string]$existingRule.Action -ne 'Allow') { throw 'Existing named firewall rule differs from the expected rule; inspect before continuing.' }
        $existingRule | Enable-NetFirewallRule
    } else {
        New-NetFirewallRule -Name $ruleName -DisplayName ('1C amoCRM test TCP ' + $Port) -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $LocalAddress -LocalPort $Port -RemoteAddress Any -Profile Any | Out-Null
    }
    Write-Output ('LAN publication: http://' + $LocalAddress + ':' + $Port)
    Write-Output ('Inbound TCP ' + $Port + ' allowed only for this local address. Router unchanged.')
} finally { $manager.Dispose() }
