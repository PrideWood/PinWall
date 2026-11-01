export type SaveStatus = "saved" | "pending" | "saving" | "failed" | "conflict";
/** Serial writes use the last acknowledged server version; edits made during I/O stay queued. */
export class SaveQueue<T> {
  version: number;
  status: SaveStatus = "saved";
  error = "";
  latest: T;
  private pending: T | undefined;
  private running: Promise<boolean> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private save: (snapshot: T, version: number) => Promise<number>;
  private changed: (queue: SaveQueue<T>) => void;
  private checkpoint: (snapshot: T, version: number, saved: boolean) => void;
  constructor(
    initial: T,
    version: number,
    save: (snapshot: T, version: number) => Promise<number>,
    changed: (queue: SaveQueue<T>) => void,
    checkpoint: (snapshot: T, version: number, saved: boolean) => void,
  ) {
    this.latest = initial;
    this.version = version;
    this.save = save;
    this.changed = changed;
    this.checkpoint = checkpoint;
  }
  get dirty() {
    return this.status !== "saved";
  }
  enqueue(value: T) {
    if (this.stopped) return;
    this.latest = value;
    this.pending = value;
    this.checkpoint(value, this.version, false);
    if (this.status !== "conflict")
      this.status = this.running ? "saving" : "pending";
    this.changed(this);
    clearTimeout(this.timer);
    if (this.status !== "conflict")
      this.timer = setTimeout(() => {
        void this.flush();
      }, 1000);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.stopped || this.status === "conflict") return false;
    if (this.running) return this.running;
    this.running = this.drain();
    try {
      return await this.running;
    } finally {
      this.running = undefined;
    }
  }
  private async drain() {
    while (this.pending !== undefined && !this.stopped) {
      const snapshot = this.pending;
      this.pending = undefined;
      this.status = "saving";
      this.error = "";
      this.changed(this);
      try {
        this.version = await this.save(snapshot, this.version);
        if (this.stopped) return false;
        const saved = this.pending === undefined;
        this.checkpoint(this.latest, this.version, saved);
        this.status = saved ? "saved" : "pending";
        this.changed(this);
      } catch (error) {
        if (this.stopped) return false;
        if (this.pending === undefined) this.pending = snapshot;
        this.status =
          (error as { status?: number }).status === 409 ? "conflict" : "failed";
        this.error = error instanceof Error ? error.message : "保存失败。";
        this.changed(this);
        return false;
      }
    }
    return !this.dirty;
  }
  activate() {
    this.stopped = false;
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
