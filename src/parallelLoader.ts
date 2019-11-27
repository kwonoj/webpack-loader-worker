import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';
import { workerAdapter } from './adapters/jestWorkerAdapter';
import * as debug from 'debug';

const loader = debug('parallelLoader');

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
  const { maxWorkers, debugEnabled } = loaderUtils.getOptions(this);
  if (debugEnabled) {
    debug.enable('parallelLoader*');
  }

  loader('Initializing parallelLoader');
  if (!isWorkerEnabled()) {
    throw new Error('Cannot initialize loader, ensure worker_threads is enabled');
  }

  loader(`Creating worker pool with ${maxWorkers} maximum workers`);
  const worker = workerAdapter({ maxWorkers });
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
      emitError: this.emitError,
      emitWarning: this.emitWarning,
      resolve: this.resolve,
      target: this.target,
      minimize: this.minimize,
      resourceQuery: this.resourceQuery,
      optionsContext: this.rootContext ?? (this as any).options?.context
    };

    loader(`Initializing context for loader runner %O`, context);

    const workerResult = await worker.run(context);
    if (!workerResult) {
      loaderAsyncCallback(new Error('unexpected empty results'));
      return;
    }

    const { fileDependencies, contextDependencies, result } = workerResult;
    (fileDependencies ?? []).forEach((fileDep: string) => this.addDependency(fileDep));
    (contextDependencies ?? []).forEach((contextDep: string) => this.addContextDependency(contextDep));

    loaderAsyncCallback(result);
  } catch (err) {
    loaderAsyncCallback(err);
  }
}

module.exports = parallelLoader;
