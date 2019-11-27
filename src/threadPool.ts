import * as debug from 'debug';
import { Subject, zip, from, of } from 'rxjs';
import { mergeMap, catchError, map } from 'rxjs/operators';
import { Worker } from 'worker_threads';
import { wrap, Remote, proxy } from 'comlink';
import * as path from 'path';
import { setupTransferHandler } from './messagePortTransferHandler';
const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

type remoteWorker = Remote<typeof import('./workerFunction').taskRunner>;
const pool = debug('parallelLoader:threadPool');

/**
 * Naive thread pool to execute functions in loader.
 */
const createPool = (options: {
  maxWorkers: number
} = { maxWorkers: 4 }) => {
  pool(`Creating thread pool`);
  setupTransferHandler();
  const maxWorkers = 4;

  const taskQueue = new Subject<any>();
  const workerQueue = new Subject<remoteWorker>();

  const workers: Array<{ wrapped: remoteWorker, terminate: () => Promise<number> }> = [...new Array(options.maxWorkers)].map(() => {
    const worker = new Worker(path.resolve(__dirname, './workerFunction.js'));
    return {
      wrapped: wrap(nodeEndpoint(worker)) as any,
      terminate: () => worker.terminate()
    };
  });

  const pushAvailableWorker = async () => {
    pool(`pushAvailableWorker: trying to look for available worker`);

    for (const worker of workers) {
      const {wrapped} = worker
      const available = await wrapped.isAvailable();
      if (available) {
        pool(`pushAvailableWorker: found worker, push to worker queue`);
        workerQueue.next(wrapped);
        break;
      }
    }
  }

  const getResultContext = (task: any, result: any, err: any) => ({
    onComplete: task.onComplete,
    onError: task.onError,
    result,
    err
  });

  zip(taskQueue, workerQueue).pipe(
    mergeMap(([task, worker]) => {
      pool(`Start executing task`);
      return from(worker.run(task.context, task.proxyContext)).pipe(
        map((result) => getResultContext(task, result, null)),
        catchError(err => of(getResultContext(task, null, err)))
      )
    }, maxWorkers),
    mergeMap(async (value) => {
      await pushAvailableWorker();
      return value;
    })
  ).subscribe((value) => {
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
      pool(`runTask: scheduling task for context %O`, context);
      return new Promise((resolve, reject) => {
        // We'll naively split context to fuction object, and wrap function via `proxy` to hand over to worker context.
        const x = Object.entries(context).reduce((acc, [key, value]) => {
          if (typeof value === 'function') {
            acc[1][key] = value;
            acc[0].proxyFnKeys?.push(key);
          } else {
            acc[0][key] = value;
          }

          return acc;
        }, [{ proxyFnKeys: [] }, {}] as [{ proxyFnKeys: Array<string> }, object]);

        const task = {
          context: x[0],
          proxyContext: proxy(x[1]),
          onComplete: resolve,
          onError: reject
        }

        taskQueue.next(task);
      })
    }
  }
}

export {
  createPool
}