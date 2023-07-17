const path = require('path');
module.exports = {
  target: 'node',
  mode: 'production',
  entry: './scraper.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'web.js',
  },
}