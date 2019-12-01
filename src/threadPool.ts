import * as os from 'os';

import { Subject, from, of, zip } from 'rxjs';
import { catchError, map, mapTo, mergeMap, mergeMapTo, retry, tap, timeout } from 'rxjs/operators';
import { getLogLevel, getLogger } from './utils/logger';

import { RunLoaderResult } from 'loader-runner';
import { WorkerTaskData } from './adapters/WorkerTaskData';
import { WorkerTaskLoaderContext } from './utils/WorkerTaskLoaderContext';
import { createWorker } from './adapters/createWorker';
import { proxy } from 'comlink';

const memoize = require('lodash.memoize');

const nanoid: typeof import('nanoid') = require('nanoid');
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
const createPool: (
  maxWorkers?: number
) => { dispose: () => void; runTask: (context: WorkerTaskLoaderContext) => Promise<RunLoaderResult> } = memoize(
  (maxWorkers?: number) => {
    const poolId = nanoid(6);
    const workerCount = maxWorkers ?? DEFAULT_WORKER_COUNT;
    const log = getLogger(`[${poolId}] threadPool`);
    log.info('createPool: creating worker threads pool with %s maxWorkers', workerCount);

    let taskId = 1;
    const taskQueue = new Subject<WorkerTaskData>();
    const workerQueue = new Subject<ReturnType<typeof createWorker>>();

    //container to hold reference to worker instances
    const workerSet: Set<ReturnType<typeof createWorker>> = new Set();
    /**
     * Pickup available worker thread, queue for next task
     */
    const invalidateWorkerQueue = async () => {
      //check existing worker set
      for (const worker of workerSet) {
        const { workerProxy, workerId } = worker;

        const available = await workerProxy.isAvailable();
        if (available) {
          log.info('invalidateWorkerQueue: Worker instance [%s] is available for next task', workerId);
          workerQueue.next(worker);
          return;
        }
      }

      //if there's no available worker but does not reach max worker size, create new ones
      if (workerSet.size < workerCount) {
        const worker = createWorker(poolId);
        workerSet.add(worker);
        log.info('invalidateWorkerQueue: Created new worker instance [%s], queue for next task', worker.workerId);
        workerQueue.next(worker);
        return;
      }
    };

    const closeWorkers = async () => {
      log.info('No task arrived within 2 seconds of timeout, closing existing threads');
      for (const worker of workerSet) {
        workerSet.delete(worker);
        await worker.close();
      }
    };

    // setting up timeout to close threads gracefully, otherwise main process will wait indefinitely
    const timeoutSubscription = taskQueue
      .pipe(
        timeout(2000),
        // once timeout occured, tell all existing worker to exit then bubble up error
        // to retry timeout in case new worker created by task arrives later than 2sec
        catchError((e) => from(closeWorkers()).pipe(mergeMapTo(() => e))),
        retry()
      )
      .subscribe(() => {
        /* noop */
      });

    // actual pool subscription. When task / worker both emits trigger task on worker the notify its results
    // via Promise.resolve / reject as completion callback.
    const poolSubscription = zip(
      taskQueue.pipe(
        tap((task) => {
          log.info('taskQueue: new task queued [%s]', task.id);
        })
      ),
      workerQueue
    )
      .pipe(
        mergeMap(([task, worker]) => {
          const { workerProxy } = worker;
          const { context, proxyContext, id } = task;
          log.info('Running task [%s] via [%s]', task.id, worker.workerId);

          // note passing proxycontext as separate, top level param is intended.
          // proxyContext is proxy(object) to let comlink do not close object - nesting this into other
          // object will makes comlink try to clone.
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
        if (err) {
          onError(err);
        } else {
          onComplete(result);
        }
      });

    //kick off initial worker queue
    invalidateWorkerQueue();

    return {
      /** Manually close threadpool. */
      dispose: () => {
        timeoutSubscription.unsubscribe();
        poolSubscription.unsubscribe();
      },
      /**
       * Queue new task into thread pool and returns result asynchronously.
       */
      runTask: (context: WorkerTaskLoaderContext): Promise<RunLoaderResult> =>
        new Promise((resolve, reject) => {
          const [normalContext, proxyContext] = marshallWorkerDataContext(context);

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
  }
);

export { createPool, WorkerTaskLoaderContext };
