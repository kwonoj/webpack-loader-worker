import * as fs from 'fs';
import * as loaderRunner from 'loader-runner';

import { enableLoggerGlobal, getLogger } from '../utils/logger';
import { expose, proxy } from 'comlink';

import { WorkerTaskLoaderContext } from '../utils/WorkerTaskLoaderContext';
import { parentPort } from 'worker_threads';
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

/**
 * Interface to allow running specified task in worker threads,
 * exposed via comlink proxy.
 */
const taskRunner = (() => {
  setupTransferHandler();
  let isRunning = false;

  return {
    isAvailable: () => !isRunning,
    close: () => process.exit(isRunning ? -1 : 0),
    run: async (
      task: { id: number; logLevel: 'verbose' | 'info' },
      context: Partial<WorkerTaskLoaderContext> & { proxyFnKeys: Array<string> },
      proxyContext: object
    ): Promise<loaderRunner.RunLoaderResult> => {
      isRunning = true;

      const { id, logLevel } = task;
      enableLoggerGlobal(logLevel);
      const log = getLogger(`[${id}] taskRunner`);
      log.info('Executing task');

      const loaderOptions = buildLoaderOption(context, proxyContext);

      const result = await asyncLoaderRunner(loaderOptions);
      log.info('Task completed');

      isRunning = false;
      return result;
    }
  };
})();

expose(taskRunner, nodeEndpoint(parentPort));

export { taskRunner };
