import * as path from 'path';

import { Worker } from 'worker_threads';
import { getLogger } from '../utils/logger';
import { wrap } from 'comlink';
const nanoid: typeof import('nanoid') = require('nanoid');
const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

type WorkerTaskRunner = typeof import('./workerEntryPoint').taskRunner;
const log = getLogger('createWorker');

const createWorker = (loaderId: string) => {
  const workerId = nanoid(8);
  log.info('Creating new worker instance %s:%s', loaderId, workerId);

  const worker = new Worker(path.resolve(__dirname, './workerEntryPoint.js'));
  const workerProxy = wrap<WorkerTaskRunner>(nodeEndpoint(worker));

  return {
    workerProxy,
    loaderId,
    workerId,
    terminate: () => {
      throw new Error('not implemented');
    }
  };
};

export { createWorker };