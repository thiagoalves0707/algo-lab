import './style.css';
import { PathfindingView } from './pathfinding/view';
import { SortingView } from './sorting/view';

/**
 * Ponto de entrada: cria as duas telas e cuida da troca de abas.
 */
const pathfinding = new PathfindingView();
let sorting: SortingView | null = null; // criada só quando a aba abre (canvas precisa estar visível)

function showTab(tab: string): void {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.getElementById('panel-path')!.classList.toggle('active', tab === 'path');
  document.getElementById('panel-sort')!.classList.toggle('active', tab === 'sort');
  if (tab === 'sort') sorting ??= new SortingView();
  history.replaceState(null, '', tab === 'sort' ? '#ordenacao' : '#');
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
  b.addEventListener('click', () => showTab(b.dataset.tab!)),
);

// Atalho: barra de espaço roda/para a visualização da aba atual.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || (e.target as HTMLElement).matches('input, select, button')) return;
  e.preventDefault();
  const sortActive = document.getElementById('panel-sort')!.classList.contains('active');
  document.getElementById(sortActive ? 'so-run' : 'pf-run')!.click();
});

if (location.hash === '#ordenacao') showTab('sort');

// `?demo` deixa um labirinto resolvido na tela — usado pra gerar os prints do README.
if (new URLSearchParams(location.search).has('demo')) {
  requestAnimationFrame(() => pathfinding.demo());
}
