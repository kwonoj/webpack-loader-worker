import * as loaderUtils from 'loader-utils';

import { enableLoggerGlobal, getLogger } from './utils/logger';

import { createPool } from './threadPool';
import { isWorkerEnabled } from './utils/isWorkerEnabled';
import { loader } from 'webpack';

const nanoid: typeof import('nanoid') = require('nanoid');

const buildWorkerLoaderContext = (context: loader.LoaderContext, log: ReturnType<typeof getLogger>) => {
  // Create object inherit current context except
  // few values we won't forward / or need augmentation.
  //
  // fs is complex object to proxy, we'll let worker inject node's fs directly
  const { fs, callback, async, ...ret } = context;

  //augment few properties
  ret['loaders'] = context.loaders.slice(context.loaderIndex + 1).map((l) => ({
    loader: l.path,
    options: l.options,
    ident: l.ident
  }));
  ret.resource = context.resourcePath + (context.resourceQuery || '');

  log.verbose('buildWorkerLoaderContext: created context %O', ret);
  return ret;
};

/**
 * Entrypoint to loader function, initializes threadpool & schedule each loader tasks.
 */
async function webpackLoaderWorker(this: loader.LoaderContext) {
  const loaderId = nanoid(6);
  const { maxWorkers, logLevel } = loaderUtils.getOptions(this);
  enableLoggerGlobal(logLevel);

  const log = getLogger(`[${loaderId}] LoaderWorker`);
  log.info('Initializing LoaderWorker');

  if (!isWorkerEnabled()) {
    throw new Error('Cannot initialize loader, ensure worker_threads is enabled');
  }

  const pool = createPool(loaderId, maxWorkers);
  // acquire async completion callback from webpack, let webpack know
  // this is async loader
  const loaderAsyncCompletionCallback = this.async()!;
  log.info('LoaderWorker ready, preparing context to run loader task');

  const taskContext = buildWorkerLoaderContext(this, log);

  try {
    log.info('Queue loader task into threadpool');
    const taskResult = await pool.runTask(taskContext);

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
    log.info('Unexpected error occurred %O', err);
    loaderAsyncCompletionCallback(err);
  }
}

module.exports = webpackLoaderWorker;
