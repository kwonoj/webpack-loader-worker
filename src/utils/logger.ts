import * as debug from 'debug';

const DEFAULT_NAMESPACE = '[LoaderWorker]';
const VERBOSE_NAMESPACE = `[DEBUG] ${DEFAULT_NAMESPACE}`;

const getLogger = (namespace: string) => ({
  info: debug(`${DEFAULT_NAMESPACE} [${namespace}]`),
  verbose: debug(`${VERBOSE_NAMESPACE} [${namespace}]`)
});

const enableLoggerGlobal = (verbose: boolean) => {
  debug.enable(`${DEFAULT_NAMESPACE}*`);

  if (verbose) {
    debug.enable(`${VERBOSE_NAMESPACE}*`);
  }
};

export { getLogger, enableLoggerGlobal };
