// A local reading preference, available before and after signing in.
const key = 'mentra-reading-comfort';
let enlarged = false;
try { enlarged = localStorage.getItem(key) === 'large'; } catch {}
const control = document.createElement('button');
control.type = 'button';
control.className = 'reading-control';
function update() {
  document.documentElement.classList.toggle('reading-large', enlarged);
  control.setAttribute('aria-pressed', String(enlarged));
  control.setAttribute('aria-label', 'Leitura ampliada');
  control.innerHTML = '<span aria-hidden="true">Aa</span><span>Leitura ampliada</span>';
}
update();
control.addEventListener('click', () => {
  enlarged = !enlarged;
  update();
  try { localStorage.setItem(key, enlarged ? 'large' : 'standard'); } catch {}
});
document.body.append(control);
function placeControl() {
  const destination = document.querySelector('.top-actions, .portal-nav');
  if (destination && control.parentElement !== destination) destination.prepend(control);
  control.classList.toggle('reading-inline', !!destination);
}
new MutationObserver(placeControl).observe(document.querySelector('#app'), { childList: true, subtree: true });
placeControl();
