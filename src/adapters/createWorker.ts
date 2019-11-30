import * as path from 'path';

import { releaseProxy, wrap } from 'comlink';

import { Worker } from 'worker_threads';
import { getLogger } from '../utils/logger';

const nanoid: typeof import('nanoid') = require('nanoid');
const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

type WorkerTaskRunner = typeof import('./workerEntryPoint').taskRunner;

const createWorker = (loaderId: string) => {
  const workerId = nanoid(6);
  const log = getLogger(`[${loaderId}:${workerId}] createWorker`);

  log.info('Creating new worker instance');

  const worker = new Worker(path.resolve(__dirname, './workerEntryPoint.js'));
  const workerProxy = wrap<WorkerTaskRunner>(nodeEndpoint(worker));

  return {
    workerProxy,
    loaderId,
    workerId,
    /**
     * Stops worker thread. Currently this does not
     * gracefully honor running task, only expect to
     * be called once all loader task completed.
     */
    terminate: () => {
      workerProxy[releaseProxy]();
      return worker.terminate();
    }
  };
};

export { createWorker };
