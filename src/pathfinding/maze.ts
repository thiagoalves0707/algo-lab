import { type Grid, toIndex } from './grid';

/**
 * Gerador de labirinto por "recursive backtracker" (DFS aleatório).
 *
 * Pensa na grade como salas (células de linha e coluna ímpares) separadas
 * por paredes. Partimos com tudo fechado e "cavamos": a partir de uma sala,
 * escolhemos um vizinho ainda não visitado, derrubamos a parede entre os
 * dois e seguimos. Quando trava, voltamos (backtrack). O resultado é um
 * labirinto perfeito: existe exatamente um caminho entre quaisquer 2 salas.
 *
 * Cada `yield` devolve uma célula cavada, pra view animar a escavação.
 * Quem chama deve preencher `g.walls` com 1 antes.
 */
export function* recursiveBacktracker(g: Grid): Generator<number, void> {
  const visited = new Uint8Array(g.rows * g.cols);
  const stack: Array<[number, number]> = [[1, 1]];
  visited[toIndex(g, 1, 1)] = 1;
  yield carve(g, 1, 1);

  const dirs = [
    [-2, 0],
    [0, 2],
    [2, 0],
    [0, -2],
  ];

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const options = dirs
      .map(([dr, dc]) => [r + dr, c + dc] as const)
      .filter(
        ([nr, nc]) =>
          nr > 0 && nc > 0 && nr < g.rows - 1 && nc < g.cols - 1 && !visited[toIndex(g, nr, nc)],
      );

    if (options.length === 0) {
      stack.pop(); // beco sem saída: volta um passo
      continue;
    }

    const [nr, nc] = options[Math.floor(Math.random() * options.length)];
    visited[toIndex(g, nr, nc)] = 1;
    yield carve(g, (r + nr) / 2, (c + nc) / 2); // derruba a parede do meio
    yield carve(g, nr, nc);
    stack.push([nr, nc]);
  }
}

function carve(g: Grid, r: number, c: number): number {
  const i = toIndex(g, r, c);
  g.walls[i] = 0;
  return i;
}

/** Espalha obstáculos aleatórios (paredes ou lama) numa densidade dada. */
export function scatter(g: Grid, density: number, keep: number[]): number[] {
  const changed: number[] = [];
  for (let i = 0; i < g.rows * g.cols; i++) {
    if (keep.includes(i)) continue;
    if (Math.random() < density) changed.push(i);
  }
  return changed;
}
