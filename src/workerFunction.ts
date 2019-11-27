import * as loaderRunner from 'loader-runner';
import { promisify } from 'util';
import * as fs from 'fs';
import * as debug from 'debug';
import { expose, proxy } from 'comlink';
import { parentPort } from "worker_threads";
import { setupTransferHandler } from './messagePortTransferHandler';
const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

const workerFn = debug('parallelLoader:workerFn');

const asyncLoaderRunner = promisify(loaderRunner.runLoaders.bind(loaderRunner));

const taskRunner = (() => {
  let isRunning = false;
  setupTransferHandler();

  return {
    isAvailable: () => !isRunning,
    run: async (loaderContext: any, loaderProxyFnContext: any) => {
      isRunning = true;

      const loaderOptions: import('loader-runner').RunLoaderOption = {
        ...loaderContext,
        readResource: fs.readFile.bind(fs),
        context: {
          options: {
            context: loaderContext.optionsContext
          },
          fs,
          webpack: true,
          parallelLoader: true
        }
      };

      loaderContext.proxyFnKeys.forEach((key: string) => {
        loaderOptions.context[key] = loaderProxyFnContext[key];
      })

      //loadercontext.resolve accepts callback as param which cannot be transferred into main process via proxied -
      //re-wrap here to hand over proxy wrapped callback instead.
      loaderOptions.context['resolve'] = (context: string, request: string, callback: Function) => {
        loaderProxyFnContext['resolve'](context, request, proxy(callback));
      }

      const result = await asyncLoaderRunner(loaderOptions);

      workerFn(result);

      isRunning = false;
      return result;
    }
  }
})();

expose(taskRunner, nodeEndpoint(parentPort));

export { taskRunner };