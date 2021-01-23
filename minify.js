var compressor = require('node-minify');
 
// Using Google Closure Compiler
compressor.minify({
  compressor: 'gcc',
  publicFolder: './public/',
  input: ['renderer.js', 'setup.js', 'shader.js'],
  output: 'out.js',
  callback: function(err, min) {}
});