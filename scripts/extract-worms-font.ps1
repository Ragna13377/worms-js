$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$fontDirectory = Join-Path $projectRoot 'public/assets/fonts'
$source = [System.Drawing.Bitmap]::new((Join-Path $fontDirectory 'worms-fonts.png'))
$atlas = [System.Drawing.Bitmap]::new(768, 48)
$characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`!'
$glyphs = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
try {
    for ($index = 0; $index -lt $characters.Length; $index++) {
        $column = $index % 32
        $row = [int][Math]::Floor($index / 32)
        $left = 24
        $right = 0
        for ($y = 0; $y -lt 24; $y++) {
            for ($x = 0; $x -lt 24; $x++) {
                $pixel = $source.GetPixel(1 + $column * 25 + $x, 1 + $row * 25 + $y)
                if ($pixel.R -eq 147 -and $pixel.G -eq 187 -and $pixel.B -eq 236) { continue }
                $left = [Math]::Min($left, $x)
                $right = [Math]::Max($right, $x)
            }
        }
        $width = $right - $left + 1
        for ($y = 0; $y -lt 24; $y++) {
            for ($x = $left; $x -le $right; $x++) {
                $pixel = $source.GetPixel(1 + $column * 25 + $x, 1 + $row * 25 + $y)
                if ($pixel.R -eq 147 -and $pixel.G -eq 187 -and $pixel.B -eq 236) { continue }
                $atlas.SetPixel($column * 24 + $x - $left, $row * 24 + $y, $pixel)
            }
        }
        $glyphs[[string]$characters[$index]] = @{ x = $column * 24; y = $row * 24; width = $width }
    }
    $atlas.Save((Join-Path $fontDirectory 'worms-white.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $glyphs | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $fontDirectory 'worms-white.json') -Encoding utf8
}
finally {
    $source.Dispose()
    $atlas.Dispose()
}
