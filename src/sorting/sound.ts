/**
 * "Som da ordenação": cada barra tocada vira uma nota — barras altas
 * soam agudas, baixas soam graves. Usa a Web Audio API pura, sem libs.
 */
export class SortSound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private pending: number | null = null;

  /** Agenda uma nota pro valor normalizado (0 a 1). Só a última do frame toca. */
  queue(value: number): void {
    if (this.enabled) this.pending = value;
  }

  /** Chamado uma vez por frame: toca no máximo uma nota pra não virar barulho. */
  flush(): void {
    if (this.pending === null) return;
    const v = this.pending;
    this.pending = null;

    // O AudioContext só pode ser criado depois de um clique do usuário.
    this.ctx ??= new AudioContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 180 + v * 1100;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}
