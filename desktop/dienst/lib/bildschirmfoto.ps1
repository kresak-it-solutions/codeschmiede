# Bildschirmfoto NUR vom Fenster der Windows-Sandbox (Codeschmiede 0.17.0, Arbeitsplatz Stufe 2, Gerhard 02.11.2026).
# Fest im Programm – der Werkstatt-Dienst ruft es ohne Shell mit genau einem Wert auf (-Ziel, vom Dienst erzeugter Pfad).
# Kein Foto vom ganzen Bildschirm: PrintWindow zeichnet nur dieses eine Fenster (auch wenn andere Fenster darüber liegen, sind sie nicht drauf).
# Rückgabe: 0 = gespeichert · 2 = kein Sandbox-Fenster · 3 = Fenster minimiert · 4 = Bild leer · 5 = ungültiger Zielpfad · 6 = mehrere Fenster · 7 = zu groß
param([Parameter(Mandatory = $true)][string]$Ziel)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
if ($Ziel -notmatch '^[A-Za-z]:\\[^"<>|*?\r\n]{1,400}\\bildschirmfotos\\[0-9]{1,18}\.png$') { exit 5 }
if (Test-Path -LiteralPath $Ziel) { exit 5 }

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class CsSandboxFenster {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static List<IntPtr> Finden() {
    var treffer = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      var t = sb.ToString();
      // Nur der genaue Fenstertitel (englisch oder deutsch) – kein „enthält“
      if (t != "Windows Sandbox" && t != "Windows-Sandbox") return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      try {
        var name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
        // Das Fenster gehört zum Programm der Windows-Sandbox (WindowsSandboxClient / WindowsSandboxRemoteSession …)
        if (name.StartsWith("WindowsSandbox", StringComparison.OrdinalIgnoreCase)) treffer.Add(h);
      } catch { }
      return true;
    }, IntPtr.Zero);
    return treffer;
  }
}
"@

[void][CsSandboxFenster]::SetProcessDPIAware()
$fenster = [CsSandboxFenster]::Finden()
if ($fenster.Count -eq 0) { exit 2 }
if ($fenster.Count -gt 1) { exit 6 }
$h = $fenster[0]
if ([CsSandboxFenster]::IsIconic($h)) { exit 3 }
$r = New-Object CsSandboxFenster+RECT
[void][CsSandboxFenster]::GetWindowRect($h, [ref]$r)
$b = $r.Right - $r.Left; $hoehe = $r.Bottom - $r.Top
if ($b -le 0 -or $hoehe -le 0) { exit 3 }
if ($b -gt 10000 -or $hoehe -gt 10000) { exit 7 }
$bild = New-Object System.Drawing.Bitmap $b, $hoehe
$g = [System.Drawing.Graphics]::FromImage($bild)
$hdc = $g.GetHdc()
try { $ok = [CsSandboxFenster]::PrintWindow($h, $hdc, 2) } finally { $g.ReleaseHdc($hdc); $g.Dispose() }
if (-not $ok) { $bild.Dispose(); exit 4 }
# Leeres Bild (z. B. schwarz, weil das Fenster nicht gezeichnet hat) nicht weitergeben
$erste = $bild.GetPixel(0, 0).ToArgb(); $gleich = $true
for ($x = 0; $x -lt 12 -and $gleich; $x++) { for ($y = 0; $y -lt 12; $y++) {
  if ($bild.GetPixel([int](($b - 1) * $x / 11), [int](($hoehe - 1) * $y / 11)).ToArgb() -ne $erste) { $gleich = $false; break }
} }
if ($gleich) { $bild.Dispose(); exit 4 }
$bild.Save($Ziel, [System.Drawing.Imaging.ImageFormat]::Png)
$bild.Dispose()
exit 0
