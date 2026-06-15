Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$in,
        [string]$out,
        [int]$w,
        [int]$h
    )
    $src = [System.Drawing.Image]::FromFile($in)
    $dest = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $w, $h)
    $dest.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
}

$inputPath = "C:\Users\JeremyPoling\.gemini\antigravity-ide\brain\a1451a48-ef18-4d4d-9bea-397959ceb5c5\password_engine_icon_1781558603698.png"
Resize-Image -in $inputPath -out "c:\Users\JeremyPoling\OneDrive - IAMS, Inc\Documents\PasswordEngine\icon-192.png" -w 192 -h 192
Resize-Image -in $inputPath -out "c:\Users\JeremyPoling\OneDrive - IAMS, Inc\Documents\PasswordEngine\icon-512.png" -w 512 -h 512

Write-Host "Icons resized and saved successfully!"
