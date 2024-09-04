export class PriorityQueue<T> {
  private items: { item: T; priority: number }[];

  constructor() {
    this.items = [];
  }

  enqueue(item: T, priority: number) {
    const newItem = { item, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].priority < newItem.priority) {
        this.items.splice(i, 0, newItem);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(newItem);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}
