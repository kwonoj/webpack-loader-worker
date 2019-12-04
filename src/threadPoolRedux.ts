import { TaskQueue } from './taskQueue';
import { WorkerPool } from './workerPool';
import { cpus } from 'os';
import { loader } from 'webpack';

const memoize: typeof import('lodash.memoize') = require('lodash.memoize');

interface ThreadPoolOptions {
  maxWorkers: number;
}

/**
 * Abstracted interface to queue loader task into available worker_threads,
 * returns results asynchronously.
 */
class ThreadPool {
  private readonly maxWorkers: number;
  private readonly workerPool: WorkerPool;
  private readonly taskQueue: TaskQueue;
  private closing: boolean = false;
  private clearId: NodeJS.Timer | null = null;

  constructor({ maxWorkers }: Partial<ThreadPoolOptions>) {
    this.maxWorkers = maxWorkers || Math.max(cpus().length - 1, 1);
    this.workerPool = new WorkerPool({ maxWorkers: this.maxWorkers });
    this.taskQueue = new TaskQueue({
      maxWorkers: this.maxWorkers,
      executor: this.workerPool.send.bind(this.workerPool)
    });

    this.scheduleTimeout();
  }

  public close(): Promise<unknown> {
    if (this.closing) {
      throw new Error('TaskQueue is ended, no more calls can be done to it');
    }
    this.closing = true;

    return this.workerPool.end();
  }

  public runLoaderTask(taskContext: loader.LoaderContext) {
    this.scheduleTimeout();
    return this.taskQueue.doWork(taskContext);
  }

  private scheduleTimeout() {
    if (this.clearId) {
      clearTimeout(this.clearId);
      this.clearId = null;
    }

    this.clearId = setTimeout(() => {
      this.workerPool.end();
    }, 2000);
  }
}

const createThreadPool = memoize((options: ThreadPoolOptions) => new ThreadPool(options));

export { createThreadPool };
