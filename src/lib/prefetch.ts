export type PrefetchState = 'start' | 'ok' | 'fail';

export interface PrefetchOptions {
  synth: (text: string) => Promise<ArrayBuffer>;
  onState?: (index: number, state: PrefetchState) => void;
  size?: number;
}

interface SegmentText {
  text: string;
}

export class PrefetchWindow {
  private readonly size: number;
  private readonly synth: (text: string) => Promise<ArrayBuffer>;
  private readonly onState?: (index: number, state: PrefetchState) => void;
  private entries = new Map<number, Promise<ArrayBuffer>>();
  private token = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(options: PrefetchOptions) {
    this.size = Math.max(1, options.size ?? 3);
    this.synth = options.synth;
    this.onState = options.onState;
  }

  ensure(start: number, segments: SegmentText[]): void {
    const token = this.token;
    for (let offset = 1; offset <= this.size; offset += 1) {
      const index = start + offset;
      const seg = segments[index];
      if (!seg || this.entries.has(index)) continue;
      this.entries.set(index, this.enqueue(index, seg.text, token));
    }
  }

  take(index: number): Promise<ArrayBuffer> | null {
    const task = this.entries.get(index);
    if (!task) return null;
    this.entries.delete(index);
    return task;
  }

  release(index: number): void {
    this.entries.delete(index);
  }

  clear(): void {
    this.token += 1;
    this.entries.clear();
    this.chain = Promise.resolve();
  }

  whenIdle(): Promise<void> {
    return this.chain;
  }

  private enqueue(index: number, text: string, token: number): Promise<ArrayBuffer> {
    const task = this.chain.then(async () => {
      if (token !== this.token) throw new Error('prefetch-cancelled');
      this.onState?.(index, 'start');
      try {
        const buf = await this.synth(text);
        if (token !== this.token) throw new Error('prefetch-cancelled');
        this.onState?.(index, 'ok');
        return buf;
      } catch (e) {
        if (token === this.token) {
          this.entries.delete(index);
          this.onState?.(index, 'fail');
        }
        throw e;
      }
    });
    this.chain = task.then(() => undefined, () => undefined);
    task.catch(() => { /* 由 take 或调用方处理 */ });
    return task;
  }
}
