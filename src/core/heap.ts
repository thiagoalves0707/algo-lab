/**
 * Fila de prioridade (min-heap binário).
 *
 * Dijkstra, A* e Busca Gulosa precisam sempre pegar "o próximo nó mais
 * barato". Um array ordenado faria isso em O(n) por inserção; o heap faz
 * em O(log n), o que deixa a visualização fluida mesmo em grades grandes.
 *
 * Guardamos itens e prioridades em arrays paralelos pra evitar criar
 * um objeto por inserção (menos lixo pro garbage collector).
 */
export class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.prio.push(priority);
    this.siftUp(this.items.length - 1);
  }

  /** Remove e devolve o item de menor prioridade. */
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.prio[l] < this.prio[smallest]) smallest = l;
      if (r < n && this.prio[r] < this.prio[smallest]) smallest = r;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
