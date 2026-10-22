param(
    [int[]]$Pids,
    [switch]$KeepTopmost
)

$definition = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class Win32WindowMgr {
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_SHOWWINDOW = 0x0040;

    public static int BringPidsToFront(int[] targetPids, bool keepTopmost) {
        if (targetPids == null || targetPids.Length == 0) return 0;

        List<uint> pidList = new List<uint>();
        for (int i = 0; i < targetPids.Length; i++) {
            pidList.Add((uint)targetPids[i]);
        }

        // Tap ALT key to bypass Windows foreground restriction
        try {
            keybd_event(0x12, 0, 0, 0);
            keybd_event(0x12, 0, 2, 0);
        } catch {}

        int count = 0;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            uint procId;
            GetWindowThreadProcessId(hWnd, out procId);

            if (pidList.Contains(procId)) {
                // SW_RESTORE = 9
                ShowWindowAsync(hWnd, 9);
                SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                if (!keepTopmost) {
                    SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                }
                BringWindowToTop(hWnd);
                SetForegroundWindow(hWnd);
                count++;
            }
            return true;
        }, IntPtr.Zero);

        return count;
    }
}
'@

try {
    Add-Type -TypeDefinition $definition -ErrorAction SilentlyContinue
} catch {}

if ($Pids -and $Pids.Count -gt 0) {
    # Include both target PIDs and child processes if any
    $expanded = [System.Collections.ArrayList]::new()
    foreach ($p in $Pids) {
        [void]$expanded.Add([int]$p)
        try {
            $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId = $p" -ErrorAction SilentlyContinue
            foreach ($k in $kids) {
                [void]$expanded.Add([int]$k.ProcessId)
            }
        } catch {}
    }
    $intArr = [int[]]$expanded.ToArray([int])
    $res = [Win32WindowMgr]::BringPidsToFront($intArr, [bool]$KeepTopmost.IsPresent)
    Write-Host "Brought $res windows to front for $($intArr.Length) processes"
}
