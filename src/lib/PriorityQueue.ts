interface QueueEntry<T> { item: T; priority: number; }
const ROOT_INDEX = 0;
const CHILDREN_PER_NODE = 2;

/** Max heap: large frontiers no longer require shifting the whole array per operation. */
export class PriorityQueue<T> {
  private items: QueueEntry<T>[] = [];

  enqueue(item: T, priority: number) {
    this.items.push({ item, priority });
    let index = this.items.length - 1;
    while (index > ROOT_INDEX) {
      const parent = Math.floor((index - 1) / CHILDREN_PER_NODE);
      if (this.items[parent].priority >= priority) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    const result = this.items[ROOT_INDEX].item;
    const last = this.items.pop()!;
    if (!this.isEmpty()) {
      this.items[ROOT_INDEX] = last;
      this.siftDown();
    }
    return result;
  }

  private siftDown() {
    let index = ROOT_INDEX;
    while (true) {
      const child = this.highestChild(index);
      if (child === undefined || this.items[index].priority >= this.items[child].priority) return;
      this.swap(index, child);
      index = child;
    }
  }

  private highestChild(index: number): number | undefined {
    const left = index * CHILDREN_PER_NODE + 1;
    if (left >= this.items.length) return undefined;
    const right = left + 1;
    return right < this.items.length && this.items[right].priority > this.items[left].priority ? right : left;
  }

  private swap(first: number, second: number) {
    [this.items[first], this.items[second]] = [this.items[second], this.items[first]];
  }

  isEmpty(): boolean { return this.items.length === 0; }
}
