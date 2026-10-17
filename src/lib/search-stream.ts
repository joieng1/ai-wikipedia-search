import { SearchUpdate } from './search-types.js';

/** Network reads can split anywhere in a JSON record or a UTF-8 character. */
export async function* readSearchUpdates(stream: ReadableStream<Uint8Array>): AsyncGenerator<SearchUpdate> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const record = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (record) yield JSON.parse(record) as SearchUpdate;
        newline = pending.indexOf('\n');
      }
      if (done) break;
    }
    if (pending.trim()) yield JSON.parse(pending) as SearchUpdate;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
