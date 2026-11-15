param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$campaignRoot = Split-Path -Parent $PSScriptRoot
if (!$OutputDirectory) { $OutputDirectory = Join-Path $campaignRoot '.perf-local/campaign-voice/raw' }
[void][System.IO.Directory]::CreateDirectory($OutputDirectory)
$campaignLocale = Get-Content -LiteralPath (Join-Path $campaignRoot 'public/campaign/m01/ru.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$campaignSpeech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $campaignSpeech.SelectVoice('Microsoft Pavel')
  foreach ($campaignLine in $campaignLocale.lines.PSObject.Properties) {
    $campaignSpeech.Rate = if ($campaignLine.Value.speaker -in @('bruno', 'lasko', 'sentry')) { 1 } else { 0 }
    $campaignWave = Join-Path $OutputDirectory ($campaignLine.Name + '.wav')
    $campaignSpeech.SetOutputToWaveFile($campaignWave)
    $campaignSpeech.Speak($campaignLine.Value.text)
    $campaignSpeech.SetOutputToNull()
  }
} finally { $campaignSpeech.Dispose() }
Write-Output ('Rendered ' + @($campaignLocale.lines.PSObject.Properties).Count + ' campaign voice clips.')
