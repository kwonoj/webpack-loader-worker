import * as os from 'os';
import * as path from 'path';
import { Remote, proxy, wrap } from 'comlink';
import { Subject, from, of, zip } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Worker } from 'worker_threads';
import { getLogger } from './utils/logger';
const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

type WorkerTaskRunner = Remote<typeof import('./adapters/workerEntryPoint').taskRunner>;
const log = getLogger('threadPool');

const DEFAULT_WORKER_COUNT = os.cpus().length || 1;

/**
 * Naive thread pool to execute functions in loader.
 */
const createPool = (maxWorkers = DEFAULT_WORKER_COUNT, id: string) => {
  log.info('createPool: creating worker threads pool %s', id);
  const taskQueue = new Subject<any>();
  const workerQueue = new Subject<WorkerTaskRunner>();

  const workers: Array<{ wrapped: WorkerTaskRunner; terminate: () => Promise<number> }> = [
    ...new Array(maxWorkers)
  ].map(() => {
    const worker = new Worker(path.resolve(__dirname, './workerFunction.js'));
    return {
      wrapped: wrap(nodeEndpoint(worker)) as any,
      terminate: () => worker.terminate()
    };
  });

  const pushAvailableWorker = async () => {
    for (const worker of workers) {
      const { wrapped } = worker;
      const available = await wrapped.isAvailable();
      if (available) {
        workerQueue.next(wrapped);
        break;
      }
    }
  };

  const getResultContext = (task: any, result: any, err: any) => ({
    onComplete: task.onComplete,
    onError: task.onError,
    result,
    err
  });

  zip(taskQueue, workerQueue)
    .pipe(
      mergeMap(([task, worker]) => {
        return from(worker.run(task.context, task.proxyContext)).pipe(
          map(result => getResultContext(task, result, null)),
          catchError(err => of(getResultContext(task, null, err)))
        );
      }, maxWorkers),
      mergeMap(async value => {
        await pushAvailableWorker();
        return value;
      })
    )
    .subscribe(value => {
      const { onComplete, onError, err, result } = value;
      if (err) {
        onError(err);
      } else {
        onComplete(result);
      }
    });

  //kick off worker queue
  pushAvailableWorker();

  return {
    complete: async () => {
      for (const worker of workers) {
        await worker.terminate();
      }
    },
    runTask: (context: any) => {
      return new Promise((resolve, reject) => {
        // We'll naively split context to fuction object, and wrap function via `proxy` to hand over to worker context.
        const x = Object.entries(context).reduce(
          (acc, [key, value]) => {
            if (typeof value === 'function') {
              acc[1][key] = value;
              acc[0].proxyFnKeys?.push(key);
            } else {
              acc[0][key] = value;
            }

            return acc;
          },
          [{ proxyFnKeys: [] }, {}] as [{ proxyFnKeys: Array<string> }, object]
        );

        const task = {
          context: x[0],
          proxyContext: proxy(x[1]),
          onComplete: resolve,
          onError: reject
        };

        taskQueue.next(task);
      });
    }
  };
};

export { createPool };
