const render = require('./render');
const runtime = require('./runtime');
const redact = require('./redact');
const stepGuide = require('./step-guide');
const { main } = require('./cli');

module.exports = {
  ...render,
  ...runtime,
  ...redact,
  ...stepGuide,
  main
};
