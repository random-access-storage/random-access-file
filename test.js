var raf = require('./')
var tape = require('tape')
var os = require('os')
var path = require('path')
var fs = require('fs')

var tmp = path.join(os.tmpDir(), 'random-access-file-' + process.pid + '-' + Date.now())
var i = 0

try {
  fs.mkdirSync(tmp)
} catch (err) {
  // ...
}

tape('write and read', function (t) {
  var file = raf(gen())

  file.write(0, Buffer('hello'), function (err) {
    t.error(err, 'no error')
    file.read(0, 5, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer('hello'))
      t.end()
      file.unlink()
      file.close()
    })
  })
})

tape('read empty', function (t) {
  var file = raf(gen())

  file.read(0, 0, function (err, buf) {
    t.error(err, 'no error')
    t.same(buf, Buffer(0), 'empty buffer')
    t.end()
    file.unlink()
    file.close()
  })
})

tape('read range > file', function (t) {
  var file = raf(gen())

  file.read(0, 5, function (err, buf) {
    t.ok(err, 'not satisfiable')
    t.end()
    file.unlink()
    file.close()
  })
})

tape('random access write and read', function (t) {
  var file = raf(gen())

  file.write(10, Buffer('hi'), function (err) {
    t.error(err, 'no error')
    file.write(0, Buffer('hello'), function (err) {
      t.error(err, 'no error')
      file.read(10, 2, function (err, buf) {
        t.error(err, 'no error')
        t.same(buf, Buffer('hi'))
        file.read(0, 5, function (err, buf) {
          t.error(err, 'no error')
          t.same(buf, Buffer('hello'))
          file.read(5, 5, function (err, buf) {
            t.error(err, 'no error')
            t.same(buf, Buffer([0, 0, 0, 0, 0]))
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

  file.write(10, Buffer('hello'), function (err) {
    t.error(err, 'no error')
    var file2 = raf(name)
    file2.read(10, 5, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer('hello'))
      t.end()
    })
  })
})

tape('re-open and truncate', function (t) {
  var name = gen()
  var file = raf(name)

  file.write(10, Buffer('hello'), function (err) {
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

  file.write(0, Buffer('hello'), function (err) {
    t.error(err, 'no error')
    file.read(0, 5, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer('hello'))
      t.end()
      file.unlink()
      file.close()
    })
  })
})

function gen () {
  return path.join(tmp, ++i + '.txt')
}
