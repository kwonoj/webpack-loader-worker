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

  const worker = new Worker(path.resolve(__dirname, './workerEntryPoint.js'), { workerData: { loaderId, workerId } });
  const workerProxy = wrap<WorkerTaskRunner>(nodeEndpoint(worker));
  worker.unref();

  let disposed = false;

  return {
    disposed,
    workerProxy,
    loaderId,
    workerId,
    close: () => {
      disposed = true;
      return new Promise((resolve) => {
        worker.once('exit', () => {
          log.info(`[${loaderId}:${workerId}] Worker instance disposed`);
          workerProxy[releaseProxy]();
          resolve();
        });

        workerProxy.close();
      });
    }
  };
};

export { createWorker };
