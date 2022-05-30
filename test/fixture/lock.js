const RAF = require('../..')

const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['writable'],
  default: {
    writable: true
  }
})

const file = new RAF(argv._[0], {
  writable: argv.writable
})

file.open(function (err) {
  if (err) {
    return process.send({
      opened: false,
      error: err
    })
  }

  process.send({ opened: true })

  while (true) {
    //
  }
})
