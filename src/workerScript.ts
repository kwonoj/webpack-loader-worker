import * as fs from 'fs';
import * as loaderRunner from 'loader-runner';

import { MessagePort, parentPort } from 'worker_threads';
import { RequestToMain, RequestToWorker, ResponseFromMain, ResponseFromWorker } from './WorkerChannelMessage';

import { TaskMessage } from './TaskMessage';
import { loader } from 'webpack';
import { serializeError } from './utils/serializeError';

/**
 * Payload to be forwareded when new task requested to execute.
 *
 * This'll include own messageport to communicate with main thread
 */
interface TaskRequestHandshake {
  port?: MessagePort;
  request: TaskMessage;
}

/**
 * Actual task executor in worker thread.
 */
class WorkerFunctionRunner {
  private readonly workingTask = new Set();
  public start() {
    this.initializeTaskListener();
  }

  /**
   * Prepare proxy fn for loaderContext in worker thread to main thread.
   * Since context payload is cloned into worker, we'll augment without worrying
   * of creating side effect in main thread.
   */
  private augmentLoaderOptions(context: loader.LoaderContext, port: MessagePort): loaderRunner.RunLoaderOption {
    const ret = {
      resource: context.resource,
      loaders: context.loaders,
      context,
      readResource: fs.readFile.bind(fs)
    };

    // [todo]: do we need this?
    context['options'] = {
      context: context.rootContext
    };

    // We'll use node.js' fs directly
    context.fs = fs;

    // for unsupported functions we'll emit error
    const unsupport = (
      msg = 'webpack-loader-worker does not support deprecated properties https://webpack.js.org/api/loaders/#deprecated-context-properties'
    ) => () => {
      proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_EMIT_ERROR)(msg);
    };

    // thread cannot support sync functions but also these are marked as deprecated
    context.exec = unsupport();
    context.resolveSync = unsupport() as any;

    // generic proxy fn does not need to get results back
    const proxyFunctionWithoutCallbackResult = (fnName: RequestToMain) => (...args: Array<any>) =>
      port.postMessage([fnName, ...args]);

    // proxy fn needs callback result
    const proxyFunctionWithCallback = (fn: [RequestToMain, ResponseFromMain]) => (...args: Array<any>) => {
      const argsToTransfer = args.slice(0, args.length - 1);
      const originalCallback = args[args.length - 1];

      function callbackResponseEventHandler(response: [ResponseFromMain, any, any]) {
        if (response[0] !== fn[1]) {
          return;
        }

        //[todo]: create error object from serialized?
        originalCallback(response[1], response[2]);
        port.off('message', callbackResponseEventHandler);
      }

      port.on('message', callbackResponseEventHandler);
      port.postMessage([fn[0], ...argsToTransfer]);
    };

    context.emitError = (message) =>
      proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_EMIT_ERROR)(serializeError(message));
    context.emitWarning = (message) =>
      proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_EMIT_WARNING)(serializeError(message));
    context.addDependency = proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_ADDDEPENDENCY);
    context.dependency = proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_DEPENDENCY);
    context.addContextDependency = proxyFunctionWithoutCallbackResult(
      RequestToMain.LOADER_CONTEXT_ADD_CONTEXT_DEPENDENCY
    );
    context.clearDependencies = proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_CLEAR_DEPENDENCIES);
    //[todo]: can we trasnfer buffer from emitFile's fn param?
    context.emitFile = proxyFunctionWithoutCallbackResult(RequestToMain.LOADER_CONTEXT_EMIT_FILE);

    context.resolve = proxyFunctionWithCallback([
      RequestToMain.LOADER_CONTEXT_RESOLVE,
      ResponseFromMain.LOADER_CONTEXT_RESOLVE
    ]);
    context.loadModule = unsupport('webpack-loader-worker does not support loadModule');

    return ret;
  }

  private closePort() {
    if (this.workingTask.size === 0) {
      parentPort?.postMessage(ResponseFromWorker.COMPLETE_CLOSE_PARENT_PORT);
      parentPort?.close();
      return true;
    }
    return false;
  }

  /**
   * Setup event listener from parentPort. Each actual task to acquire
   * will handshake by hand over messageport through this listener.
   *
   */
  private initializeTaskListener() {
    const functionRunnerContext = this;
    parentPort?.on('message', function(this: WorkerFunctionRunner, { port, request }: TaskRequestHandshake) {
      if (request[0] === RequestToWorker.EXIT_THREAD) {
        let clearId: NodeJS.Timer | null = null;
        const setClear = () =>
          setTimeout(() => {
            if (clearId) {
              clearTimeout(clearId);
              clearId = null;
            }

            if (functionRunnerContext.closePort()) {
              return;
            } else {
              clearId = setClear();
            }
          }, 1000);

        if (!functionRunnerContext.closePort()) {
          clearId = setClear();
        }
      }

      if (port && request[0] === RequestToWorker.RUN_LOADER) {
        functionRunnerContext.workingTask.add(port);

        const runnerOptions = functionRunnerContext.augmentLoaderOptions(request[2], port);

        loaderRunner.runLoaders(runnerOptions, (err, result) => {
          if (err) {
            port.postMessage([ResponseFromWorker.COMPLETE_LOADER_ERROR, err]);
          } else {
            const transferLists = Object.values(result)
              .filter((x) => ArrayBuffer.isView(x))
              .map((x) => x.buffer);
            port.postMessage([ResponseFromWorker.COMPLETE_LOADER_SUCCESS, result], transferLists ?? []);
          }

          // runner's completion gaurantees we won't need messagechannel for this task anymore
          port.close();
          if (functionRunnerContext.workingTask.has(port)) {
            functionRunnerContext.workingTask.delete(port);
          }
        });
      }
    });
  }
}

(() => {
  const runner = new WorkerFunctionRunner();
  runner.start();
})();
