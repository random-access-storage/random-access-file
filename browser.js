module.exports =
  !(window && window.process && window.process.type)
    ? function() { throw new Error('random-access-file is not supported in the browser') }
    : require('./')
