$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$mentraAudioOutput = Join-Path $PSScriptRoot '..\qa\ai-actions\spoken-lunch.wav'
New-Item -ItemType Directory -Force -Path (Split-Path $mentraAudioOutput) | Out-Null
$mentraSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $mentraSynth.SelectVoice('Microsoft Maria Desktop')
    $mentraSynth.SetOutputToWaveFile($mentraAudioOutput)
    $mentraSynth.Speak('Gastei trinta e cinco reais e noventa centavos no almoço hoje. Registre na gestão financeira.')
} finally {
    $mentraSynth.Dispose()
}
Get-Item -LiteralPath $mentraAudioOutput | Select-Object Name,Length
