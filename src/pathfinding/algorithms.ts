import { MinHeap } from '../core/heap';
import { type Grid, manhattan, neighbors, stepCost } from './grid';

/**
 * Eventos emitidos pelos algoritmos. A view só escuta isso — os
 * algoritmos não sabem nada de canvas, cores ou animação.
 */
export type PathEvent =
  | { type: 'frontier'; cell: number } // entrou na fila pra ser explorado
  | { type: 'visit'; cell: number } // foi de fato explorado
  | { type: 'done'; path: number[] | null; cost: number };

export interface PathAlgorithm {
  id: string;
  name: string;
  /** Considera o custo da lama? */
  weighted: boolean;
  /** Garante o menor caminho? */
  optimal: boolean;
  description: string;
  run: (g: Grid, start: number, end: number) => Generator<PathEvent, void>;
}

/** Volta pelos "pais" de cada nó, do fim até o início, pra montar o caminho. */
function buildPath(prev: Int32Array, start: number, end: number): number[] {
  const path: number[] = [];
  for (let cur = end; cur !== -1; cur = prev[cur]) {
    path.push(cur);
    if (cur === start) break;
  }
  return path.reverse();
}

function pathCost(g: Grid, path: number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += stepCost(g, path[i]);
  return total;
}

function finish(g: Grid, prev: Int32Array, start: number, end: number): PathEvent {
  const path = buildPath(prev, start, end);
  return { type: 'done', path, cost: pathCost(g, path) };
}

// ─────────────────────────────────────────────────────────────────────
// Busca em Largura (BFS): explora em "ondas". Menor nº de passos, mas
// ignora pesos — por isso atravessa a lama sem dó.
// ─────────────────────────────────────────────────────────────────────
function* bfs(g: Grid, start: number, end: number): Generator<PathEvent, void> {
  const n = g.rows * g.cols;
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const queue = [start];
  seen[start] = 1;

  // `head` em vez de queue.shift(): shift é O(n) e deixaria tudo lento.
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    yield { type: 'visit', cell: cur };
    if (cur === end) {
      yield finish(g, prev, start, end);
      return;
    }
    for (const nb of neighbors(g, cur)) {
      if (seen[nb]) continue;
      seen[nb] = 1;
      prev[nb] = cur;
      queue.push(nb);
      yield { type: 'frontier', cell: nb };
    }
  }
  yield { type: 'done', path: null, cost: 0 };
}

// ─────────────────────────────────────────────────────────────────────
// Busca em Profundidade (DFS): vai fundo num caminho antes de voltar.
// Acha *um* caminho, quase nunca o melhor — ótimo pra comparar.
// ─────────────────────────────────────────────────────────────────────
function* dfs(g: Grid, start: number, end: number): Generator<PathEvent, void> {
  const n = g.rows * g.cols;
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  // Cada entrada da pilha guarda [célula, de onde veio].
  const stack: Array<[number, number]> = [[start, -1]];

  while (stack.length > 0) {
    const [cur, from] = stack.pop()!;
    if (visited[cur]) continue;
    visited[cur] = 1;
    prev[cur] = from;
    yield { type: 'visit', cell: cur };
    if (cur === end) {
      yield finish(g, prev, start, end);
      return;
    }
    // Invertemos pra que "cima" seja explorado primeiro (sai por último do push).
    const nbs = neighbors(g, cur).reverse();
    for (const nb of nbs) {
      if (visited[nb]) continue;
      stack.push([nb, cur]);
      yield { type: 'frontier', cell: nb };
    }
  }
  yield { type: 'done', path: null, cost: 0 };
}

/**
 * Motor genérico de "melhor primeiro". Dijkstra, A* e Gulosa são o MESMO
 * algoritmo — só muda a função que dá a prioridade de cada nó:
 *
 *   Dijkstra → custo até aqui            g(n)
 *   A*       → custo até aqui + estimativa  g(n) + h(n)
 *   Gulosa   → só a estimativa           h(n)
 */
function* bestFirst(
  g: Grid,
  start: number,
  end: number,
  priority: (costSoFar: number, cell: number) => number,
): Generator<PathEvent, void> {
  const n = g.rows * g.cols;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();

  dist[start] = 0;
  heap.push(start, priority(0, start));

  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue; // entrada antiga e "vencida" no heap
    closed[cur] = 1;
    yield { type: 'visit', cell: cur };

    if (cur === end) {
      yield finish(g, prev, start, end);
      return;
    }

    for (const nb of neighbors(g, cur)) {
      if (closed[nb]) continue;
      const nd = dist[cur] + stepCost(g, nb);
      if (nd < dist[nb]) {
        dist[nb] = nd;
        prev[nb] = cur;
        heap.push(nb, priority(nd, nb));
        yield { type: 'frontier', cell: nb };
      }
    }
  }
  yield { type: 'done', path: null, cost: 0 };
}

export const PATH_ALGORITHMS: PathAlgorithm[] = [
  {
    id: 'astar',
    name: 'A* (A-estrela)',
    weighted: true,
    optimal: true,
    description:
      'O queridinho dos games. Soma o custo já percorrido com uma estimativa até o destino (distância de Manhattan) e vai direto ao ponto sem perder a garantia do menor caminho.',
    run: (g, s, e) =>
      // O pequeno extra em h desempata a favor de quem está mais perto do fim,
      // o que deixa a busca bem mais "reta" sem perder a otimalidade na prática.
      bestFirst(g, s, e, (cost, cell) => {
        const h = manhattan(g, cell, e);
        return cost + h + h * 1e-3;
      }),
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    weighted: true,
    optimal: true,
    description:
      'O pai de todos (1956). Expande sempre o nó mais barato a partir da origem. Garante o menor caminho com pesos, mas não tem noção de onde está o destino — explora em todas as direções.',
    run: (g, s, e) => bestFirst(g, s, e, (cost) => cost),
  },
  {
    id: 'greedy',
    name: 'Busca Gulosa',
    weighted: true,
    optimal: false,
    description:
      'Só olha pra estimativa até o destino e corre na direção dele. Muito rápida, mas cai em armadilhas: o caminho achado pode ser bem pior que o ideal.',
    run: (g, s, e) => bestFirst(g, s, e, (_cost, cell) => manhattan(g, cell, e)),
  },
  {
    id: 'bfs',
    name: 'Busca em Largura (BFS)',
    weighted: false,
    optimal: true,
    description:
      'Explora em ondas, camada por camada. Garante o caminho com menos passos, mas ignora a lama — passa por ela como se fosse chão normal.',
    run: bfs,
  },
  {
    id: 'dfs',
    name: 'Busca em Profundidade (DFS)',
    weighted: false,
    optimal: false,
    description:
      'Vai fundo num caminho até travar, aí volta e tenta outro. Encontra uma saída, mas quase sempre faz um zigue-zague enorme. Ótimo pra ver por que ninguém usa DFS no GPS.',
    run: dfs,
  },
];
