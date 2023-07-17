const path = require('path');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
  },
  externals: {
    'chrome-aws-lambda': 'chrome-aws-lambda',
    'puppeteer-core': 'puppeteer-core'
  }
};