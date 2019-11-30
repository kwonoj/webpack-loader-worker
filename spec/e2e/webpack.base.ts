import * as path from 'path';

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const threadLoader = require.resolve('../../dist/cjs/webpackLoaderWorker.js');

const threadLoaderConfig = {
  loader: threadLoader,
  options: {
    logLevel: 'info'
  }
};

const getBaseConfig = (thread: boolean) => ({
  mode: 'none',
  entry: path.resolve(__dirname, '__fixtures__/index.ts'),

  output: {
    path: path.resolve(__dirname, '../../dist/e2e'),
    filename: thread ? 'e2e.thread.bundle.js' : 'e2e.bundle.js'
  },

  resolve: {
    extensions: ['.ts', '.js']
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          thread ? threadLoaderConfig : null,
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              happyPackMode: thread
            }
          }
        ].filter(Boolean),
        exclude: /node_modules/
      },
      {
        test: /\.less$/,
        use: [MiniCssExtractPlugin.loader, thread ? threadLoaderConfig : null, 'css-loader', 'less-loader'].filter(
          Boolean
        )
      }
    ]
  },

  node: false,
  //stats: false,

  plugins: [
    new MiniCssExtractPlugin({
      filename: thread ? 'e2e.thread.sytle.css' : 'e2e.style.css'
    })
  ]
});

export { getBaseConfig };
