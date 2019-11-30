import { loader } from 'webpack';

/**
 * Object to be cloned from main process to worker thread.
 */
type WorkerTaskLoaderContext = Omit<
  loader.LoaderContext,
  'fs' | 'callback' | 'async' | '_module' | '_compilation' | '_compiler'
>;

export { WorkerTaskLoaderContext };
