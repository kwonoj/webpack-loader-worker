import { FarmOptions } from 'jest-worker/build/types';
import { WorkerAdapter } from './WorkerAdapter';
const JestWorker: typeof import('jest-worker').default = require('jest-worker');

const workerFunctionPath = require.resolve('../loaderWorkerFunction');

const workerAdapter: WorkerAdapter = (options: Partial<FarmOptions>) => {
  const worker = new JestWorker(workerFunctionPath, {
    ...options,
    enableWorkerThreads: true
  });

  return {
    run: (context: any) => (worker as any).loaderWorkerFunction(context)
  };
};

export { workerAdapter };
