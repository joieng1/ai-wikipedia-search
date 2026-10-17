import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ startWord }) => {
  if (startWord === 'exit') process.exit(0);
  parentPort.postMessage({ kind: 'update', update: { status: 'started' } });
  const deadline = Date.now() + 400;
  while (Date.now() < deadline) Math.sqrt(Date.now());
  parentPort.postMessage({ kind: 'update', update: { finished: true } });
  parentPort.postMessage({ kind: 'done' });
});
