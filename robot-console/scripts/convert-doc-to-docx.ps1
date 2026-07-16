param(
    [string]$SourceDir = "",
    [string]$OutputDir = "",
    [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SourceDir)) {
    $SourceDir = Join-Path $PSScriptRoot "..\ziliao"
}

$SourceDir = (Resolve-Path -LiteralPath $SourceDir).Path

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = $SourceDir
}

if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path $SourceDir "doc_original_backup"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$logFile = Join-Path $OutputDir "conversion-log.txt"
"Conversion started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Set-Content -Path $logFile -Encoding UTF8

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
    $files = Get-ChildItem -Path $SourceDir -File | Where-Object { $_.Extension -ieq ".doc" }

    foreach ($file in $files) {
        $inputFile = $file.FullName
        $outputFile = Join-Path $OutputDir ($file.BaseName + ".docx")
        $line = "[$(Get-Date -Format 'HH:mm:ss')] Converting: $($file.Name)"
        Write-Host $line
        Add-Content -Path $logFile -Value $line -Encoding UTF8

        try {
            $doc = $word.Documents.Open($inputFile, $false, $true)
            $doc.SaveAs2($outputFile, 16)
            $doc.Close()
            Move-Item -LiteralPath $inputFile -Destination (Join-Path $BackupDir $file.Name) -Force
            $done = "[$(Get-Date -Format 'HH:mm:ss')] Done: $outputFile"
            Write-Host $done
            Add-Content -Path $logFile -Value $done -Encoding UTF8
        }
        catch {
            $fail = "[$(Get-Date -Format 'HH:mm:ss')] Failed: $inputFile :: $($_.Exception.Message)"
            Write-Host $fail
            Add-Content -Path $logFile -Value $fail -Encoding UTF8
            try {
                if ($doc) {
                    $doc.Close($false)
                }
            }
            catch {}
        }
    }
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    "Conversion finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Add-Content -Path $logFile -Encoding UTF8
}
