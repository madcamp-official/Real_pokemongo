param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$DurationMinutes = 20,
    [int]$IntervalSeconds = 30
)

$samples = @()
$failure = $null

try {
    $gardenProcess = Get-Process -Id $ProcessId -ErrorAction Stop
    $targetTime = $gardenProcess.StartTime.AddMinutes($DurationMinutes)

    while ((Get-Date) -lt $targetTime) {
        $gardenProcess = Get-Process -Id $ProcessId -ErrorAction Stop
        $gardenProcess.Refresh()
        $samples += [pscustomobject]@{
            timestamp = (Get-Date).ToString("o")
            elapsedMinutes = [math]::Round(((Get-Date) - $gardenProcess.StartTime).TotalMinutes, 2)
            responding = $gardenProcess.Responding
            workingSetMB = [math]::Round($gardenProcess.WorkingSet64 / 1MB, 1)
            privateMB = [math]::Round($gardenProcess.PrivateMemorySize64 / 1MB, 1)
            cpuSeconds = [math]::Round($gardenProcess.CPU, 1)
        }

        $remainingSeconds = ($targetTime - (Get-Date)).TotalSeconds
        if ($remainingSeconds -gt 0) {
            Start-Sleep -Seconds ([math]::Min($IntervalSeconds, [math]::Ceiling($remainingSeconds)))
        }
    }

    $gardenProcess = Get-Process -Id $ProcessId -ErrorAction Stop
    $gardenProcess.Refresh()
    $samples += [pscustomobject]@{
        timestamp = (Get-Date).ToString("o")
        elapsedMinutes = [math]::Round(((Get-Date) - $gardenProcess.StartTime).TotalMinutes, 2)
        responding = $gardenProcess.Responding
        workingSetMB = [math]::Round($gardenProcess.WorkingSet64 / 1MB, 1)
        privateMB = [math]::Round($gardenProcess.PrivateMemorySize64 / 1MB, 1)
        cpuSeconds = [math]::Round($gardenProcess.CPU, 1)
    }
}
catch {
    $failure = $_.Exception.Message
}

$result = [pscustomobject]@{
    processId = $ProcessId
    requestedDurationMinutes = $DurationMinutes
    completed = ($null -eq $failure)
    failure = $failure
    sampleCount = $samples.Count
    allResponding = (($samples | Where-Object { -not $_.responding }).Count -eq 0)
    workingSetMinMB = ($samples.workingSetMB | Measure-Object -Minimum).Minimum
    workingSetMaxMB = ($samples.workingSetMB | Measure-Object -Maximum).Maximum
    privateMinMB = ($samples.privateMB | Measure-Object -Minimum).Minimum
    privateMaxMB = ($samples.privateMB | Measure-Object -Maximum).Maximum
    samples = $samples
}

$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
