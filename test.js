var raf = require('./')
var tape = require('tape')
var os = require('os')
var path = require('path')
var fs = require('fs')

var tmp = path.join(os.tmpdir(), 'random-access-file-' + process.pid + '-' + Date.now())
var i = 0

try {
  fs.mkdirSync(tmp)
} catch (err) {
  // ...
}

tape('write and read', function (t) {
  var file = raf(gen())

  file.write(0, Buffer.from('hello'), function (err) {
    t.error(err, 'no error')
    file.read(0, 5, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('hello'))
      file.destroy(() => t.end())
    })
  })
})

tape('read empty', function (t) {
  var file = raf(gen(), {writable: true})

  file.read(0, 0, function (err, buf) {
    t.error(err, 'no error')
    t.same(buf, Buffer.alloc(0), 'empty buffer')
    file.destroy(() => t.end())
  })
})

tape('read range > file', function (t) {
  var file = raf(gen())

  file.read(0, 5, function (err, buf) {
    t.ok(err, 'not satisfiable')
    file.destroy(() => t.end())
  })
})

tape('random access write and read', function (t) {
  var file = raf(gen())

  file.write(10, Buffer.from('hi'), function (err) {
    t.error(err, 'no error')
    file.write(0, Buffer.from('hello'), function (err) {
      t.error(err, 'no error')
      file.read(10, 2, function (err, buf) {
        t.error(err, 'no error')
        t.same(buf, Buffer.from('hi'))
        file.read(0, 5, function (err, buf) {
          t.error(err, 'no error')
          t.same(buf, Buffer.from('hello'))
          file.read(5, 5, function (err, buf) {
            t.error(err, 'no error')
            t.same(buf, Buffer.from([0, 0, 0, 0, 0]))
            t.end()
          })
        })
      })
    })
  })
})

tape('re-open', function (t) {
  var name = gen()
  var file = raf(name)

  file.write(10, Buffer.from('hello'), function (err) {
    t.error(err, 'no error')
    var file2 = raf(name)
    file2.read(10, 5, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('hello'))
      t.end()
    })
  })
})

tape('re-open and truncate', function (t) {
  var name = gen()
  var file = raf(name)

  file.write(10, Buffer.from('hello'), function (err) {
    t.error(err, 'no error')
    var file2 = raf(name, {truncate: true})
    file2.read(10, 5, function (err, buf) {
      t.ok(err, 'file should be truncated')
      t.end()
    })
  })
})

tape('mkdir path', function (t) {
  var name = path.join(tmp, ++i + '-folder', 'test.txt')
  var file = raf(name)

  file.write(0, Buffer.from('hello'), function (err) {
    t.error(err, 'no error')
    file.read(0, 5, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('hello'))
      t.end()
      file.destroy()
    })
  })
})

function gen () {
  return path.join(tmp, ++i + '.txt')
}
