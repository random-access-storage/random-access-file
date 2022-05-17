const RAF = require('.')
const file = new RAF('hello.txt')

const max = 500 * 1024 * 1024
const buf = Buffer.alloc(1024)
buf.fill('lo')

let offset = 0
write()

function write () {
  file.write(offset, buf, afterWrite)
}

function afterWrite (err) {
  if (err) throw err
  if (offset >= max) return done()
  offset += buf.length
  write()
}

function done () {
  console.log('wrote hello.txt')
}
