$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskFontDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'public/assets/fonts'
$taskBitmap = [System.Drawing.Bitmap]::new((Join-Path $taskFontDirectory 'worms-white.png'))
$taskGlyphData = Get-Content (Join-Path $taskFontDirectory 'worms-white.json') -Raw | ConvertFrom-Json -AsHashtable
$taskVectors = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
$taskCulture = [System.Globalization.CultureInfo]::InvariantCulture
function Format-Coordinate([double]$value) { $value.ToString('0.###', $taskCulture) }
try {
 foreach ($taskCharacter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`!'.ToCharArray()) {
  $taskGlyph = $taskGlyphData[[string]$taskCharacter]
  $taskMask = [bool[,]]::new(24,24)
  $taskLeft=24; $taskRight=-1; $taskTop=24; $taskBottom=-1
  for($taskY=0;$taskY -lt 24;$taskY++) { for($taskX=0;$taskX -lt $taskGlyph.width;$taskX++) {
   $taskPixel=$taskBitmap.GetPixel($taskGlyph.x+$taskX,$taskGlyph.y+$taskY)
   # Trace the light letter fill, excluding the dark raster edge/shadow.
   if($taskPixel.A -gt 0 -and (($taskPixel.R+$taskPixel.G+$taskPixel.B)/3) -ge 160) {
    $taskMask[$taskX,$taskY]=$true
    $taskLeft=[Math]::Min($taskLeft,$taskX); $taskRight=[Math]::Max($taskRight,$taskX)
    $taskTop=[Math]::Min($taskTop,$taskY); $taskBottom=[Math]::Max($taskBottom,$taskY)
   }
  } }
  $taskEdges=@{}
  for($taskY=0;$taskY -lt 24;$taskY++) { for($taskX=0;$taskX -lt 24;$taskX++) {
   if(-not $taskMask[$taskX,$taskY]) {continue}
   $taskSides=@()
   if($taskY -eq 0 -or -not $taskMask[$taskX,($taskY-1)]) {$taskSides+=,@($taskX,$taskY,($taskX+1),$taskY)}
   if($taskX -eq 23 -or -not $taskMask[($taskX+1),$taskY]) {$taskSides+=,@(($taskX+1),$taskY,($taskX+1),($taskY+1))}
   if($taskY -eq 23 -or -not $taskMask[$taskX,($taskY+1)]) {$taskSides+=,@(($taskX+1),($taskY+1),$taskX,($taskY+1))}
   if($taskX -eq 0 -or -not $taskMask[($taskX-1),$taskY]) {$taskSides+=,@($taskX,($taskY+1),$taskX,$taskY)}
   foreach($taskSide in $taskSides) {
    $taskKey="$($taskSide[0]),$($taskSide[1])"
    if(-not $taskEdges.ContainsKey($taskKey)) {$taskEdges[$taskKey]=[System.Collections.Generic.List[object]]::new()}
    $taskEdges[$taskKey].Add(@($taskSide[2],$taskSide[3]))
   }
  } }
  $taskPath=[System.Text.StringBuilder]::new()
  while($true) {
   $taskStart=$null
   foreach($taskKey in $taskEdges.Keys) {if($taskEdges[$taskKey].Count -gt 0){$taskStart=$taskKey;break}}
   if($null -eq $taskStart){break}
   $taskPoints=[System.Collections.Generic.List[object]]::new()
   $taskCurrent=$taskStart
   do {
    $taskCoordinates=$taskCurrent.Split(','); $taskPoints.Add(@(([double]$taskCoordinates[0]-$taskLeft),([double]$taskCoordinates[1])))
    if(-not $taskEdges.ContainsKey($taskCurrent) -or $taskEdges[$taskCurrent].Count -eq 0){throw 'Unclosed font contour'}
    $taskNext=$taskEdges[$taskCurrent][0]; $taskEdges[$taskCurrent].RemoveAt(0)
    $taskCurrent="$($taskNext[0]),$($taskNext[1])"
   } while($taskCurrent -ne $taskStart)
   $taskCorners=[System.Collections.Generic.List[object]]::new()
   for($taskIndex=0;$taskIndex -lt $taskPoints.Count;$taskIndex++) {
    $taskPrevious=$taskPoints[($taskIndex+$taskPoints.Count-1)%$taskPoints.Count]; $taskPoint=$taskPoints[$taskIndex]; $taskNext=$taskPoints[($taskIndex+1)%$taskPoints.Count]
    if(($taskPoint[0]-$taskPrevious[0])*($taskNext[1]-$taskPoint[1]) -ne ($taskPoint[1]-$taskPrevious[1])*($taskNext[0]-$taskPoint[0])) {$taskCorners.Add($taskPoint)}
   }
   for($taskIndex=0;$taskIndex -lt $taskCorners.Count;$taskIndex++) {
    $taskPrevious=$taskCorners[($taskIndex+$taskCorners.Count-1)%$taskCorners.Count]; $taskPoint=$taskCorners[$taskIndex]; $taskNext=$taskCorners[($taskIndex+1)%$taskCorners.Count]
    $taskIncoming=@(($taskPoint[0]+[Math]::Sign($taskPrevious[0]-$taskPoint[0])*0.35),($taskPoint[1]+[Math]::Sign($taskPrevious[1]-$taskPoint[1])*0.35))
    $taskOutgoing=@(($taskPoint[0]+[Math]::Sign($taskNext[0]-$taskPoint[0])*0.35),($taskPoint[1]+[Math]::Sign($taskNext[1]-$taskPoint[1])*0.35))
    $taskCommand=if($taskIndex -eq 0){'M'}else{'L'}
    [void]$taskPath.Append("$taskCommand$(Format-Coordinate $taskIncoming[0]) $(Format-Coordinate $taskIncoming[1])Q$(Format-Coordinate $taskPoint[0]) $(Format-Coordinate $taskPoint[1]) $(Format-Coordinate $taskOutgoing[0]) $(Format-Coordinate $taskOutgoing[1])")
   }
   [void]$taskPath.Append('Z')
  }
  $taskVectors[[string]$taskCharacter]=@{width=$taskRight-$taskLeft+1;top=$taskTop;bottom=$taskBottom+1;path=$taskPath.ToString()}
 }
 $taskVectors | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $taskFontDirectory 'worms-vector.json') -Encoding utf8
} finally {$taskBitmap.Dispose()}
