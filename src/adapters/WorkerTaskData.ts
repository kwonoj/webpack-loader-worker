import { RunLoaderResult } from 'loader-runner';
import { WorkerTaskLoaderContext } from '../utils/WorkerTaskLoaderContext';

/**
 * Object will be queued into taskqueue to forward into worker.
 */
interface WorkerTaskData {
  id: number;
  /**
   * Transferrable context without proxy, mostly POJO
   */
  context: Partial<WorkerTaskLoaderContext> & { proxyFnKeys: Array<string> };
  /**
   * Webpack.loader.LoaderContext's function which cannot be
   * transferred, wrapped as comlink proxy
   */
  proxyContext: object;
  /**
   * callback being called once worker completes its job with results
   */
  onComplete: (value?: RunLoaderResult) => void;
  /**
   * callback being called once worker raises error
   */
  onError: (err?: unknown) => void;
}

export { WorkerTaskData };
