param(
  [switch]$SkipDeploy,
  [string[]]$PlaywrightArgs = @()
)

$ErrorActionPreference = "Stop"

function Invoke-VerifiedStep {
  param(
    [string]$Name,
    [string]$Executable,
    [string[]]$Arguments
  )

  Write-Host "`n==> $Name"
  & $Executable @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-Error "$Name failed with exit code $exitCode. Deployment cancelled."
    exit $exitCode
  }
}

Invoke-VerifiedStep "TypeScript" "npx.cmd" @("tsc", "--noEmit")
Invoke-VerifiedStep "Lint" "npm.cmd" @("run", "lint")
Invoke-VerifiedStep "Production build" "npm.cmd" @("run", "build")
Invoke-VerifiedStep "Playwright E2E" "npx.cmd" (@("playwright", "test") + $PlaywrightArgs)

if ($SkipDeploy) {
  Write-Host "`nAll verification steps passed. Deployment skipped by -SkipDeploy."
  exit 0
}

Invoke-VerifiedStep "Vercel production settings" "npx.cmd" @(
  "--yes", "vercel@68.0.0", "pull", "--yes", "--environment=production"
)
Invoke-VerifiedStep "Vercel production build" "npx.cmd" @(
  "--yes", "vercel@68.0.0", "build", "--prod"
)
Invoke-VerifiedStep "Vercel production deploy" "npx.cmd" @(
  "--yes", "vercel@68.0.0", "deploy", "--prebuilt", "--prod", "--yes"
)

Write-Host "`nProduction deployment completed."
