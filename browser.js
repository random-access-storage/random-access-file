module.exports = function () {
  if (!(window && window.process && window.process.type)) {
    throw new Error('random-access-file is not supported in the browser')
  }
}
