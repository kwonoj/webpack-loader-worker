import * as loaderRunner from 'loader-runner';
import { promisify } from 'util';
import * as fs from 'fs';

const asyncLoaderRunner = promisify(loaderRunner.runLoaders.bind(loaderRunner));

const loaderWorkerFunction = async (loaderContext: any) => {
  const loaderOptions: import('loader-runner').RunLoaderOption = {
    ...loaderContext,
    readResource: fs.readFile.bind(fs),
    options: {
      context: loaderContext.optionsContext
    },
    webpack: true,
    parallelLoader: true
  };

  return asyncLoaderRunner(loaderOptions);
};

export { loaderWorkerFunction };
