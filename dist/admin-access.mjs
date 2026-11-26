import {api,send,recoveryForm} from './platform.mjs';
import {escapeHtml as esc} from './core.mjs';

export function showAdminLogin(root,onLogin,message=''){
 root.innerHTML=`<section class="card admin-access" aria-labelledby="admin-login-title"><p class="eyebrow">ADMIN MASTER</p><h2 id="admin-login-title">Entre na administração.</h2><p>Use o e-mail e a senha da sua conta autorizada.</p><form id="admin-login-form"><label>E-mail<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label><p id="admin-login-error" role="alert">${esc(message)}</p><button class="primary" type="submit">Entrar no painel</button><button class="text-link" id="admin-recover" type="button">Recuperar acesso com meu código</button></form><p class="small muted">A permissão de administração é concedida ao proprietário após o cadastro da conta.</p><a href="/#acesso">Criar ou acessar minha conta Mentra</a></section>`;
 root.querySelector('#admin-login-form').onsubmit=async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]'),error=root.querySelector('#admin-login-error');button.disabled=true;error.textContent='';
  try{const result=await send('login',Object.fromEntries(new FormData(form)));if(result.user.role!=='admin'){await send('logout',{});throw Object.assign(Error('Esta conta não tem permissão de administração.'),{status:403});}form.reset();await onLogin();}
  catch(e){error.textContent=e.message;if(e.status===401)form.elements.password.value='';}
  finally{if(button.isConnected)button.disabled=false;}
 };
 root.querySelector('#admin-recover').onclick=()=>recoveryForm(root,'/admin');
}

export function showAdminDenied(root,user,onSwitch){
 root.innerHTML=`<section class="card admin-access"><h2>Esta conta não tem acesso administrativo.</h2><p>Você está conectado como <strong>${esc(user.email)}</strong>.</p><p>Entre com a conta autorizada para gerenciar a Mentra.</p><button class="primary" type="button" id="admin-switch">Sair e usar outra conta</button><p role="alert" id="admin-switch-error"></p><a href="/">Voltar à minha conta</a></section>`;
 root.querySelector('#admin-switch').onclick=async event=>{event.target.disabled=true;try{await send('logout',{});await onSwitch();}catch(e){root.querySelector('#admin-switch-error').textContent=e.message;event.target.disabled=false;}};
}

export async function adminSession(){return (await api('me')).user;}
