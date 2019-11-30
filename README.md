[![Package version](https://badgen.net/npm/v/webpack-loader-worker)](https://www.npmjs.com/package/webpack-loader-worker)
[![Node engine version](https://badgen.net/npm/node/webpack-loader-worker)](https://www.npmjs.com/package/webpack-loader-worker)

# webpack-loader-worker

`webpack-loader-worker` runs the following loaders in node.js `worker_threads` pool. It works as similar to [thread-loader](https://github.com/webpack-contrib/thread-loader), but only supports native node.js worker threads. (node.js >= 12. Version below 12 are untested)

## Install

```sh
npm install --save-dev webpack-loader-worker
```

## Usage

Put this loader in front of other loaders. The following loaders run in a worker pool. Loaders running in a thread pool are limited, does not have full access to webpack loader's context.

### Configuration examples
```ts
use: [
  {
    loader: "webpack-loader-worker",
    options: {
      // the number of spawned workers, defaults to (number of cpus - 1)
      maxWorkers: 2,
      logLevel: 'info' | 'verbose'
    }
  },
  // your expensive loader (e.g babel-loader)
]
```

## Credits

While this module is **NOT** officially affiliated, it relies on a lot of prior art from [`thread-loader`](https://github.com/webpack-contrib/thread-loader). You may notice some similar logic, and it is expected.