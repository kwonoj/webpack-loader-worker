import * as os from 'os';

import { Subject, asapScheduler, zip } from 'rxjs';
import { filter, map, mergeMap, observeOn, takeUntil } from 'rxjs/operators';
import { getLogLevel, getLogger } from './utils/logger';

import { RunLoaderResult } from 'loader-runner';
import { WorkerTaskData } from './adapters/WorkerTaskData';
import { WorkerTaskLoaderContext } from './utils/WorkerTaskLoaderContext';
import { createWorker } from './adapters/createWorker';
import { proxy } from 'comlink';
import { setupTransferHandler } from './utils/messagePortTransferHandler';

const memoize = require('lodash.memoize');

const nanoid: typeof import('nanoid') = require('nanoid');
const DEFAULT_WORKER_COUNT = os.cpus().length || 1;

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
        acc[1][key] = value;
        acc[0].proxyFnKeys?.push(key);
      } else {
        acc[0][key] = value;
      }

      return acc;
    },

    // marking proxyContext object with proxyMarker, this'll make comlink avoids structured clone

    // note keys to proxied properties are attaches into `context` to be cloned - worker threads
    // can access keys synchronously to reconstruct loaderContext
    [{ proxyFnKeys: [] }, proxy({})] as [{ proxyFnKeys: Array<string> }, object]
  );

/**
 * Naive thread pool to execute functions in loader.
 */
const createPool: (
  maxWorkers?: number
) => {
  dispose: () => Promise<void>;
  runTask: (context: WorkerTaskLoaderContext) => Promise<RunLoaderResult>;
} = memoize((maxWorkers?: number) => {
  setupTransferHandler();
  const poolId = nanoid(6);
  const workerCount = maxWorkers ?? DEFAULT_WORKER_COUNT;
  const log = getLogger(`[${poolId}] threadPool`);
  log.info('createPool: creating worker threads pool with %s maxWorkers', workerCount);

  let taskId = 1;
  let taskCount = 0;
  let timeoutId: NodeJS.Timer | null = null;

  const taskQueue = new Subject<WorkerTaskData>();
  const disposeAwaiter = new Subject();
  const workerQueue = new Subject<ReturnType<typeof createWorker>>();

  //container to hold reference to prepopulated worker instances
  const workerPool = [...new Array(workerCount)].map(() => createWorker(poolId));

  /**
   * Ask thread to exit once queued task completes.
   */
  const closeWorkers = async () => {
    let worker = workerPool.shift();
    while (worker) {
      if (!worker.disposed) {
        log.info(`Closing existing thread ${worker.workerId}`);
        await worker.close();
      }
      worker = workerPool.shift();
    }
  };

  /**
   * Try to exit existing workers when there's no task scheduled within timeout (2sec)
   * If there is any running task when timeout reaches extend timeout to next timeout tick.
   */
  const scheduleTimeout = () => {
    if (timeoutId) {
      log.verbose('ScheduleTimeout: Clearing existing timeout');
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    timeoutId = setTimeout(async () => {
      if (taskCount === 0) {
        log.info('ScheduleTimeout: trying to close workers');
        await closeWorkers();
      } else {
        log.verbose('ScheduleTimeout: there are running task, rescheduleing');
        scheduleTimeout();
      }
    }, 2000);
  };

  /**
   * Run task via worker, raises timeoutError if worker does not respond in timeout period (10sec).
   * Most cases this happens when task is scheduled into disposed worker which released complink proxy already.
   */
  const tryRunTaskWithTimeout = (
    worker: ReturnType<typeof createWorker>,
    id: number,
    context: any,
    proxyContext: object
  ) => {
    let runTaskTimeoutId: NodeJS.Timer | null = null;

    return new Promise((resolve, reject) => {
      runTaskTimeoutId = setTimeout(() => {
        log.info(`Task didn't respond in 10sec from worker [${id}]`);
        if (worker.disposed) {
          workerPool.splice(workerPool.indexOf(worker), 1);
        }
        reject({ timeout: true });
      }, 10000);

      worker.workerProxy.run({ id, logLevel: getLogLevel() }, context, proxyContext).then(
        (result) => {
          if (runTaskTimeoutId) {
            clearTimeout(runTaskTimeoutId);
            runTaskTimeoutId = null;
          }
          resolve(result);
        },
        (err) => {
          if (runTaskTimeoutId) {
            clearTimeout(runTaskTimeoutId);
            runTaskTimeoutId = null;
          }
          reject(err);
        }
      );
    });
  };

  /**
   * Actual task scheduler.
   */
  zip(
    // Each time new task is scheduled, reset timeout for close worker.
    // If this task is scheduled after timeout, it will reinstall worker threads.
    taskQueue.pipe(
      map((v, i) => {
        log.verbose(`Task schduled count [${i}]`);
        scheduleTimeout();

        if (workerPool.length < workerCount) {
          log.info('worker has disposed, reinstall workers');
          for (let idx = workerPool.length; idx < workerCount; idx++) {
            const worker = createWorker(poolId);
            workerPool.push(worker);
            workerQueue.next(worker);
          }
        }
        return v;
      })
    ),
    workerQueue.pipe(
      filter((x) => !x.disposed),
      map((v, i) => {
        log.verbose(`Worker schduled count [${i}]`);
        return v;
      })
    )
  )
    .pipe(
      observeOn(asapScheduler),
      takeUntil(disposeAwaiter),
      mergeMap(async ([task, worker]) => {
        if (!worker || worker.disposed) {
          log.info(`Worker is not available, rescheduling task [${task.id}] to next queue`);
          taskQueue.next(task);
        }
        const { context, proxyContext, id } = task;
        log.info('Running task [%s] via [%s]', task.id, worker.workerId);

        try {
          const result = await tryRunTaskWithTimeout(worker, id, context, proxyContext);
          task.onComplete(result as any);
          return { id, value: true };
        } catch (err) {
          if (!!err && err.timeout) {
            log.info(`Reschedule task [${id}] due to timeout`);
            taskQueue.next(task);
          } else {
            log.info('Unexpected error occurred', err);
            task.onError(err);
          }

          return { id, value: false };
        }
      })
    )
    .subscribe(
      (x) => {
        log.info(`Task [${x.id}] completed ${x.value ? 'successfully' : 'failed'}`);
        taskCount--;

        // Each time task completes, queue new worker to let zip operator picks up task / worker pair
        const worker = workerPool[(x.id + 1) % workerCount];
        workerQueue.next(worker);
      },
      (err) => {
        log.info('Unexpected error occurred', err);
      },
      () => {
        log.info('Completing task pool');
        closeWorkers();
      }
    );

  // Queue all workers when starting scheduler
  workerPool.forEach((w) => workerQueue.next(w));

  return {
    /** Manually close threadpool. */
    dispose: () => {
      disposeAwaiter.next(true);
    },
    /**
     * Queue new task into thread pool and returns result asynchronously.
     */
    runTask: (context: WorkerTaskLoaderContext): Promise<RunLoaderResult> => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      ++taskCount;
      return new Promise((resolve, reject) => {
        const [normalContext, proxyContext] = marshallWorkerDataContext(context);

        taskQueue.next({
          id: taskId++,
          context: normalContext,
          proxyContext: proxyContext,
          onComplete: resolve,
          onError: reject
        });
      });
    }
  };
});

export { createPool, WorkerTaskLoaderContext };
