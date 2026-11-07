/**
 * Representação da grade usada pelos algoritmos de busca.
 *
 * Em vez de uma matriz de objetos, usamos arrays "achatados": a célula
 * (linha, coluna) vira o índice `linha * cols + coluna`. Assim os
 * algoritmos trabalham só com inteiros e typed arrays — rápido e simples.
 */
export interface Grid {
  rows: number;
  cols: number;
  /** 1 = parede, 0 = livre */
  walls: Uint8Array;
  /** 1 = lama: atravessar custa WEIGHT_COST em vez de 1 */
  weights: Uint8Array;
}

export const WEIGHT_COST = 5;

export function createGrid(rows: number, cols: number): Grid {
  return {
    rows,
    cols,
    walls: new Uint8Array(rows * cols),
    weights: new Uint8Array(rows * cols),
  };
}

export const toIndex = (g: Grid, r: number, c: number): number => r * g.cols + c;
export const rowOf = (g: Grid, i: number): number => Math.floor(i / g.cols);
export const colOf = (g: Grid, i: number): number => i % g.cols;

/** Vizinhos andáveis (cima, direita, baixo, esquerda) — sem diagonais. */
export function neighbors(g: Grid, i: number): number[] {
  const r = rowOf(g, i);
  const c = colOf(g, i);
  const out: number[] = [];
  if (r > 0) out.push(i - g.cols);
  if (c < g.cols - 1) out.push(i + 1);
  if (r < g.rows - 1) out.push(i + g.cols);
  if (c > 0) out.push(i - 1);
  return out.filter((n) => g.walls[n] === 0);
}

/** Custo pra ENTRAR na célula `i`. */
export const stepCost = (g: Grid, i: number): number => (g.weights[i] ? WEIGHT_COST : 1);

/** Distância de Manhattan: heurística admissível pra grade sem diagonais. */
export function manhattan(g: Grid, a: number, b: number): number {
  return Math.abs(rowOf(g, a) - rowOf(g, b)) + Math.abs(colOf(g, a) - colOf(g, b));
}
