import * as fs from 'fs';
import * as loaderRunner from 'loader-runner';

import { expose, proxy } from 'comlink';

import { WorkerTaskData } from './WorkerTaskData';
import { getLogger } from '../utils/logger';
import { parentPort } from 'worker_threads';
import { promisify } from 'util';
import { setupTransferHandler } from '../utils/messagePortTransferHandler';

const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

const asyncLoaderRunner = promisify(loaderRunner.runLoaders.bind(loaderRunner));

/**
 * Construct option object for loaderRunner.
 */
const buildLoaderOption = (context: $TSFIXME, proxyContext: $TSFIXME): loaderRunner.RunLoaderOption => {
  // context is plain object cloned from main process
  const options = {
    ...context,
    // For fs, we won't try to proxy from Webpack::loader::LoaderContext as
    // it's complex object.
    readResource: fs.readFile.bind(fs),
    context: {
      options: {
        context: context.optionsContext
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

  return options;
};

/**
 * Interface to allow running specified task in worker threads,
 * exposed via comlink proxy.
 */
const taskRunner = (() => {
  let isRunning = false;
  setupTransferHandler();

  return {
    isAvailable: () => !isRunning,
    run: async (task: Pick<WorkerTaskData, 'id' | 'context' | 'proxyContext'>) => {
      isRunning = true;

      const { id, context, proxyContext } = task;
      const log = getLogger(`[${id}] taskRunner`);
      log.info('Executing task');

      const loaderOptions = buildLoaderOption(context, proxyContext);
      log.verbose('Constructed loader options %O', loaderOptions);

      const result = await asyncLoaderRunner(loaderOptions);
      log.info('Task completed');
      log.verbose('Task result %O', result);

      isRunning = false;
      return result;
    }
  };
})();

expose(taskRunner, nodeEndpoint(parentPort));

export { taskRunner };
