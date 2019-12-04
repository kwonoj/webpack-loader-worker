import { RequestToWorker } from './WorkerChannelMessage';
import { RunLoaderResult } from 'loader-runner';
import { TaskMessage } from './TaskMessage';
import { loader } from 'webpack';

interface QueueItem {
  request: TaskMessage;
  onTaskComplete: (error: any, result: RunLoaderResult) => void;
}

type TaskExecutor = (
  id: number,
  task: TaskMessage,
  onTaskComplete: (error: any, result: RunLoaderResult) => void
) => void;

interface QueuedTask {
  task: QueueItem;
  next: QueuedTask | null;
}
class TaskQueue {
  private readonly maxWorkers: number;
  private readonly workerTaskExecutor: TaskExecutor;
  private last: Array<QueuedTask> = [];
  private locks: Array<boolean> = [];
  private offset: number = 0;
  private queue: Array<QueuedTask | null> = [];

  constructor({ maxWorkers, executor }: { maxWorkers: number; executor: TaskExecutor }) {
    this.maxWorkers = maxWorkers;
    this.workerTaskExecutor = executor;
  }

  public doWork(taskContext: loader.LoaderContext): Promise<RunLoaderResult> {
    return new Promise((resolve, reject) => {
      const request: TaskMessage = [RequestToWorker.RUN_LOADER, false, taskContext];

      const onTaskComplete = (error: any, result: RunLoaderResult) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };

      this.push({ request, onTaskComplete });
    });
  }

  private getNextTask(workerId: number): QueueItem | null {
    let queueHead = this.queue[workerId];

    while (queueHead && queueHead.task.request[1]) {
      queueHead = queueHead.next || null;
    }

    this.queue[workerId] = queueHead;

    return queueHead && queueHead.task;
  }

  private process(workerId: number) {
    if (this.isLocked(workerId)) {
      return;
    }

    const task = this.getNextTask(workerId);

    if (!task) {
      return;
    }

    const onComplete = (error: Error | null, result: RunLoaderResult) => {
      task.onTaskComplete(error, result);

      this.unlock(workerId);
      this.process(workerId);
    };

    task.request[1] = true;

    this.lock(workerId);
    this.workerTaskExecutor(workerId, task.request, onComplete);

    return;
  }

  private enqueue(task: QueueItem, workerId: number) {
    const item = { next: null, task };

    if (task.request[1]) {
      return;
    }

    if (this.queue[workerId]) {
      this.last[workerId].next = item;
    } else {
      this.queue[workerId] = item;
    }

    this.last[workerId] = item;
    this.process(workerId);

    return;
  }

  private push(task: QueueItem) {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.enqueue(task, (this.offset + i) % this.maxWorkers);
    }

    this.offset++;
  }

  private lock(workerId: number): void {
    this.locks[workerId] = true;
  }

  private unlock(workerId: number): void {
    this.locks[workerId] = false;
  }

  private isLocked(workerId: number): boolean {
    return this.locks[workerId];
  }
}

export { TaskQueue };
