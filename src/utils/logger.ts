const DEFAULT_NAMESPACE = '[LoaderWorker      ]';
const VERBOSE_NAMESPACE = '[LoaderWorker:DEBUG]';

let logLevel: 'verbose' | 'info';
const getLogger = (namespace: string) => {
  const logFn = (name: string) => (message: string, ...args: Array<any>) =>
    console.log(`${name} ${namespace} ${message}`, ...args);

  const ret = {
    info: (message: string, ...args: Array<any>) => {
      if (logLevel === 'verbose' || logLevel === 'info') {
        logFn(DEFAULT_NAMESPACE)(message, ...args);
      }
    },
    verbose: (message: string, ...args: Array<any>) => {
      if (logLevel === 'verbose') {
        logFn(VERBOSE_NAMESPACE)(message, ...args);
      }
    }
  };

  return ret;
};

const enableLoggerGlobal = (value: 'verbose' | 'info') => {
  logLevel = value;
};

export { getLogger, enableLoggerGlobal };
