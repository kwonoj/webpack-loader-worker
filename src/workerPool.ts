import { TaskCompletionCallback, TaskMessage } from './TaskMessage';

import { WorkerThread } from './workerThread';

// How long to wait for the child process to terminate
// after CHILD_MESSAGE_END before sending force exiting.
const FORCE_EXIT_DELAY = 5000;
interface PoolExitResult {
  forceExited: boolean;
}

interface WorkerInterface {
  requestTask(task: TaskMessage, onTaskComplete: TaskCompletionCallback): void;
  requestExit(): void;
  forceExit(): void;
  waitForExit(): Promise<void>;
  closed: boolean;
}

/**
 * Creating & bridging execution to actual worker threads instances.
 */
class WorkerPool {
  private readonly workers: Array<WorkerInterface>;

  constructor(private readonly options: { maxWorkers: number }) {
    this.workers = new Array(this.options.maxWorkers);
    this.invalidateWorkers();
  }

  getWorkers(): Array<WorkerInterface> {
    return this.workers;
  }

  getWorkerById(workerId: number): WorkerInterface {
    return this.workers[workerId];
  }

  send(workerId: number, task: TaskMessage, onTaskComplete: TaskCompletionCallback): void {
    let worker = this.getWorkerById(workerId);
    while (worker.closed) {
      this.invalidateWorkers();
      worker = this.getWorkerById(workerId);
    }
    worker.requestTask(task, onTaskComplete);
  }

  async end(): Promise<PoolExitResult> {
    // We do not cache the request object here. If so, it would only be only
    // processed by one of the workers, and we want them all to close.
    const workerExitPromises = this.workers.map(async (worker) => {
      worker.requestExit();

      // Schedule a force exit in case worker fails to exit gracefully so
      // await worker.waitForExit() never takes longer than FORCE_EXIT_DELAY
      let forceExited = false;
      const forceExitTimeout = setTimeout(() => {
        worker.forceExit();
        forceExited = true;
      }, FORCE_EXIT_DELAY);

      await worker.waitForExit();
      // Worker ideally exited gracefully, don't send force exit then
      clearTimeout(forceExitTimeout);

      return forceExited;
    });

    const workerExits = await Promise.all(workerExitPromises);
    return workerExits.reduce<PoolExitResult>(
      (result, forceExited) => ({
        forceExited: result.forceExited || forceExited
      }),
      { forceExited: false }
    );
  }

  private invalidateWorkers() {
    for (let workerId = 0; workerId < this.options.maxWorkers; workerId++) {
      const existingWorker = this.workers[workerId];
      if (!!existingWorker && !existingWorker.closed) {
        continue;
      }

      delete this.workers[workerId];
      const worker = new WorkerThread(workerId);
      this.workers[workerId] = worker;
    }
  }
}

export { WorkerPool };
