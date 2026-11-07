import { Animator } from '../core/animator';
import { cssVar, easeOutBack, fitCanvas, hexToRgb, mix, roundRect } from '../core/canvas';
import { PATH_ALGORITHMS, type PathAlgorithm, type PathEvent } from './algorithms';
import { colOf, createGrid, type Grid, rowOf, toIndex } from './grid';
import { recursiveBacktracker, scatter } from './maze';

/** Estado visual de cada célula. */
const VIS = { none: 0, frontier: 1, visited: 2, path: 3 } as const;

type ViewEvent =
  | PathEvent
  | { type: 'path-cell'; cell: number }
  | { type: 'carve'; cell: number };

type Drag = null | 'start' | 'end' | 'paint';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Tela de Pathfinding: desenha a grade, trata mouse/toque e conecta o
 * algoritmo escolhido ao animador.
 */
export class PathfindingView {
  private readonly canvas = $<HTMLCanvasElement>('pf-canvas');
  private ctx!: CanvasRenderingContext2D;
  private grid: Grid = createGrid(1, 1);
  private start = 0;
  private end = 0;

  /** Estado visual + momento em que mudou (pra animar o "pop" das células). */
  private vis = new Uint8Array(0);
  private stamp = new Float32Array(0);
  private lastStamp = 0;
  /** Células do caminho já reveladas, em ordem (pra desenhar a linha). */
  private pathCells: number[] = [];

  private cell = 24;
  private ox = 0;
  private oy = 0;
  private width = 0;
  private height = 0;

  private algo: PathAlgorithm = PATH_ALGORITHMS[0];
  private brush: 'wall' | 'weight' = 'wall';
  private mode: 'idle' | 'running' | 'maze' | 'done' = 'idle';
  private instant = false;
  private dirty = true;

  private drag: Drag = null;
  private paintValue = 1;
  private lastPointer: { x: number; y: number } | null = null;

  private stats = { visited: 0, length: 0, cost: 0, found: true, cpu: 0 };
  private readonly animator = new Animator<ViewEvent>(
    (e) => this.onEvent(e),
    () => this.onDone(),
  );

  private colors = this.readColors();

  constructor() {
    this.setupControls();
    this.setupPointer();
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement!);
    this.resize();
    requestAnimationFrame(this.frame);
  }

  // ───────────────────────────── setup ─────────────────────────────

  private readColors() {
    return {
      bg: cssVar('--grid-bg'),
      cell: cssVar('--grid-cell'),
      wall: cssVar('--wall'),
      mud: cssVar('--mud'),
      frontier: cssVar('--frontier'),
      visitNew: hexToRgb(cssVar('--visit-new')),
      visitOld: hexToRgb(cssVar('--visit-old')),
      path: cssVar('--path'),
      start: cssVar('--start'),
      end: cssVar('--end'),
    };
  }

  private setupControls(): void {
    const select = $<HTMLSelectElement>('pf-algo');
    select.innerHTML = PATH_ALGORITHMS.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
    select.addEventListener('change', () => {
      this.algo = PATH_ALGORITHMS.find((a) => a.id === select.value)!;
      this.renderAlgoInfo();
      if (this.mode === 'done') this.runInstant();
    });

    document.querySelectorAll<HTMLButtonElement>('#pf-brush button').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.brush = btn.dataset.brush as 'wall' | 'weight';
        document.querySelectorAll('#pf-brush button').forEach((b) => b.classList.toggle('on', b === btn));
      }),
    );

    const speed = $<HTMLInputElement>('pf-speed');
    const applySpeed = () => this.animator.setSpeed(Number(speed.value));
    speed.addEventListener('input', applySpeed);
    applySpeed();

    $('pf-run').addEventListener('click', () => (this.animator.running ? this.stop() : this.run()));
    $('pf-maze').addEventListener('click', () => this.generateMaze());
    $('pf-random').addEventListener('click', () => this.randomObstacles());
    $('pf-clear-path').addEventListener('click', () => this.clearPath());
    $('pf-clear').addEventListener('click', () => this.clearAll());

    this.renderAlgoInfo();
  }

  private setupPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      const i = this.cellAt(e.offsetX, e.offsetY);
      if (i < 0 || this.mode === 'maze') return;
      c.setPointerCapture(e.pointerId);
      this.lastPointer = { x: e.offsetX, y: e.offsetY };

      if (i === this.start) this.drag = 'start';
      else if (i === this.end) this.drag = 'end';
      else {
        this.drag = 'paint';
        const layer = this.brush === 'wall' ? this.grid.walls : this.grid.weights;
        this.paintValue = layer[i] ? 0 : 1; // clicou em algo pintado? vira borracha
        this.paint(i);
      }
    });

    c.addEventListener('pointermove', (e) => {
      if (!this.drag || !this.lastPointer) return;
      // Interpola entre a posição anterior e a atual pra não "pular"
      // células quando o mouse se move rápido.
      const { x: x0, y: y0 } = this.lastPointer;
      const steps = Math.max(1, Math.ceil(Math.hypot(e.offsetX - x0, e.offsetY - y0) / (this.cell / 3)));
      for (let s = 1; s <= steps; s++) {
        const x = x0 + ((e.offsetX - x0) * s) / steps;
        const y = y0 + ((e.offsetY - y0) * s) / steps;
        const i = this.cellAt(x, y);
        if (i >= 0) this.handleDrag(i);
      }
      this.lastPointer = { x: e.offsetX, y: e.offsetY };
    });

    const release = () => {
      this.drag = null;
      this.lastPointer = null;
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
  }

  private handleDrag(i: number): void {
    if (this.drag === 'paint') return this.paint(i);
    if (this.grid.walls[i] || i === this.start || i === this.end) return;
    if (this.drag === 'start') this.start = i;
    else this.end = i;
    this.afterEdit();
  }

  private paint(i: number): void {
    if (i === this.start || i === this.end) return;
    const g = this.grid;
    if (this.brush === 'wall') {
      if (g.walls[i] === this.paintValue) return;
      g.walls[i] = this.paintValue;
      g.weights[i] = 0;
    } else {
      if (g.weights[i] === this.paintValue) return;
      g.weights[i] = this.paintValue;
      g.walls[i] = 0;
    }
    this.mark(i);
    this.afterEdit();
  }

  /**
   * Depois de uma busca terminar, qualquer edição recalcula na hora,
   * sem animação. É isso que faz arrastar o ponto final parecer "mágica".
   */
  private afterEdit(): void {
    if (this.mode === 'running') this.clearPath();
    if (this.mode === 'done') this.runInstant();
    this.dirty = true;
  }

  // ─────────────────────────── geometria ───────────────────────────

  private resize(): void {
    const { w, h, ctx } = fitCanvas(this.canvas);
    this.ctx = ctx;
    this.width = w;
    this.height = h;
    this.colors = this.readColors();

    this.cell = w < 640 ? 18 : 24;
    // Linhas e colunas ímpares deixam o labirinto com bordas fechadas.
    let cols = Math.floor(w / this.cell);
    let rows = Math.floor(h / this.cell);
    if (cols % 2 === 0) cols--;
    if (rows % 2 === 0) rows--;
    cols = Math.max(cols, 5);
    rows = Math.max(rows, 5);

    // Só recria a grade se o tamanho mudou de fato.
    if (cols !== this.grid.cols || rows !== this.grid.rows) {
      this.animator.stop();
      this.grid = createGrid(rows, cols);
      this.vis = new Uint8Array(rows * cols);
      this.stamp = new Float32Array(rows * cols).fill(-1e9);
      const mid = this.odd(Math.floor(rows / 2));
      this.start = toIndex(this.grid, mid, this.odd(Math.floor(cols * 0.18)));
      this.end = toIndex(this.grid, mid, this.odd(Math.floor(cols * 0.82)));
      this.mode = 'idle';
      this.resetStats();
    }
    this.ox = Math.floor((w - cols * this.cell) / 2);
    this.oy = Math.floor((h - rows * this.cell) / 2);
    this.dirty = true;
  }

  /** Arredonda pra um índice ímpar válido (as "salas" do labirinto). */
  private odd(n: number): number {
    return n % 2 === 0 ? Math.max(1, n - 1) : n;
  }

  private cellAt(x: number, y: number): number {
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    if (r < 0 || c < 0 || r >= this.grid.rows || c >= this.grid.cols) return -1;
    return toIndex(this.grid, r, c);
  }

  // ──────────────────────────── ações ─────────────────────────────

  run(): void {
    this.animator.stop();
    this.clearVis();
    this.mode = 'running';
    this.measureCpu();
    this.animator.start(this.withPathReveal(this.algo.run(this.grid, this.start, this.end)));
    this.updateRunButton();
  }

  stop(): void {
    this.animator.stop();
    this.mode = 'idle';
    this.updateRunButton();
  }

  /** Roda a busca inteira de uma vez, sem animação. */
  runInstant(): void {
    this.animator.stop();
    this.clearVis();
    this.instant = true;
    for (const ev of this.algo.run(this.grid, this.start, this.end)) {
      this.onEvent(ev);
      if (ev.type === 'done' && ev.path) ev.path.forEach((cell) => this.onEvent({ type: 'path-cell', cell }));
    }
    this.instant = false;
    this.measureCpu();
    this.mode = 'done';
    this.renderStats();
    this.updateRunButton();
  }

  generateMaze(instant = false): void {
    this.animator.stop();
    this.clearVis();
    const g = this.grid;
    g.walls.fill(1);
    g.weights.fill(0);
    // Início e fim precisam estar numa "sala" (coordenadas ímpares).
    this.start = toIndex(g, this.odd(rowOf(g, this.start)), this.odd(colOf(g, this.start)));
    this.end = toIndex(g, this.odd(rowOf(g, this.end)), this.odd(colOf(g, this.end)));

    const carve = (function* (gen: Generator<number, void>) {
      for (const cell of gen) yield { type: 'carve', cell } as ViewEvent;
    })(recursiveBacktracker(g));

    if (instant) {
      for (const _ of carve) void _;
      this.mode = 'idle';
      this.dirty = true;
      return;
    }
    this.mode = 'maze';
    this.animator.setSpeed(9);
    this.animator.start(carve);
    this.updateRunButton();
  }

  private randomObstacles(): void {
    this.animator.stop();
    this.clearVis();
    const g = this.grid;
    g.walls.fill(0);
    g.weights.fill(0);
    const keep = [this.start, this.end];
    for (const i of scatter(g, 0.26, keep)) g.walls[i] = 1;
    for (const i of scatter(g, 0.08, keep)) if (!g.walls[i]) g.weights[i] = 1;
    // Anima as paredes surgindo em ondas da esquerda pra direita.
    const now = performance.now();
    for (let i = 0; i < g.walls.length; i++) {
      if (g.walls[i] || g.weights[i]) this.stamp[i] = now + colOf(g, i) * 8;
    }
    this.lastStamp = now + g.cols * 8;
    this.mode = 'idle';
    this.updateRunButton();
  }

  clearPath(): void {
    this.animator.stop();
    this.clearVis();
    this.mode = 'idle';
    this.updateRunButton();
  }

  private clearAll(): void {
    this.grid.walls.fill(0);
    this.grid.weights.fill(0);
    this.clearPath();
  }

  private clearVis(): void {
    this.vis.fill(0);
    this.pathCells = [];
    this.resetStats();
    this.dirty = true;
  }

  /** Mede o tempo REAL de CPU do algoritmo (sem a animação). */
  private measureCpu(): void {
    const t0 = performance.now();
    for (const _ of this.algo.run(this.grid, this.start, this.end)) void _;
    this.stats.cpu = performance.now() - t0;
  }

  /** Depois que a busca acha o destino, revela o caminho célula a célula. */
  private *withPathReveal(gen: Generator<PathEvent, void>): Generator<ViewEvent, void> {
    for (const ev of gen) {
      yield ev;
      if (ev.type === 'done' && ev.path) for (const cell of ev.path) yield { type: 'path-cell', cell };
    }
  }

  // ─────────────────────────── eventos ────────────────────────────

  private onEvent(e: ViewEvent): void {
    switch (e.type) {
      case 'visit':
        this.vis[e.cell] = VIS.visited;
        this.stats.visited++;
        this.mark(e.cell);
        break;
      case 'frontier':
        if (this.vis[e.cell] === VIS.none) {
          this.vis[e.cell] = VIS.frontier;
          this.mark(e.cell);
        }
        break;
      case 'path-cell':
        this.vis[e.cell] = VIS.path;
        this.pathCells.push(e.cell);
        this.mark(e.cell);
        break;
      case 'carve':
        this.mark(e.cell);
        break;
      case 'done':
        this.stats.found = e.path !== null;
        this.stats.length = e.path ? e.path.length - 1 : 0;
        this.stats.cost = e.cost;
        break;
    }
    if (!this.instant && e.type !== 'carve') this.renderStats();
  }

  private onDone(): void {
    this.mode = this.mode === 'maze' ? 'idle' : 'done';
    this.animator.setSpeed(Number($<HTMLInputElement>('pf-speed').value));
    this.renderStats();
    this.updateRunButton();
  }

  private mark(i: number): void {
    const now = this.instant ? -1e9 : performance.now();
    this.stamp[i] = now;
    if (now > this.lastStamp) this.lastStamp = now;
    this.dirty = true;
  }

  // ──────────────────────────── desenho ───────────────────────────

  private frame = (now: number): void => {
    // Só redesenha quando algo mudou ou ainda tem célula animando.
    if (this.dirty || now - this.lastStamp < 700) {
      this.draw(now);
      this.dirty = false;
    }
    requestAnimationFrame(this.frame);
  };

  private draw(now: number): void {
    const { ctx, grid: g, cell: cs, colors: k } = this;
    ctx.fillStyle = k.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    for (let i = 0; i < g.rows * g.cols; i++) {
      const x = this.ox + colOf(g, i) * cs;
      const y = this.oy + rowOf(g, i) * cs;
      // t = progresso da animação de "pop" desta célula (0 → 1)
      const t = Math.min(1, Math.max(0, (now - this.stamp[i]) / 320));
      const pop = easeOutBack(t);

      if (g.walls[i]) {
        ctx.fillStyle = k.wall;
        const s = cs * (0.4 + 0.6 * pop);
        roundRect(ctx, x + (cs - s) / 2, y + (cs - s) / 2, s, s, 3);
        continue;
      }

      ctx.fillStyle = k.cell;
      ctx.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);

      const v = this.vis[i];
      if (v !== VIS.none) {
        const s = (cs - 1) * Math.min(1, 0.25 + 0.75 * pop);
        if (v === VIS.frontier) ctx.fillStyle = k.frontier;
        else ctx.fillStyle = mix(k.visitNew, k.visitOld, Math.min(1, (now - this.stamp[i]) / 900));
        roundRect(ctx, x + (cs - s) / 2, y + (cs - s) / 2, s, s, 4);
      }

      if (g.weights[i]) {
        // Lama: um losango âmbar no meio da célula.
        const r = cs * 0.22 * (0.5 + 0.5 * pop);
        ctx.fillStyle = k.mud;
        ctx.beginPath();
        ctx.moveTo(x + cs / 2, y + cs / 2 - r);
        ctx.lineTo(x + cs / 2 + r, y + cs / 2);
        ctx.lineTo(x + cs / 2, y + cs / 2 + r);
        ctx.lineTo(x + cs / 2 - r, y + cs / 2);
        ctx.fill();
      }
    }

    this.drawPath();
    this.drawNode(this.start, k.start, 'start');
    this.drawNode(this.end, k.end, 'end');
  }

  /** O caminho final é uma linha contínua com brilho, passando pelo centro das células. */
  private drawPath(): void {
    if (this.pathCells.length < 2) return;
    const { ctx, grid: g, cell: cs } = this;
    ctx.save();
    ctx.strokeStyle = this.colors.path;
    ctx.shadowColor = this.colors.path;
    ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(3, cs * 0.28);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.pathCells.forEach((i, n) => {
      const x = this.ox + colOf(g, i) * cs + cs / 2;
      const y = this.oy + rowOf(g, i) * cs + cs / 2;
      if (n === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  private drawNode(i: number, color: string, kind: 'start' | 'end'): void {
    const { ctx, grid: g, cell: cs } = this;
    const cx = this.ox + colOf(g, i) * cs + cs / 2;
    const cy = this.oy + rowOf(g, i) * cs + cs / 2;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (kind === 'start') {
      // seta apontando pra direita
      ctx.moveTo(cx - cs * 0.28, cy - cs * 0.32);
      ctx.lineTo(cx + cs * 0.34, cy);
      ctx.lineTo(cx - cs * 0.28, cy + cs * 0.32);
      ctx.closePath();
      ctx.fill();
    } else {
      // alvo: anel + ponto central
      ctx.arc(cx, cy, cs * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ────────────────────────────── UI ──────────────────────────────

  private resetStats(): void {
    this.stats = { visited: 0, length: 0, cost: 0, found: true, cpu: 0 };
    this.renderStats();
  }

  private renderStats(): void {
    const s = this.stats;
    const done = this.mode === 'done' || (!this.animator.running && s.visited > 0);
    $('pf-visited').textContent = s.visited.toLocaleString('pt-BR');
    $('pf-length').textContent = done ? (s.found ? String(s.length) : '—') : '…';
    $('pf-cost').textContent = done ? (s.found ? String(s.cost) : '—') : '…';
    $('pf-cpu').textContent = s.cpu ? `${s.cpu.toFixed(2)} ms` : '—';
    const status = $('pf-status');
    status.textContent =
      this.mode === 'running'
        ? 'Procurando…'
        : this.mode === 'maze'
          ? 'Cavando o labirinto…'
          : done
            ? s.found
              ? 'Caminho encontrado ✓'
              : 'Sem saída! Nenhum caminho possível.'
            : 'Desenhe paredes e aperte Visualizar';
    status.dataset.state = done ? (s.found ? 'ok' : 'fail') : this.mode;
  }

  private renderAlgoInfo(): void {
    const a = this.algo;
    $('pf-desc').textContent = a.description;
    $('pf-badges').innerHTML = [
      `<span class="badge ${a.optimal ? 'good' : 'bad'}">${a.optimal ? 'Menor caminho garantido' : 'Não garante o melhor'}</span>`,
      `<span class="badge ${a.weighted ? 'good' : 'bad'}">${a.weighted ? 'Considera a lama' : 'Ignora a lama'}</span>`,
    ].join('');
  }

  private updateRunButton(): void {
    const btn = $('pf-run');
    const running = this.animator.running && this.mode === 'running';
    btn.textContent = running ? '■ Parar' : '▶ Visualizar';
    btn.classList.toggle('stop', running);
  }

  /** Estado bonito pra prints/screenshot: labirinto + A* já resolvido. */
  demo(): void {
    this.generateMaze(true);
    // Pega o fim no canto oposto pra o caminho atravessar a tela toda.
    const g = this.grid;
    this.start = toIndex(g, 1, 1);
    this.end = toIndex(g, g.rows - 2, g.cols - 2);
    for (let i = 0; i < g.walls.length; i++) if (!g.walls[i] && Math.random() < 0.06) g.weights[i] = 1;
    g.weights[this.start] = g.weights[this.end] = 0;
    this.runInstant();
  }
}
