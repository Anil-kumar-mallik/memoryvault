$ErrorActionPreference = "Stop"

Write-Host "[1/2] Server syntax/build check"
Push-Location "$PSScriptRoot\..\server"
npm run build
Pop-Location

Write-Host "[2/2] Client production build"
Push-Location "$PSScriptRoot\..\client"
npm run build
Pop-Location

Write-Host "Production build completed successfully."
