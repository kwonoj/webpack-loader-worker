import { loader } from 'webpack';

/**
 * Create copy of current LoaderContext to run in worker threads.
 *
 * Note: webpack-loader-worker will not support context properties
 * marked as deprecated (https://webpack.js.org/api/loaders/#deprecated-context-properties)
 */
const buildWorkerLoaderContext = (context: loader.LoaderContext) => {
  // - We don't need to foward callback / async
  // - _module, _compilation, _compiler is marked as deprecated
  // - Worker thread will inject node's fs instead of proxy context's fs
  const { fs, callback, async, _module, _compilation, _compiler, ...restContext } = context;

  // Split functions from clonable context object since function cannot be copied into worker.
  // Functions will be proxied into main process instead.
  const [contextObject, contextFunctions] = Object.entries(restContext).reduce(
    (acc, [key, value]) => {
      acc[typeof value !== 'function' ? 0 : 1][key] = value;
      return acc;
    },
    [{}, {}]
  );

  //augment few properties
  contextObject['loaders'] = context.loaders.slice(context.loaderIndex + 1).map((l) => ({
    loader: l.path,
    options: l.options,
    ident: l.ident
  }));
  contextObject['resource'] = context.resourcePath + (context.resourceQuery || '');

  return {
    contextObject,
    contextFunctions
  };
};

export { buildWorkerLoaderContext };
