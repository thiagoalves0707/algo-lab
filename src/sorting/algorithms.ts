/**
 * Algoritmos de ordenação escritos como generators.
 *
 * Eles ordenam o array DE VERDADE (in-place) e dão `yield` em cada
 * comparação e escrita, pra view destacar as barras envolvidas.
 */
export type SortEvent =
  | { type: 'compare'; a: number; b: number }
  | { type: 'swap'; a: number; b: number }
  | { type: 'set'; i: number };

export interface SortAlgorithm {
  id: string;
  name: string;
  best: string;
  average: string;
  worst: string;
  memory: string;
  stable: boolean;
  description: string;
  run: (arr: number[]) => Generator<SortEvent, void>;
}

type Gen = Generator<SortEvent, void>;

function swap(arr: number[], a: number, b: number): SortEvent {
  [arr[a], arr[b]] = [arr[b], arr[a]];
  return { type: 'swap', a, b };
}

const cmp = (a: number, b: number): SortEvent => ({ type: 'compare', a, b });

function* bubbleSort(arr: number[]): Gen {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      yield cmp(j, j + 1);
      if (arr[j] > arr[j + 1]) {
        yield swap(arr, j, j + 1);
        swapped = true;
      }
    }
    if (!swapped) return; // passou sem trocar nada? já está ordenado
  }
}

function* selectionSort(arr: number[]): Gen {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) {
      yield cmp(min, j);
      if (arr[j] < arr[min]) min = j;
    }
    if (min !== i) yield swap(arr, i, min);
  }
}

function* insertionSort(arr: number[]): Gen {
  for (let i = 1; i < arr.length; i++) {
    // "Afunda" o elemento i até achar o lugar dele na parte já ordenada.
    for (let j = i; j > 0; j--) {
      yield cmp(j - 1, j);
      if (arr[j - 1] <= arr[j]) break;
      yield swap(arr, j - 1, j);
    }
  }
}

function* mergeSort(arr: number[], lo = 0, hi = arr.length - 1): Gen {
  if (lo >= hi) return;
  const mid = (lo + hi) >> 1;
  yield* mergeSort(arr, lo, mid);
  yield* mergeSort(arr, mid + 1, hi);

  // Intercala as duas metades ordenadas usando cópias auxiliares — por
  // isso o Merge Sort usa O(n) de memória extra.
  const left = arr.slice(lo, mid + 1);
  const right = arr.slice(mid + 1, hi + 1);
  let i = 0;
  let j = 0;
  let k = lo;
  while (i < left.length && j < right.length) {
    yield cmp(k, mid + 1 + j);
    arr[k] = left[i] <= right[j] ? left[i++] : right[j++];
    yield { type: 'set', i: k++ };
  }
  while (i < left.length) {
    arr[k] = left[i++];
    yield { type: 'set', i: k++ };
  }
  while (j < right.length) {
    arr[k] = right[j++];
    yield { type: 'set', i: k++ };
  }
}

function* quickSort(arr: number[], lo = 0, hi = arr.length - 1): Gen {
  if (lo >= hi) return;
  // Pivô aleatório: evita o pior caso O(n²) quando o array já vem ordenado.
  const p = lo + Math.floor(Math.random() * (hi - lo + 1));
  if (p !== hi) yield swap(arr, p, hi);
  const pivot = arr[hi];

  // Partição de Lomuto: tudo menor que o pivô vai pra esquerda de `i`.
  let i = lo;
  for (let j = lo; j < hi; j++) {
    yield cmp(j, hi);
    if (arr[j] < pivot) {
      if (i !== j) yield swap(arr, i, j);
      i++;
    }
  }
  if (i !== hi) yield swap(arr, i, hi);

  yield* quickSort(arr, lo, i - 1);
  yield* quickSort(arr, i + 1, hi);
}

/** Faz o elemento em `root` descer no heap até respeitar a regra pai ≥ filhos. */
function* siftDown(arr: number[], root: number, end: number): Gen {
  for (;;) {
    const child = 2 * root + 1;
    if (child > end) return;
    let biggest = root;
    yield cmp(biggest, child);
    if (arr[child] > arr[biggest]) biggest = child;
    if (child + 1 <= end) {
      yield cmp(biggest, child + 1);
      if (arr[child + 1] > arr[biggest]) biggest = child + 1;
    }
    if (biggest === root) return;
    yield swap(arr, root, biggest);
    root = biggest;
  }
}

function* heapSort(arr: number[]): Gen {
  const n = arr.length;
  // 1) Transforma o array num max-heap.
  for (let start = (n - 2) >> 1; start >= 0; start--) yield* siftDown(arr, start, n - 1);
  // 2) Tira o maior (topo) e coloca no fim, repetidamente.
  for (let end = n - 1; end > 0; end--) {
    yield swap(arr, 0, end);
    yield* siftDown(arr, 0, end - 1);
  }
}

export const SORT_ALGORITHMS: SortAlgorithm[] = [
  {
    id: 'quick',
    name: 'Quick Sort',
    best: 'n log n',
    average: 'n log n',
    worst: 'n²',
    memory: 'log n',
    stable: false,
    description:
      'Escolhe um pivô, joga os menores pra esquerda e os maiores pra direita, e repete em cada lado. Na prática é um dos mais rápidos que existem.',
    run: (a) => quickSort(a),
  },
  {
    id: 'merge',
    name: 'Merge Sort',
    best: 'n log n',
    average: 'n log n',
    worst: 'n log n',
    memory: 'n',
    stable: true,
    description:
      'Divide o array no meio até sobrar pedaços de 1 elemento, depois intercala tudo de volta já em ordem. Previsível: sempre n log n.',
    run: (a) => mergeSort(a),
  },
  {
    id: 'heap',
    name: 'Heap Sort',
    best: 'n log n',
    average: 'n log n',
    worst: 'n log n',
    memory: '1',
    stable: false,
    description:
      'Organiza o array como uma árvore (heap) onde o pai é sempre maior que os filhos, e vai arrancando o maior do topo. n log n sem memória extra.',
    run: heapSort,
  },
  {
    id: 'insertion',
    name: 'Insertion Sort',
    best: 'n',
    average: 'n²',
    worst: 'n²',
    memory: '1',
    stable: true,
    description:
      'Igual a ordenar cartas na mão: pega um elemento e encaixa no lugar certo entre os anteriores. Lento no geral, mas voa em arrays quase ordenados.',
    run: insertionSort,
  },
  {
    id: 'selection',
    name: 'Selection Sort',
    best: 'n²',
    average: 'n²',
    worst: 'n²',
    memory: '1',
    stable: false,
    description:
      'Procura o menor elemento e coloca na primeira posição, depois o segundo menor, e assim por diante. Faz poucas trocas, mas compara demais.',
    run: selectionSort,
  },
  {
    id: 'bubble',
    name: 'Bubble Sort',
    best: 'n',
    average: 'n²',
    worst: 'n²',
    memory: '1',
    stable: true,
    description:
      'Compara vizinhos e troca se estiverem fora de ordem; os maiores vão "borbulhando" pro fim. O clássico de faculdade — e o mais lento daqui.',
    run: bubbleSort,
  },
];
