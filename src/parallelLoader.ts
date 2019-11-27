import { loader } from 'webpack';

function parallelLoader(this: loader.LoaderContext) {
  throw new Error('Not implemented');
}

export { parallelLoader };
