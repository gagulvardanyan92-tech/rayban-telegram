const path = require('path');
const webpack = require('webpack');
module.exports = {
  mode: 'production', target: 'web', entry: './app.js', devtool: false,
  output: {path: path.resolve(__dirname, 'dist'), filename: 'app.js'},
  resolve: {alias: {'node-localstorage':false, socks:false},fallback: {fs:false, net:false, tls:false, crypto:false, stream:false, assert:false, events:false, constants:false,
    path:require.resolve('path-browserify'), os:require.resolve('os-browserify/browser'), util:require.resolve('util/')}},
  plugins: [new webpack.ProvidePlugin({Buffer:['buffer','Buffer'], process:'process/browser'})],
  performance: {hints: false}
};
