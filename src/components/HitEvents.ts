interface HitEventsOptions<T> {
  updateCallback?: (arg0: T) => boolean;
  iterateCallback?: (arg0: T) => void;
}
export class HitEvents<T> extends Array<T> {
  public update: () => void;
  public animate: () => void;
  public constructor({
    updateCallback = () => false,
    iterateCallback = () => {}
  }: HitEventsOptions<T> = {}) {
    super();
    this.update = this.defilter.bind(this, updateCallback);
    this.animate = this.iterate.bind(this, iterateCallback);
  }
  private defilter(predicate: (arg0: T) => boolean): this {
    let write = 0;
    for (let read = 0, len = this.length; read < len; read++) if (!predicate(this[read])) this[write++] = this[read]; this.length = write;
    return this;
  }
  private iterate(callback: (arg0: T) => void): void {
    for (const i of this) callback(i);
  }
  public add(value: T): void {
    this[this.length] = value;
  }
  public clear(): void {
    this.length = 0;
  }
}
