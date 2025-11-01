// webpack.main.config.js
const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  target: 'electron-main',
  entry: {
    main: './src/main/main.js',
    preload: './src/main/preload.js',
  },
   externalsPresets: { node: true, electron: true },

  externals: [
    ({ request }, cb) => {
      if (!request) return cb();
      if (
        request === 'node-llama-cpp' ||
        request.startsWith('@node-llama-cpp/') ||
        request === '@reflink/reflink'
      ) {
        return cb(null, 'commonjs ' + request);
      }
      cb();
    },
  ],

  plugins: [
    // Ignore other platform backends you don't ship
    new webpack.IgnorePlugin({
      resourceRegExp: /^@node-llama-cpp\/(linux|win32|darwin-x64|.*cuda.*|.*vulkan.*)/,
    }),
  ],
  
  module: {
    rules: [
      { test: /\.node$/, use: 'node-loader' },
    ],
  },

  resolve: { extensions: ['.js', '.json', '.node'] },

  // Ensure Node can require(".webpack/main") -> index.js
  output: {
    filename: (pathData) =>
      pathData.chunk && pathData.chunk.name === 'main' ? 'index.js' : '[name].js',
  },
};