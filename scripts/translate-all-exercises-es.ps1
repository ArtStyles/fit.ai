$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

for ($batch = 1; $batch -le 30; $batch++) {
  Write-Output "=== Batch $batch ==="
  & node --env-file=.env.local --import tsx scripts/translate-exercises-es.ts --limit=50 --allow-machine
  if ($LASTEXITCODE -ne 0) {
    throw "Translation batch $batch failed with exit code $LASTEXITCODE"
  }

  $remaining = & node --env-file=.env.local -e @'
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const result = await client.from('exercises').select('id', { count: 'exact', head: true }).eq('is_public', true).is('name_es', null);
  if (result.error) throw result.error;
  process.stdout.write(String(result.count ?? 0));
})().catch(error => { console.error(error); process.exit(1); });
'@
  if ($LASTEXITCODE -ne 0) {
    throw "Could not count pending exercises"
  }
  Write-Output "Remaining: $remaining"
  if ([int]$remaining -eq 0) {
    Write-Output 'All exercise translations are complete.'
    exit 0
  }
}

throw 'Translation stopped after 30 batches with exercises still pending.'
