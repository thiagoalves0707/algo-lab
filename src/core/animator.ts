/**
 * Animador baseado em generators.
 *
 * A grande sacada do projeto: cada algoritmo é escrito como uma
 * `function*` que dá `yield` a cada passo importante (visitou um nó,
 * comparou dois números...). O algoritmo fica limpo, parecendo código
 * de livro, e quem decide o ritmo da animação é este animador — ele
 * puxa N passos por frame dependendo da velocidade escolhida.
 */

/** Passos por frame pra cada nível do slider (1 = câmera lenta, 10 = turbo). */
const SPEED_TABLE = [0.15, 0.35, 0.7, 1, 2, 4, 8, 16, 40, 120];

export class Animator<E> {
  private gen: Generator<E, void> | null = null;
  private raf = 0;
  private budget = 0;
  private stepsPerFrame = 1;
  paused = false;

  constructor(
    private readonly onEvent: (event: E) => void,
    private readonly onDone: () => void,
  ) {}

  get running(): boolean {
    return this.gen !== null;
  }

  setSpeed(level: number): void {
    const i = Math.min(SPEED_TABLE.length, Math.max(1, level)) - 1;
    this.stepsPerFrame = SPEED_TABLE[i];
  }

  start(gen: Generator<E, void>): void {
    this.stop();
    this.gen = gen;
    this.paused = false;
    this.budget = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.gen = null;
  }

  /** Executa tudo que falta de uma vez (usado no "recalcular ao vivo"). */
  finish(): void {
    if (!this.gen) return;
    for (const ev of this.gen) this.onEvent(ev);
    this.gen = null;
    cancelAnimationFrame(this.raf);
    this.onDone();
  }

  private tick = (): void => {
    if (!this.gen) return;
    if (!this.paused) {
      // Velocidades < 1 acumulam "orçamento" até dar um passo inteiro,
      // o que permite animações bem lentas sem setTimeout.
      this.budget += this.stepsPerFrame;
      while (this.budget >= 1) {
        this.budget -= 1;
        const r = this.gen.next();
        if (r.done) {
          this.gen = null;
          this.onDone();
          return;
        }
        this.onEvent(r.value);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
