// Movimento de troca de tela: marca o documento por um instante após mudar de rota,
// para que a entrada suave dos blocos aconteça só na navegação e não a cada atualização.
const root = document.documentElement;
let timer = 0, lastSection = '';
const section = () => (location.hash.replace(/^#\/?/, '').split('/').slice(0, 2).join('/')) || 'hoje';

function enter() {
  const current = section();
  if (current === lastSection) return;
  lastSection = current;
  root.classList.remove('route-enter');
  // Reinicia as animações mesmo quando a classe já estava aplicada.
  void root.offsetWidth;
  root.classList.add('route-enter');
  clearTimeout(timer);
  timer = setTimeout(() => root.classList.remove('route-enter'), 1100);
}

window.addEventListener('hashchange', enter);
enter();
