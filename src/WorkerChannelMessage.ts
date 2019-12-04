/**
 * Message channel identifier for request to worker from main thread.
 *
 */
const enum RequestToWorker {
  EXIT_THREAD = 0,
  RUN_LOADER
}

/**
 * Message channel identifier for response from worker to main thread
 * when worker received `RequestToWorker` message.
 */
const enum ResponseFromWorker {
  COMPLETE_LOADER_SUCCESS = 100,
  COMPLETE_LOADER_ERROR,
  COMPLETE_CLOSE_PARENT_PORT
}

/**
 * Message channel identifier for request from worker to main thread.
 *
 * There are few cases worker need to setup request fn proxy such as
 * `LoaderContext.resolve` param for callback function.
 */
const enum RequestToMain {
  LOADER_CONTEXT_EMIT_WARNING = 200,
  LOADER_CONTEXT_EMIT_ERROR,
  LOADER_CONTEXT_LOAD_MODULE,
  LOADER_CONTEXT_RESOLVE,
  LOADER_CONTEXT_ADDDEPENDENCY,
  LOADER_CONTEXT_DEPENDENCY,
  LOADER_CONTEXT_ADD_CONTEXT_DEPENDENCY,
  LOADER_CONTEXT_CLEAR_DEPENDENCIES,
  LOADER_CONTEXT_EMIT_FILE
}

/**
 * Message channel identifier for response from main to worker thread.
 *
 * When worker's callback proxy make request, main thread will deliver
 * results back to worker via this message channel.
 */
const enum ResponseFromMain {
  LOADER_CONTEXT_RESOLVE = 300
}

export { RequestToWorker, ResponseFromWorker, RequestToMain, ResponseFromMain };
