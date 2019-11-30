import * as os from 'os';

import { Subject, from, of, zip } from 'rxjs';
import { catchError, map, mapTo, mergeMap, tap } from 'rxjs/operators';
import { getLogLevel, getLogger } from './utils/logger';

import { RunLoaderResult } from 'loader-runner';
import { WorkerTaskData } from './adapters/WorkerTaskData';
import { WorkerTaskLoaderContext } from './utils/WorkerTaskLoaderContext';
import { createWorker } from './adapters/createWorker';
import { proxy } from 'comlink';

const DEFAULT_WORKER_COUNT = os.cpus().length || 1;

const constructResultContext = (
  task: WorkerTaskData,
  { result, err }: Partial<{ result: RunLoaderResult; err: unknown }>
) => ({
  onComplete: task.onComplete,
  onError: task.onError,
  result,
  err,
  id: task.id
});

/**
 * Create comlink proxy-wrapped transferrable object from given
 * worker data context.
 *
 * Each loader's data context includes Webpack::loader::LoaderContext
 * have various functions. This marshall splits object between POJO to functions,
 * then wrap all functions into comlink proxy to avoid cloning attempt.
 *
 * In marshalled object, non-proxied (POJO) contains all keys of proxied fn property
 * as iterating & gettings keys to proxy object is bit tricky.
 *
 * Note `workerEntryPoint` have additional handling for some edge cases as well.
 */
const marshallWorkerDataContext = <T = object>(context: T) =>
  Object.entries(context).reduce(
    (acc, [key, value]) => {
      if (typeof value === 'function') {
        acc[1][key] = proxy(value);
        acc[0].proxyFnKeys?.push(key);
      } else {
        acc[0][key] = value;
      }

      return acc;
    },
    [{ proxyFnKeys: [] }, {}] as [{ proxyFnKeys: Array<string> }, object]
  );

/**
 * Naive thread pool to execute functions in loader.
 */
const createPool = (loaderId: string, maxWorkers?: number) => {
  const workerCount = maxWorkers ?? DEFAULT_WORKER_COUNT;
  const log = getLogger(`[${loaderId}] threadPool`);
  log.info('createPool: creating worker threads pool with %s maxWorkers', workerCount);

  let taskId = 1;
  const taskQueue = new Subject<WorkerTaskData>();
  const workerQueue = new Subject<ReturnType<typeof createWorker>>();

  //container to hold reference to worker instances
  const workerSet: Array<ReturnType<typeof createWorker>> = [];
  /**
   * Pickup available worker thread, queue for next task
   */
  const invalidateWorkerQueue = async () => {
    if (workerSet.length < workerCount) {
      const worker = createWorker(loaderId);
      workerSet.push(worker);
      log.info('invalidateWorkerQueue: Created new worker instance [%s], queue for next task', worker.workerId);
      log.verbose('invalidateWorkerQueue: %O', workerSet);
      workerQueue.next(worker);
      return;
    }

    for (const worker of workerSet) {
      const { workerProxy, workerId } = worker;
      const available = await workerProxy.isAvailable();
      if (available) {
        log.info('invalidateWorkerQueue: Worker instance [%s] is available for next task', workerId);
        workerQueue.next(worker);
        break;
      }
    }
  };

  // actual pool subscription. When task / worker both emits trigger task on worker the notify its results
  // via Promise.resolve / reject as completion callback.
  zip(
    taskQueue.pipe(
      tap((task) => {
        log.info('taskQueue: new task queued [%s]', task.id);
        log.verbose('taskQueue: %O', task);
      })
    ),
    workerQueue
  )
    .pipe(
      mergeMap(([task, worker]) => {
        const { workerProxy } = worker;
        const { context, proxyContext, id } = task;
        log.info('Running task [%s] via [%s]', task.id, worker.workerId);

        return from(workerProxy.run({ id, logLevel: getLogLevel() }, context, proxyContext)).pipe(
          map((result: any) => constructResultContext(task, { result })),
          catchError((err: unknown) => of(constructResultContext(task, { err })))
        );
      }, workerCount),
      //Once worker returns results, trigger invalidation to put another worker into queue for next task
      mergeMap((resultContext: ReturnType<typeof constructResultContext>) =>
        from(invalidateWorkerQueue()).pipe(mapTo(resultContext))
      )
    )
    .subscribe((resultContext) => {
      const { onComplete, onError, err, result, id } = resultContext;
      log.info('task [%s] completed', id);
      log.verbose(`${result ? 'succeed' : 'fail'}`, result ?? err);
      if (err) {
        onError(err);
      } else {
        onComplete(result);
      }
    });

  //kick off initial worker queue
  invalidateWorkerQueue();

  return {
    /**
     * Stops all thread. This'll attempt to workers asap, only expected to call
     * once all jobs completed.
     */
    complete: async () => {
      for (const worker of workerSet) {
        await worker.terminate();
      }
    },
    /**
     * Queue new task into thread pool and returns result asynchronously.
     */
    runTask: (context: WorkerTaskLoaderContext): Promise<RunLoaderResult> =>
      new Promise((resolve, reject) => {
        const [normalContext, proxyContext] = marshallWorkerDataContext(context);
        log.verbose('', normalContext);
        log.verbose('', proxyContext);

        taskQueue.next({
          id: taskId++,
          context: normalContext,
          //Wrap whole object into proxy again, otherwise worker will try clone
          proxyContext: proxy(proxyContext),
          onComplete: resolve,
          onError: reject
        });
      })
  };
};

export { createPool, WorkerTaskLoaderContext };
