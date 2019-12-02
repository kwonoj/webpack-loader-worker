import * as fs from 'fs';
import * as loaderRunner from 'loader-runner';

import { Subject, from, of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { enableLoggerGlobal, getLogger } from '../utils/logger';
import { expose, proxy } from 'comlink';
import { parentPort, workerData } from 'worker_threads';

import { WorkerTaskData } from './WorkerTaskData';
import { WorkerTaskLoaderContext } from '../utils/WorkerTaskLoaderContext';
import { promisify } from 'util';
import { setupTransferHandler } from '../utils/messagePortTransferHandler';

const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

const asyncLoaderRunner = promisify(loaderRunner.runLoaders.bind(loaderRunner));

/**
 * Construct option object for loaderRunner.
 */
const buildLoaderOption = (
  context: Partial<WorkerTaskLoaderContext> & { proxyFnKeys: Array<string> },
  proxyContext: object
): loaderRunner.RunLoaderOption => {
  // context is plain object cloned from main process
  const options = {
    ...context,
    // For fs, we won't try to proxy from Webpack::loader::LoaderContext as
    // it's complex object.
    readResource: fs.readFile.bind(fs),
    context: {
      options: {
        context: context.rootContext
      },
      fs,
      webpack: true
    }
  };

  // also context appends all available keys for proxied object,
  // augument option object using it
  context.proxyFnKeys.forEach((key: string) => (options.context[key] = proxyContext[key]));

  // Webpack::loader::LoaderContext::resolve expects callback fn as param.
  // Same as proxied fn from main process to worker, callback fn in worker cannot be
  // cloned into main process - we'll wrap `resolve` here to forward proxy fn
  options.context['resolve'] = (resolveContext: string, request: string, callback: Function) =>
    proxyContext['resolve'](resolveContext, request, proxy(callback));

  return options as loaderRunner.RunLoaderOption;
};

type TaskQueueContext = Omit<WorkerTaskData, 'id'> & { task: { id: number; logLevel: 'verbose' | 'info' } };

/**
 * Interface to allow running specified task in worker threads,
 * exposed via comlink proxy.
 */
const taskRunner = (() => {
  const workerTaskQueue = new Subject<TaskQueueContext>();
  let isRunning = false;
  let isClosed = false;
  const { loaderId, workerId } = workerData;
  const log = getLogger(`[${loaderId}:${workerId}] taskRunner`);

  const run = async (queuedTask: TaskQueueContext) => {
    isRunning = true;
    const { task, context, proxyContext } = queuedTask;
    const { id, logLevel } = task;
    enableLoggerGlobal(logLevel);
    log.info(`Executing task [${id}]`);

    const loaderOptions = buildLoaderOption(context, proxyContext);

    const result = await asyncLoaderRunner(loaderOptions);
    log.info(`Task completed [${id}]`);

    isRunning = false;
    return result;
  };

  workerTaskQueue
    .pipe(
      mergeMap((queuedTask: any) =>
        from(run(queuedTask)).pipe(
          map((result) => ({ result, onComplete: queuedTask.onComplete })),
          catchError((err) => {
            log.info(`Task error [${queuedTask.task.id}]`, err);
            return of({ err, onError: queuedTask.onError });
          })
        )
      )
    )
    .subscribe(
      (taskResult: any) => {
        const { result, err, onComplete, onError } = taskResult;
        if (err) {
          onError(err);
        } else {
          onComplete(result);
        }
      },
      (e) => {
        log.info('Unexpected error occured, exiting thread', e);
        process.exit(-1);
      },
      () => {
        log.info('Exiting thread');
        process.exit(0);
      }
    );

  return {
    isAvailable: () => !isClosed && !isRunning,
    close: () => {
      isClosed = true;
      workerTaskQueue.complete();
    },
    run: (
      task: { id: number; logLevel: 'verbose' | 'info' },
      context: Partial<WorkerTaskLoaderContext> & { proxyFnKeys: Array<string> },
      proxyContext: object
    ): Promise<loaderRunner.RunLoaderResult> =>
      new Promise<loaderRunner.RunLoaderResult>((resolve, reject) => {
        workerTaskQueue.next({
          task,
          context,
          proxyContext,
          onComplete: resolve,
          onError: reject
        });
      })
  };
})();

setupTransferHandler();
expose(taskRunner, nodeEndpoint(parentPort));

export { taskRunner };
