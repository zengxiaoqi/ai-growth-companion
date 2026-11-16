# Disable Windows console QuickEdit for the current console window.
#
# Why this is needed:
# Node's stdout writes to a Windows console are synchronous. When QuickEdit is
# on and a selection is active (e.g. you clicked the window to read the logs),
# conhost blocks every console write until the selection is cleared. That stalls
# the Node event loop: no HTTP requests are handled, logs stop, and clients time
# out. Pressing Enter clears the selection and everything flushes at once.
#
# Safe to run in any console; silently does nothing when stdin is not a console.

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LingxiConsole {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetConsoleMode(IntPtr h, out uint mode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleMode(IntPtr h, uint mode);
}
'@

$handle = [LingxiConsole]::GetStdHandle(-10) # STD_INPUT_HANDLE
$mode = [uint32]0
if ([LingxiConsole]::GetConsoleMode($handle, [ref]$mode)) {
    # 0x40 = ENABLE_QUICK_EDIT_MODE (clear)
    # 0x20 = ENABLE_INSERT_MODE, 0x80 = ENABLE_EXTENDED_FLAGS (keep)
    $newMode = (($mode -band [uint32]0xFFFFFFBF) -bor [uint32]0x20) -bor [uint32]0x80
    [void][LingxiConsole]::SetConsoleMode($handle, $newMode)
}
