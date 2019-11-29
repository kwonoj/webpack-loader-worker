/**
 * Check if node.js allowed to use worker_threads
 */
const isWorkerEnabled = () => {
  try {
    const worker = require('worker_threads');
    return worker.isMainThread;
  } catch (err) {
    return false;
  }
};

export { isWorkerEnabled };
