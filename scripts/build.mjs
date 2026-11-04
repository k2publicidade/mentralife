import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
execFileSync(process.execPath,['scripts/prepare-vendor.mjs'],{stdio:'inherit'});
const required=['docs/VERCEL-CLOUDFLARE.md','vercel.json','server/hosting.mjs','scripts/build-vercel.mjs','dist/skip-link.mjs','docs/RESTAURACAO-CONTA.md','dist/sync-review.mjs','scripts/private-backup.mjs','scripts/restore-quarantine.sql','scripts/prepare-deployment.mjs','scripts/smoke-release.mjs','docs/BACKUP-RESTAURACAO.md','dist/finance-import.mjs','dist/finance-import-ui.mjs','docs/IMPORTACAO-FINANCEIRA.md','server/calendar.mjs','migrations/0009_calendar.sql','dist/calendar-connect-ui.mjs','dist/calendar-import.mjs','dist/calendar-callback.html','dist/calendar-callback.mjs','docs/CALENDARIO-GOOGLE.md','server/document-shares.mjs','migrations/0008_document_shares.sql','dist/document-shares-ui.mjs','dist/shared-document.mjs','dist/share.html','dist/sharing.css','dist/_headers','docs/LINKS-PRIVADOS.md','server/whatsapp.mjs','server/audio.mjs','server/push.mjs','server/reminder-plan.mjs','server/state.mjs','migrations/0005_integrations.sql','migrations/0006_whatsapp_receipts.sql','migrations/0007_audio_claims.sql','dist/manifest.webmanifest','scripts/readiness.mjs','docs/RELATORIO-INTEGRACOES-2026-10-29.md','dist/integrations-ui.mjs','dist/integrations.css','dist/ux.css','docs/AJUSTES-UX.md','dist/push-sw.js','docs/INTEGRACOES.md','docs/DEPENDE-DO-OPERADOR.md','dist/time.mjs','dist/event-series.mjs','dist/backup.mjs','dist/sync-ui.mjs','dist/sync-controller.mjs','dist/draft-store.mjs','docs/PENDENCIAS-PUBLICACAO.md','docs/AUDITORIA-FUNCIONAL.md','dist/health-core.mjs','dist/health-ui.mjs','dist/health.css','dist/handoff/07-saude-bem-estar.md','dist/index.html','dist/app.js','dist/core.mjs','dist/finance.mjs','dist/finance-ui.mjs','dist/documents-ui.mjs','dist/moments-core.mjs','dist/moments-ui.mjs','dist/journeys-core.mjs','dist/journeys-ui.mjs','dist/handoff/06-caminhos-e-planos.md','dist/handoff/MENTRA-LIFE-HANDOFF-COMPLETO.md','dist/handoff/mentra-handoff-completo.zip','dist/handoff/05-momentos-mentra.md','dist/pdf.mjs','dist/pdf-fonts.mjs','dist/assets/licenses/liberation-fonts.txt','dist/styles.css','dist/assets/mentra-logo-original.png','dist/assets/mentra-face.png','dist/handoff/ESPECIFICACAO-COMPLETA.md','dist/handoff/mentra-handoff.json','dist/handoff/mentra-modelo-logico.json','dist/handoff/mentra-matriz-funcionalidades.csv','README.md','docs/QA.md','.openai/hosting.json'];
for(const theme of ['neutral','christian'])for(const period of ['morning','afternoon','night'])required.push(`dist/assets/moments/${theme}-${period}.png`);
for(const file of required)if(!existsSync(file))throw Error(`Arquivo ausente: ${file}`);
const deployment=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(!existsSync(deployment.main)||deployment.assets?.directory!=='./dist'||!deployment.d1_databases?.some(d=>d.binding==='DB'&&existsSync(d.migrations_dir)))throw Error('Configuração Cloudflare inválida');
for(const file of ['dist/handoff/mentra-handoff.json','dist/handoff/mentra-modelo-logico.json','dist/handoff/mentra-matriz-funcionalidades.json'])JSON.parse(readFileSync(file,'utf8'));
execFileSync(process.execPath,['scripts/check.mjs'],{stdio:'inherit'});
mkdirSync('dist/downloads',{recursive:true});
execFileSync(process.platform==='win32'?'python':'python3',['-c',`from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib,json
root=Path.cwd()
skip={'.git','.wrangler','node_modules','.sites-runtime','.mentra-private','.vercel','.vercel-public','qa','__pycache__'}
files=[p for p in root.rglob('*') if p.is_file() and not any(x in skip for x in p.relative_to(root).parts) and not p.relative_to(root).as_posix().startswith('dist/downloads/') and (p.suffix not in {'.zip','.tar','.gz'} or p.relative_to(root).as_posix()=='dist/handoff/mentra-handoff-completo.zip' or (p.relative_to(root).as_posix().startswith('dist/vendor/') and p.name.endswith('.traineddata.gz'))) and not p.name.startswith('.env') and not p.name.startswith('.dev.vars')]
with ZipFile(root/'dist/downloads/mentra-life-codigo-fonte.zip','w',ZIP_DEFLATED) as z:
 for p in sorted(files): z.write(p,Path('mentra-life')/p.relative_to(root))
manifest={'version':'12.0.0','files':{p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}}
(root/'dist/downloads/manifesto-fonte.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(f'Pacote de codigo: {len(files)} arquivos; '+str((root/'dist/downloads/mentra-life-codigo-fonte.zip').stat().st_size)+' bytes')`],{stdio:'inherit'});
console.log(`Static build ready: ${resolve('dist')}`);
