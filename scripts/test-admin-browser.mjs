import {chromium,webkit,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin=process.env.MENTRA_TEST_URL||'http://127.0.0.1:8787';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Este ensaio exige banco local e origem de loopback.');
const password='synthetic-admin-browser-2026',nextPassword='synthetic-new-admin-browser-2026',suffix=crypto.randomUUID();
const emails={owner:`owner-${suffix}@admin.example.test`,user:`user-${suffix}@admin.example.test`};
const accounts=[];let checks=0;
const browser=await chromium.launch(),context=await browser.newContext({extraHTTPHeaders:{'CF-Connecting-IP':`2001:db8:${suffix.slice(0,4)}::1`}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const post=(path,data)=>context.request.post(origin+'/api/'+path,{headers:{Origin:origin},data});
async function login(email,pw=password){await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(pw);await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();}
try{
 for(const [key,email] of Object.entries(emails)){const r=await post('register',{name:key,email,password,plan:'plus'});expect(r.status()).toBe(200);accounts.push({...await r.json(),password});}
 const sql=`UPDATE users SET role='admin' WHERE email='${emails.owner}'`;
 execFileSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--local','--command',sql],{stdio:'pipe',env:{...process.env,WRANGLER_LOG_PATH:resolve('.wrangler/logs')}});
 await context.clearCookies();await page.goto(origin+'/admin#admin-overview');
 await expect(page.getByRole('button',{name:'Entrar no painel',exact:true})).toBeVisible();await expect(page.locator('.admin-sections')).toBeHidden();checks++;
 await login(emails.owner,'synthetic-wrong-admin-password');await expect(page.locator('#admin-login-error')).toContainText('E-mail ou senha incorretos');await expect(page.getByLabel('Senha',{exact:true})).toHaveValue('');checks++;
 await login(emails.user);await expect(page.locator('#admin-login-error')).toContainText('não tem permissão');expect((await context.request.get(origin+'/api/me')).status()).toBe(401);checks++;
 await login(emails.owner);await expect(page.locator('#admin-overview')).toContainText('contas cadastradas');await expect(page.locator('#admin-session')).toContainText(emails.owner);checks++;
 await page.reload();await expect(page.locator('#admin-overview')).toContainText('contas cadastradas');checks++;
 await mkdir('qa/admin',{recursive:true});await page.screenshot({path:'qa/admin/overview-desktop.png',fullPage:true});
 await page.locator('[data-nav="planos"]').click();await expect(page.locator('[data-save-state]')).toHaveText('Nenhuma alteração pendente.');
 await page.getByLabel('Mensagens de IA por mês').first().fill('321');await expect(page.locator('[data-save-state]')).toHaveText('Alterações não salvas');await expect(page.locator('[data-plan-limit]').first()).toContainText('321');
 await page.getByRole('button',{name:'Salvar os três planos',exact:true}).click();await expect(page.locator('#admin-status')).toContainText('Planos atualizados');await expect(page.locator('[data-save-state]')).toHaveText('Nenhuma alteração pendente.');await page.screenshot({path:'qa/admin/plans-desktop.png',fullPage:true});checks++;
 await page.locator('[data-nav="contas"]').click();
 await page.getByRole('searchbox',{name:'Buscar por nome ou e-mail'}).fill(emails.user);await page.getByRole('button',{name:'Buscar contas',exact:true}).click();await expect(page.locator('#admin-users')).toContainText('1 conta encontrada');checks++;
 await page.getByRole('button',{name:'Gerenciar',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText(emails.user);await expect(dialog.locator('[data-preview]')).toContainText('aguardando ativação');await dialog.getByRole('radio',{name:'Ativo Libera a IA'}).check();await expect(dialog.locator('[data-preview]')).toContainText('ativo até');await page.screenshot({path:'qa/admin/account-drawer-desktop.png'});
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'Gerenciar',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Ativar',exact:true}).click();await expect(page.locator('#admin-status')).toContainText('liberado até');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#admin-users')).toContainText('Ativo');checks++;
 await page.locator('[data-user-filter="pending"]').click();await expect(page.locator('#admin-users')).not.toContainText(emails.user);await page.locator('[data-user-filter="active"]').click();await expect(page.locator('#admin-users')).toContainText(emails.user);await expect(page).toHaveURL(/#\/contas\?status=active$/);checks++;
 expect((await post('admin/subscription',{userId:accounts[1].user.id,plan:'plus',status:'canceled',days:30})).status()).toBe(200);
 await page.locator('[data-nav="atividade"]').click();await expect(page.locator('#admin-activity')).toContainText(emails.user);await expect(page.locator('#admin-activity')).toContainText('catálogo de planos');checks++;
 await page.locator('[data-nav="feedback"]').click();await expect(page.locator('[data-feedback-filter="novo"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#admin-feedback [data-feedback-list]')).not.toContainText('Carregando');checks++;
 await page.setViewportSize({width:390,height:844});
 for(const view of ['inicio','contas','planos','feedback','atividade']){await page.goto(origin+'/admin#/'+view);await expect(page.locator(`[data-nav="${view}"]`)).toHaveAttribute('aria-current','page');await page.waitForTimeout(400);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`qa/admin/${view}-mobile.png`,fullPage:true});}
 checks++;await page.setViewportSize({width:1366,height:900});await page.goto(origin+'/admin');
 await page.goto(origin+'/#/perfil');await expect(page.getByRole('link',{name:'Abrir painel administrativo'})).toBeVisible();await page.getByRole('link',{name:'Abrir painel administrativo'}).click();await expect(page.locator('#admin-overview')).toContainText('contas cadastradas');checks++;
 await post('logout',{});await page.locator('[data-nav="contas"]').click();await expect(page.locator('#admin-login-error')).toContainText('Sua sessão terminou');await expect(page.locator('.admin-sections')).toBeHidden();checks++;
 await login(emails.owner);await expect(page.locator('#admin-session')).toBeVisible();await page.getByRole('button',{name:'Sair do painel',exact:true}).click();await expect(page.locator('#admin-login-form')).toBeVisible();expect((await context.request.get(origin+'/api/admin/overview')).status()).toBe(401);checks++;
 await post('login',{email:emails.user,password});await page.reload();await expect(page.getByText('Esta conta não tem acesso administrativo.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Sair e usar outra conta'}).click();await expect(page.locator('#admin-login-form')).toBeVisible();checks++;
 await page.getByRole('button',{name:'Recuperar acesso com meu código'}).click();await expect(page.getByRole('link',{name:'Voltar ao login'})).toHaveAttribute('href','/admin');
 await page.getByLabel('E-mail',{exact:true}).fill(emails.owner);await page.getByLabel('Código de recuperação').fill(accounts[0].recoveryCode);await page.getByLabel('Nova senha').fill(nextPassword);await page.getByRole('button',{name:'Recuperar conta',exact:true}).click();await expect(page.getByRole('heading',{name:'Guarde seu código de recuperação.'})).toBeVisible();accounts[0].password=nextPassword;
 await page.getByRole('button',{name:'Já guardei. Continuar'}).click();await expect(page.locator('#admin-login-form')).toBeVisible();await login(emails.owner,nextPassword);await expect(page.locator('#admin-session')).toBeVisible();checks++;
 await page.getByRole('button',{name:'Sair do painel',exact:true}).click();await page.route('**/api/me',route=>route.abort());await page.reload();await expect(page.getByRole('heading',{name:'Não foi possível abrir o painel.'})).toBeVisible();await page.unroute('**/api/me');await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.locator('#admin-login-form')).toBeVisible();checks++;
 await mkdir('qa/admin',{recursive:true});await page.screenshot({path:'qa/admin/login-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#admin-login-form')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/admin/login-mobile.png',fullPage:true});checks++;
 expect(errors).toEqual([]);
 const safari=await webkit.launch();try{const tab=await safari.newPage({viewport:{width:390,height:844}});await tab.goto(origin+'/admin');await expect(tab.locator('#admin-login-form')).toBeVisible();checks++;}finally{await safari.close();}
 console.log(`${checks} verificações de administração passaram (Chromium e WebKit); capturas em qa/admin.`);
}finally{
 for(const account of accounts){await post('login',{email:account.user.email,password:account.password});const deleted=await context.request.delete(origin+'/api/account',{headers:{Origin:origin},data:{password:account.password}});if(deleted.status()!==200)throw Error('Não foi possível remover a conta sintética deste ensaio: '+deleted.status());}
 await browser.close();
}
