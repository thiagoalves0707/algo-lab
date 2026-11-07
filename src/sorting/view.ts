import { Animator } from '../core/animator';
import { cssVar, fitCanvas, roundRect } from '../core/canvas';
import { SORT_ALGORITHMS, type SortAlgorithm, type SortEvent } from './algorithms';
import { SortSound } from './sound';

/** Destaques possíveis de uma barra. */
const MARK = { none: 0, compare: 1, write: 2, sorted: 3 } as const;

type ViewEvent = SortEvent | { type: 'sorted'; i: number };
type Preset = 'random' | 'nearly' | 'reversed' | 'few';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Tela de Ordenação: barras num canvas, contadores ao vivo e som opcional.
 */
export class SortingView {
  private readonly canvas = $<HTMLCanvasElement>('so-canvas');
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  private arr: number[] = [];
  private mark = new Uint8Array(0);
  private markTime = new Float32Array(0);
  private dirty = true;

  private algo: SortAlgorithm = SORT_ALGORITHMS[0];
  private preset: Preset = 'random';
  private size = 64;
  private comparisons = 0;
  private writes = 0;

  private readonly sound = new SortSound();
  private readonly animator = new Animator<ViewEvent>(
    (e) => this.onEvent(e),
    () => this.onDone(),
  );

  constructor() {
    this.setupControls();
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement!);
    this.resize();
    this.shuffle();
    requestAnimationFrame(this.frame);
  }

  private setupControls(): void {
    const select = $<HTMLSelectElement>('so-algo');
    select.innerHTML = SORT_ALGORITHMS.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
    select.addEventListener('change', () => {
      this.algo = SORT_ALGORITHMS.find((a) => a.id === select.value)!;
      this.renderAlgoInfo();
    });

    const preset = $<HTMLSelectElement>('so-preset');
    preset.addEventListener('change', () => {
      this.preset = preset.value as Preset;
      this.shuffle();
    });

    const size = $<HTMLInputElement>('so-size');
    size.addEventListener('input', () => {
      this.size = Number(size.value);
      $('so-size-label').textContent = size.value;
      this.shuffle();
    });

    const speed = $<HTMLInputElement>('so-speed');
    const applySpeed = () => this.animator.setSpeed(Number(speed.value));
    speed.addEventListener('input', applySpeed);
    applySpeed();

    const soundBtn = $('so-sound');
    soundBtn.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      soundBtn.classList.toggle('on', this.sound.enabled);
      soundBtn.textContent = this.sound.enabled ? '🔊 Som ligado' : '🔇 Som';
    });

    $('so-shuffle').addEventListener('click', () => this.shuffle());
    $('so-run').addEventListener('click', () => (this.animator.running ? this.stop() : this.run()));
    this.renderAlgoInfo();
  }

  // ──────────────────────────── dados ─────────────────────────────

  /** Gera os valores 1..n e embaralha conforme o preset escolhido. */
  shuffle(): void {
    this.animator.stop();
    const n = this.size;
    let arr = Array.from({ length: n }, (_, i) => i + 1);

    if (this.preset === 'few') {
      // Só 5 alturas diferentes — bom pra ver estabilidade e partições.
      arr = arr.map((v) => Math.ceil((v / n) * 5) * Math.ceil(n / 5));
    }
    if (this.preset === 'reversed') {
      arr.reverse();
    } else if (this.preset === 'nearly') {
      // Quase ordenado: só alguns pares trocados de lugar.
      for (let k = 0; k < Math.max(1, n / 12); k++) {
        const i = Math.floor(Math.random() * (n - 3));
        const j = i + 1 + Math.floor(Math.random() * 3);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } else {
      // Fisher–Yates: o jeito certo de embaralhar (todas as ordens são igualmente prováveis).
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }

    this.arr = arr;
    this.mark = new Uint8Array(n);
    this.markTime = new Float32Array(n);
    this.comparisons = 0;
    this.writes = 0;
    this.renderStats('Pronto pra ordenar');
    this.updateRunButton();
    this.dirty = true;
  }

  run(): void {
    if (this.isSorted()) this.shuffle();
    this.mark.fill(0);
    this.comparisons = 0;
    this.writes = 0;
    this.animator.start(this.withFinale(this.algo.run(this.arr)));
    this.renderStats('Ordenando…');
    this.updateRunButton();
  }

  stop(): void {
    this.animator.stop();
    this.mark.fill(0);
    this.renderStats('Pausado no meio do caminho');
    this.updateRunButton();
    this.dirty = true;
  }

  private isSorted(): boolean {
    return this.arr.every((v, i) => i === 0 || this.arr[i - 1] <= v);
  }

  /** Depois de ordenar, faz a "varredura verde" de confirmação. */
  private *withFinale(gen: Generator<SortEvent, void>): Generator<ViewEvent, void> {
    yield* gen;
    for (let i = 0; i < this.arr.length; i++) yield { type: 'sorted', i };
  }

  // ─────────────────────────── eventos ────────────────────────────

  private onEvent(e: ViewEvent): void {
    const now = performance.now();
    const max = this.size;
    switch (e.type) {
      case 'compare':
        this.comparisons++;
        this.flash(e.a, MARK.compare, now);
        this.flash(e.b, MARK.compare, now);
        this.sound.queue(this.arr[e.b] / max);
        break;
      case 'swap':
        this.writes += 2;
        this.flash(e.a, MARK.write, now);
        this.flash(e.b, MARK.write, now);
        this.sound.queue(this.arr[e.a] / max);
        break;
      case 'set':
        this.writes++;
        this.flash(e.i, MARK.write, now);
        this.sound.queue(this.arr[e.i] / max);
        break;
      case 'sorted':
        this.mark[e.i] = MARK.sorted;
        this.markTime[e.i] = now;
        this.sound.queue(this.arr[e.i] / max);
        break;
    }
    this.dirty = true;
  }

  private flash(i: number, kind: number, now: number): void {
    if (this.mark[i] === MARK.sorted) return;
    this.mark[i] = kind;
    this.markTime[i] = now;
  }

  private onDone(): void {
    this.renderStats('Ordenado ✓');
    this.updateRunButton();
  }

  // ──────────────────────────── desenho ───────────────────────────

  private resize(): void {
    const { w, h, ctx } = fitCanvas(this.canvas);
    this.ctx = ctx;
    this.width = w;
    this.height = h;
    this.dirty = true;
  }

  private frame = (now: number): void => {
    this.sound.flush();
    if (this.dirty || this.animator.running) {
      this.draw(now);
      this.dirty = false;
      this.renderCounters();
    }
    requestAnimationFrame(this.frame);
  };

  private draw(now: number): void {
    const { ctx, width: w, height: h, arr } = this;
    ctx.fillStyle = cssVar('--grid-bg');
    ctx.fillRect(0, 0, w, h);

    const n = arr.length;
    const pad = 16;
    const gap = n > 120 ? 1 : 2;
    const bw = (w - pad * 2) / n;
    const max = Math.max(...arr);
    const compare = cssVar('--compare');
    const write = cssVar('--write');
    const sorted = cssVar('--sorted');

    for (let i = 0; i < n; i++) {
      const bh = ((h - pad * 2) * arr[i]) / max;
      const x = pad + i * bw;
      const y = h - pad - bh;
      // Destaques de comparação/escrita somem depois de ~100ms.
      const fresh = now - this.markTime[i] < 100;
      const m = this.mark[i];

      if (m === MARK.sorted) ctx.fillStyle = sorted;
      else if (fresh && m === MARK.compare) ctx.fillStyle = compare;
      else if (fresh && m === MARK.write) ctx.fillStyle = write;
      else {
        // Cor base: degradê de ciano a violeta conforme a altura.
        const t = arr[i] / max;
        ctx.fillStyle = `hsl(${190 + t * 90} 85% ${45 + t * 15}%)`;
      }
      roundRect(ctx, x + gap / 2, y, Math.max(1, bw - gap), bh, Math.min(4, bw / 3));
    }
  }

  // ────────────────────────────── UI ──────────────────────────────

  private renderCounters(): void {
    $('so-comparisons').textContent = this.comparisons.toLocaleString('pt-BR');
    $('so-writes').textContent = this.writes.toLocaleString('pt-BR');
  }

  private renderStats(status: string): void {
    this.renderCounters();
    $('so-status').textContent = status;
  }

  private renderAlgoInfo(): void {
    const a = this.algo;
    $('so-desc').textContent = a.description;
    $('so-complexity').innerHTML = `
      <div><span>Melhor</span><b>O(${a.best})</b></div>
      <div><span>Médio</span><b>O(${a.average})</b></div>
      <div><span>Pior</span><b>O(${a.worst})</b></div>
      <div><span>Memória</span><b>O(${a.memory})</b></div>
      <div><span>Estável</span><b>${a.stable ? 'Sim' : 'Não'}</b></div>`;
  }

  private updateRunButton(): void {
    const btn = $('so-run');
    btn.textContent = this.animator.running ? '■ Parar' : '▶ Ordenar';
    btn.classList.toggle('stop', this.animator.running);
  }
}
