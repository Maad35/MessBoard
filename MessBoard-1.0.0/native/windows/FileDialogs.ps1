param([switch]$SelfTest, [switch]$ProbeCancel)
# No request data is interpolated into code. stdout is one UTF-8 JSON envelope.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    # A prebuilt assembly is a metadata load (~0.05s); compiling from source costs ~0.9s.
    # Fall back to the source compile only when the assembly is absent or unloadable.
    $assembly = Join-Path $PSScriptRoot 'MessBoard.NativeDialogs.dll'
    $engine = $null
    if (Test-Path -LiteralPath $assembly) {
        try { [void][System.Reflection.Assembly]::LoadFrom($assembly); $engine = [MessBoard.NativeDialogs.Engine] }
        catch { $engine = $null }
    }
    if (-not $engine) {
        Add-Type -Path (Join-Path $PSScriptRoot 'FileDialogs.cs') -ReferencedAssemblies System.Web.Extensions,System.Windows.Forms
        $engine = [MessBoard.NativeDialogs.Engine]
    }
    $request = [Environment]::GetEnvironmentVariable('MESSBOARD_FILE_DIALOG_REQUEST')
    if ($SelfTest) { $reply = $engine::SelfTest($request) }
    else { $reply = $engine::Run($request, [bool]$ProbeCancel) }
    [Console]::WriteLine($reply)
} catch {
    [Console]::WriteLine('{"version":1,"status":"failed","paths":[],"code":"native"}')
}
