import { WorkerAdapter } from './WorkerAdapter';
import * as debug from 'debug';

const JestWorker: typeof import('jest-worker').default = require('jest-worker').default;

const adapter = debug('parallelLoader:jestWorkerAdapter');
const workerFunctionPath = require.resolve('../loaderWorkerFunction');

const workerAdapter: WorkerAdapter = (options: any) => {
  adapter('Creating new worker adapter to %s', workerFunctionPath);

  const worker = new JestWorker(workerFunctionPath, {
    numWorkers: options.maxWorkers ?? (null as any),
    enableWorkerThreads: true
  });

  adapter(`Successfully created worker pool instance`);

  return {
    //todo: interop worker's emitXXX event to webpackcontext callback
    run: async (context: any, _evts: any) => {
      adapter(`Start thread`);
      try {
        return await (worker as any).loaderWorkerFunction(context);
      } catch (err) {
        adapter('unexpected error occurred in worker function');
        adapter(err);
      }
    }
  };
};

export { workerAdapter };
