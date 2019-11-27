import * as loaderRunner from 'loader-runner';
import { promisify } from 'util';
import * as fs from 'fs';
import * as debug from 'debug';

const workerFn = debug('parallelLoader:workerFn');

const asyncLoaderRunner = promisify(loaderRunner.runLoaders.bind(loaderRunner));

async function loaderWorkerFunction(loaderContext: any) {
  const loaderOptions: import('loader-runner').RunLoaderOption = {
    ...loaderContext,
    readResource: fs.readFile.bind(fs),
    //todo: custom context option support (loadmodule, fs...)
    context: {
      resolve: () => {
        throw new Error('not yet implemented');
      },
      loadModule: () => {
        throw new Error('not yet implemented');
      },
      fs,
      emitWarning: (warning: object) => {
        workerFn(warning);
      },
      emitError: (error: object) => {
        workerFn(error);
      },
      options: {
        context: loaderContext.optionsContext
      },
      webpack: true,
      parallelLoader: true
    }
  };

  workerFn(`Configured loader option %O`, loaderOptions);

  return asyncLoaderRunner(loaderOptions);
}

export { loaderWorkerFunction };
