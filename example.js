var raf = require('./')

var file = raf('hello.txt', {length: 0})

var buf = Buffer(1024)
buf.fill('lo')
write()

function write () {
  if (file.length >= 5 * 1024 * 1024) return done()
  file.write(file.length, buf, write)
}

function done () {
  console.log('wrote hello.txt')
}
