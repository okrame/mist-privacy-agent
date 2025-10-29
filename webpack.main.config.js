module.exports = {
  entry: {
    main: './src/main/main.js',
    preload: './src/main/preload.js'
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json', '.node']
  },
  output: {
    filename: '[name].js' // keep entrypoint names: main.js, preload.js
  },
};