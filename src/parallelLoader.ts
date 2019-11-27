import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';
import * as debug from 'debug';
import { createPool } from './threadPool';
const nanoid: typeof import('nanoid') = require('nanoid');

const loader = debug('parallelLoader:pitch');

/**
 * naive detection if node.js allowed to use worker_threads
 */
const isWorkerEnabled = () => {
  try {
    const worker = require('worker_threads');
    return worker.isMainThread;
  } catch (err) {
    return false;
  }
};

/**
 * Entrypoint to parall-loader initializes thread pool & execute loaders.
 */
async function parallelLoader(this: loader.LoaderContext) {
  const loaderId = nanoid();

  const { maxWorkers, loglevel } = loaderUtils.getOptions(this);
  if (loglevel === 'verbose') {
    debug.enable('parallelLoader*');
  }

  loader('Initializing parallelLoader: %s', loaderId);
  if (!isWorkerEnabled()) {
    throw new Error('Cannot initialize loader, ensure worker_threads is enabled');
  }

  loader(`Creating worker pool with ${maxWorkers} maximum workers`);

  const pool = createPool();
  const loaderAsyncCallback = this.async()!;

  try {
    const context = {
      loaders: this.loaders.slice(this.loaderIndex + 1).map(l => {
        return {
          loader: l.path,
          options: l.options,
          ident: l.ident
        };
      }),
      resource: this.resourcePath + (this.resourceQuery || ''),
      sourceMap: this.sourceMap,
      target: this.target,
      minimize: this.minimize,
      resourceQuery: this.resourceQuery,
      emitError: this.emitError,
      emitWarning: this.emitWarning,
      resolve: this.resolve,
      loadModule: this.loadModule,
      //fs: this.fs,
      optionsContext: this.rootContext ?? (this as any).options?.context
    };

    loader(`Created context for loader runner %O`, context);

    const workerResult: any = await pool.runTask(context);

    loader(`Worker returned result %O`, workerResult);

    if (!workerResult) {
      loader(`worker returned empty result`);
      return;
    }

    const { fileDependencies, contextDependencies, result } = workerResult;
    loader(`Worker returned result %O`, result);

    (fileDependencies ?? []).forEach((fileDep: string) => this.addDependency(fileDep));
    (contextDependencies ?? []).forEach((contextDep: string) => this.addContextDependency(contextDep));

    loader(`Returning compiled result back to webpack`);
    loaderAsyncCallback(null, ...result);

    await pool.complete();
  } catch (err) {
    loaderAsyncCallback(err);
  }
}

module.exports = parallelLoader;
