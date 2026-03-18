const render = require('./render');
const runtime = require('./runtime');
const { main } = require('./cli');

module.exports = {
  ...render,
  ...runtime,
  main
};
