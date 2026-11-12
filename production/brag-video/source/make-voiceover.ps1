param([string]$OutDir = "C:\Users\theni\AppData\Local\Temp\opencode\brag\voice")

Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$lines = @(
  @{ id = "s01"; text = "Every project starts with an agreement. But when work, milestones, and money come together, trust alone isn't always enough." },
  @{ id = "s02"; text = "Meet FairHold. A milestone based platform designed to bring structure, evidence, and accountability to payments." },
  @{ id = "s03"; text = "FairHold brings buyers and sellers into a structured deal workflow, where expectations and milestones are clearly defined." },
  @{ id = "s04"; text = "Instead of treating an entire project as one uncertain transaction, FairHold organizes the work into individual milestones." },
  @{ id = "s05"; text = "Work can be supported with evidence, giving reviewers something concrete to evaluate before a decision." },
  @{ id = "s06"; text = "Submitted evidence enters a review process. The decision remains with the authorized human reviewer. AI can assist, but it does not replace human judgment." },
  @{ id = "s07"; text = "The guided demo illustrates the capture stage using a simulated payment flow, without moving real money." },
  @{ id = "s08"; text = "That's the principle behind FairHold. AI provides assistance. Humans make the decisions. Deterministic rules govern payment operations." },
  @{ id = "s09"; text = "FairHold. Bringing structure and accountability to milestone based payments." }
)

foreach ($voice in @("Microsoft Zira Desktop", "Microsoft David Desktop")) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice($voice)
  $synth.Rate = -1
  $synth.Volume = 100
  $synth.SetOutputToWaveFile((Join-Path $OutDir "$($voice.Replace(' ', '_')).wav"))
  foreach ($l in $lines) {
    $synth.Speak($l.text)
  }
  $synth.SetOutputToNull()
  $synth.Dispose()
  Write-Output "VOICE: $voice written"
}

# Per-line WAVs for precise placement: one synth run per line.
foreach ($l in $lines) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice("Microsoft Zira Desktop")
  $synth.Rate = -1
  $synth.Volume = 100
  $synth.SetOutputToWaveFile((Join-Path $OutDir "$($l.id).wav"))
  $synth.Speak($l.text)
  $synth.SetOutputToNull()
  $synth.Dispose()
  $dur = ffprobe -v error -show_entries format=duration -of csv=p=0 (Join-Path $OutDir "$($l.id).wav")
  Write-Output ("LINE {0}: {1} s" -f $l.id, $dur)
}
Write-Output "VO DONE"
