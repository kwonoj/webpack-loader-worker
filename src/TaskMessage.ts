import { RequestToWorker } from './WorkerChannelMessage';
import { RunLoaderResult } from 'loader-runner';
import { loader } from 'webpack';

type TaskMessage = [
  RequestToWorker,
  boolean, // processed
  loader.LoaderContext // raw context from loader
];

type TaskCompletionCallback = (error: any, result: RunLoaderResult) => void;

export { TaskMessage, TaskCompletionCallback };
