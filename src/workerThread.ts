import * as path from 'path';

import { MessageChannel, Worker } from 'worker_threads';
import { RequestToMain, RequestToWorker, ResponseFromMain, ResponseFromWorker } from './WorkerChannelMessage';
import { TaskCompletionCallback, TaskMessage } from './TaskMessage';

import { loader } from 'webpack';
import { serializeError } from './utils/serializeError';

/**
 * worker_threads worker instance with metadata & boostrap logics to enable
 * inter-thread communication to main process.
 */
class WorkerThread {
  private readonly exitPromise: Promise<void> = new Promise((resolve) => (this.resolveExitPromise = resolve));
  private forceExited = false;
  private workerThread!: Worker;
  private resolveExitPromise!: () => void;
  private request: TaskMessage | null = null;
  private currentRequestCompletionCallback: TaskCompletionCallback | null = null;
  private _closed = false;

  constructor(private readonly _workerId: number) {
    this.initialize();
  }

  public get closed(): boolean {
    return this._closed;
  }

  public get workerId(): number {
    return this._workerId;
  }

  public waitForExit() {
    return this.exitPromise;
  }

  public forceExit() {
    this.forceExited = true;
    this._closed = true;
    this.workerThread.terminate();
  }

  public requestTask(request: TaskMessage, onTaskComplete: TaskCompletionCallback) {
    this.currentRequestCompletionCallback = onTaskComplete;
    this.request = request;

    const { port1, port2 } = new MessageChannel();

    const onComplete = (err: any, result: any) => {
      // Clean the request to avoid sending past requests to workers that fail
      // while waiting for a new request (timers, unhandled rejections...)
      this.request = null;
      this.currentRequestCompletionCallback = null;
      onTaskComplete(err, result);
    };

    const loaderContext = request[2];
    function taskEventHandler(value: [ResponseFromWorker | RequestToMain, ...Array<any>]) {
      const channel = value[0];

      if (channel === ResponseFromWorker.COMPLETE_LOADER_SUCCESS) {
        onComplete(null, value[1]);
      } else if (channel === ResponseFromWorker.COMPLETE_LOADER_ERROR) {
        onComplete(value[1], null);
      } else if (channel === RequestToMain.LOADER_CONTEXT_EMIT_WARNING) {
        loaderContext.emitWarning(value[1]);
      } else if (channel === RequestToMain.LOADER_CONTEXT_EMIT_ERROR) {
        loaderContext.emitError(value[1]);
      } else if (channel === RequestToMain.LOADER_CONTEXT_LOAD_MODULE) {
        //unspported
      } else if (channel === RequestToMain.LOADER_CONTEXT_RESOLVE) {
        loaderContext.resolve(value[1], value[2], (err, result) => {
          port1.postMessage([ResponseFromMain.LOADER_CONTEXT_RESOLVE, err ? serializeError(err) : undefined, result]);
        });
      } else if (channel === RequestToMain.LOADER_CONTEXT_ADDDEPENDENCY) {
        loaderContext.addDependency(value[1]);
      } else if (channel === RequestToMain.LOADER_CONTEXT_DEPENDENCY) {
        loaderContext.dependency(value[1]);
      } else if (channel === RequestToMain.LOADER_CONTEXT_ADD_CONTEXT_DEPENDENCY) {
        loaderContext.addContextDependency(value[1]);
      } else if (channel === RequestToMain.LOADER_CONTEXT_CLEAR_DEPENDENCIES) {
        loaderContext.clearDependencies();
      } else if (channel === RequestToMain.LOADER_CONTEXT_EMIT_FILE) {
        loaderContext.emitFile(value[1], value[2], value[3]);
      }
    }

    port1.on('message', taskEventHandler);

    this.workerThread.postMessage(
      {
        port: port2,
        request: [this.request[0], this.request[1], this.createTransferValue(this.request[2])]
      },
      [port2]
    );
  }

  public requestExit() {
    const workerThreadContext = this;
    this.request = [RequestToWorker.EXIT_THREAD, false] as any;
    function exitHandler(value: any) {
      if (value === ResponseFromWorker.COMPLETE_CLOSE_PARENT_PORT) {
        workerThreadContext.workerThread.off('message', exitHandler);
        workerThreadContext.request = null;
      }
    }
    this.workerThread.on('message', exitHandler);
    this._closed = true;
    this.workerThread.postMessage({ request: this.request });
  }

  private createTransferValue(context: loader.LoaderContext) {
    const { fs, callback, async, _module, _compilation, _compiler, ...transferContext } = context;

    Object.entries(transferContext).forEach(([key, value]) => {
      if (typeof value === 'function') {
        delete transferContext[key];
      }
    });

    //augment few properties
    transferContext['loaders'] = context.loaders.slice(context.loaderIndex + 1).map((l) => ({
      loader: l.path,
      options: l.options,
      ident: l.ident
    }));
    transferContext.resource = context.resourcePath + (context.resourceQuery || '');

    return transferContext;
  }

  private initialize(): void {
    this.workerThread = new Worker(path.resolve(__dirname, 'workerScript.js'), {
      stderr: true,
      stdout: true
    });

    this.workerThread.on('exit', this.onWorkerThreadExit.bind(this));
  }

  private shutdown() {
    this.resolveExitPromise();
  }

  private onWorkerThreadExit(exitCode: number) {
    if (exitCode !== 0 && !this.forceExited) {
      this.initialize();

      if (this.request && this.currentRequestCompletionCallback) {
        this.requestTask(this.request, this.currentRequestCompletionCallback);
      }
    } else {
      this.shutdown();
    }
  }
}

export { WorkerThread };
