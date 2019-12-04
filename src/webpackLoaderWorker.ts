import * as loaderUtils from 'loader-utils';

import { enableLoggerGlobal, getLogger } from './utils/logger';

import { createThreadPool } from './threadPoolRedux';
import { isWorkerEnabled } from './utils/isWorkerEnabled';
import { loader } from 'webpack';

const once = require('lodash.once');

let loaderIdCount = 0;

/**
 * Entrypoint to loader function, initializes threadpool & schedule each loader tasks.
 */
async function webpackLoaderWorker(this: loader.LoaderContext) {
  const loaderId = loaderIdCount++;

  const { maxWorkers, logLevel } = loaderUtils.getOptions(this) ?? {};
  enableLoggerGlobal(logLevel);

  const log = getLogger(`[${loaderId}] LoaderWorker`);
  log.info('Initializing LoaderWorker');

  if (!isWorkerEnabled()) {
    throw new Error('Cannot initialize loader, ensure worker_threads is enabled');
  }

  const pool = createThreadPool({ maxWorkers });

  // acquire async completion callback from webpack, let webpack know
  // this is async loader
  const loaderAsyncCompletionCallback = once(this.async()!);
  log.info('LoaderWorker ready, preparing context to run loader task');

  //const taskContext = buildWorkerLoaderContext(this, log);

  try {
    log.info('Queue loader task into threadpool');
    const taskResult = await pool.runLoaderTask(this);
    log.info('Queued task completed');

    if (!taskResult) {
      log.info('Task completed without result');
      return;
    } else {
      log.verbose('Task result retured %O', taskResult);
    }

    const { fileDependencies, contextDependencies, result } = taskResult;

    (fileDependencies ?? []).forEach((fileDep: string) => this.addDependency(fileDep));
    (contextDependencies ?? []).forEach((contextDep: string) => this.addContextDependency(contextDep));

    log.info('Notifying webpack for loader task completion');

    if (result) {
      loaderAsyncCompletionCallback(null, ...(result as any));
    } else {
      loaderAsyncCompletionCallback(null, undefined);
    }
  } catch (err) {
    log.info('Unexpected error occurred', err);
    loaderAsyncCompletionCallback(err);
  }
}

module.exports = webpackLoaderWorker;
