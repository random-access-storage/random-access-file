const test = require('brittle')
const os = require('os')
const path = require('path')
const fs = require('fs')
const RAF = require('..')

const tmp = path.join(os.tmpdir(), 'random-access-file-' + process.pid + '-' + Date.now())
let i = 0

fs.mkdirSync(tmp, { recursive: true })

test('write and read', function (t) {
  t.plan(4)

  const file = new RAF(gen())

  file.write(0, Buffer.from('hello'), function (err) {
    t.absent(err, 'no error')
    file.read(0, 5, function (err, buf) {
      t.absent(err, 'no error')
      t.alike(buf, Buffer.from('hello'))
      file.unlink(() => t.pass())
    })
  })
})

test('read before write', function (t) {
  t.plan(2)

  const file = new RAF(gen())

  file.read(0, 0, function (err, buf) {
    t.ok(err, 'not created')
    file.unlink(() => t.pass())
  })
})

test('read range before write', function (t) {
  t.plan(2)

  const file = new RAF(gen())

  file.read(0, 5, function (err, buf) {
    t.ok(err, 'not created')
    file.unlink(() => t.pass())
  })
})

test('read range > file', function (t) {
  t.plan(3)

  const file = new RAF(gen())

  file.write(0, Buffer.from('hello'), function (err) {
    t.absent(err, 'no error')
    file.read(0, 10, function (err, buf) {
      t.ok(err, 'not satisfiable')
      file.unlink(() => t.pass())
    })
  })
})

test('random access write and read', function (t) {
  t.plan(8)

  const file = new RAF(gen())

  file.write(10, Buffer.from('hi'), function (err) {
    t.absent(err, 'no error')
    file.write(0, Buffer.from('hello'), function (err) {
      t.absent(err, 'no error')
      file.read(10, 2, function (err, buf) {
        t.absent(err, 'no error')
        t.alike(buf, Buffer.from('hi'))
        file.read(0, 5, function (err, buf) {
          t.absent(err, 'no error')
          t.alike(buf, Buffer.from('hello'))
          file.read(5, 5, function (err, buf) {
            t.absent(err, 'no error')
            t.alike(buf, Buffer.from([0, 0, 0, 0, 0]))
          })
        })
      })
    })
  })
})

test('re-open', function (t) {
  t.plan(4)

  const name = gen()
  const file = new RAF(name)

  file.write(10, Buffer.from('hello'), function (err) {
    t.absent(err, 'no error')
    file.close(function (err) {
      t.absent(err, 'no error')
      const file2 = new RAF(name)
      file2.read(10, 5, function (err, buf) {
        t.absent(err, 'no error')
        t.alike(buf, Buffer.from('hello'))
      })
    })
  })
})

test('re-open and truncate', function (t) {
  t.plan(3)

  const name = gen()
  const file = new RAF(name)

  file.write(10, Buffer.from('hello'), function (err) {
    t.absent(err, 'no error')
    file.close(function (err) {
      t.absent(err, 'no error')
      const file2 = new RAF(name, { truncate: true })
      file2.read(10, 5, function (err, buf) {
        t.ok(err, 'file should be truncated')
      })
    })
  })
})

test('truncate with size', function (t) {
  t.plan(3)

  const file = new RAF(gen(), { size: 100 })

  file.stat(function (err, st) {
    t.absent(err, 'no error')
    t.is(st.size, 100)
    file.unlink(() => t.pass())
  })
})

test('bad open', {
  // windows apparently allow you to open dirs :/
  skip: process.platform === 'win32'
}, function (t) {
  t.plan(2)

  const file = new RAF(tmp)

  file.open(function (err) {
    t.ok(err)
    file.close(() => t.pass())
  })
})

test('mkdir path', function (t) {
  t.plan(4)

  const name = path.join(tmp, ++i + '-folder', 'test.txt')
  const file = new RAF(name)

  file.write(0, Buffer.from('hello'), function (err) {
    t.absent(err, 'no error')
    file.read(0, 5, function (err, buf) {
      t.absent(err, 'no error')
      t.alike(buf, Buffer.from('hello'))
      file.unlink(() => t.pass())
    })
  })
})

test('write/read big chunks', async function (t) {
  t.plan(2)

  const file = new RAF(gen())
  const bigBuffer = Buffer.alloc(10 * 1024 * 1024)

  bigBuffer.fill('hey. hey. how are you doing?. i am good thanks how about you? i am good')

  const io = t.test('write and read')
  io.plan(6)

  file.write(0, bigBuffer, function (err) {
    io.absent(err, 'no error')
    file.read(0, bigBuffer.length, function (err, buf) {
      io.absent(err, 'no error')
      io.alike(buf, bigBuffer)
    })
  })
  file.write(bigBuffer.length * 2, bigBuffer, function (err) {
    io.absent(err, 'no error')
    file.read(bigBuffer.length * 2, bigBuffer.length, function (err, buf) {
      io.absent(err, 'no error')
      io.alike(buf, bigBuffer)
    })
  })

  await io

  file.unlink(() => t.pass())
})

test('rmdir option', function (t) {
  t.plan(5)

  const name = path.join('rmdir', ++i + '', 'folder', 'test.txt')
  const file = new RAF(name, { rmdir: true, directory: tmp })

  file.write(0, Buffer.from('hi'), function (err) {
    t.absent(err, 'no error')
    file.read(0, 2, function (err, buf) {
      t.absent(err, 'no error')
      t.alike(buf, Buffer.from('hi'))
      file.unlink(onunlink)
    })
  })

  function onunlink (err) {
    t.absent(err, 'no error')
    fs.stat(path.join(tmp, 'rmdir'), function (err) {
      t.is(err && err.code, 'ENOENT', 'should be removed')
    })
  }
})

test('rmdir option with non empty parent', function (t) {
  t.plan(7)

  const name = path.join('rmdir', ++i + '', 'folder', 'test.txt')
  const nonEmpty = path.join(tmp, name, '../..')
  const file = new RAF(name, { rmdir: true, directory: tmp })

  file.write(0, Buffer.from('hi'), function (err) {
    t.absent(err, 'no error')
    fs.writeFileSync(path.join(nonEmpty, 'thing'), '')
    file.read(0, 2, function (err, buf) {
      t.absent(err, 'no error')
      t.alike(buf, Buffer.from('hi'))
      file.unlink(onunlink)
    })
  })

  function onunlink (err) {
    t.absent(err, 'no error')
    fs.stat(path.join(tmp, 'rmdir'), function (err) {
      t.absent(err, 'should not be removed')
      fs.readdir(nonEmpty, function (err, list) {
        t.absent(err, 'no error')
        t.alike(list, ['thing'], 'should only be one entry')
      })
    })
  }
})

test('del, partial file block', function (t) {
  t.plan(8)

  const file = new RAF(gen())

  file.write(0, Buffer.alloc(100, 0xff), function (err) {
    t.absent(err, 'no error')
    file.del(0, 40, function (err) {
      t.absent(err, 'no error')
      file.read(0, 40, function (err, buf) {
        t.absent(err, 'no error')
        t.alike(buf, Buffer.alloc(40))
        file.del(50, 50, function (err) {
          t.absent(err, 'no error')
          file.read(50, 50, function (err, buf) {
            t.absent(err, 'no error')
            t.alike(buf, Buffer.alloc(50))
            file.unlink(() => t.pass())
          })
        })
      })
    })
  })
})

test('del, whole file block', function (t) {
  t.plan(7)

  const file = new RAF(gen(), { truncate: true, sparse: true })

  file.stat(function (err, st) {
    t.absent(err, 'no error')
    file.write(0, Buffer.alloc(st.blksize * 100), function (err) {
      t.absent(err, 'no error')
      file.stat(function (err, before) {
        t.absent(err, 'no error')
        file.del(st.blksize * 20, st.blksize * 50, function (err) {
          t.absent(err, 'no error')
          file.stat(function (err, after) {
            t.absent(err, 'no error')
            t.comment(before.blocks + ' -> ' + after.blocks + ' blocks')
            t.ok(after.blocks < before.blocks, 'fewer blocks')
            file.unlink(() => t.pass())
          })
        })
      })
    })
  })
})

test('del, partial and whole', function (t) {
  t.plan(7)

  const file = new RAF(gen(), { truncate: true, sparse: true })

  file.stat(function (err, st) {
    t.absent(err, 'no error')
    file.write(0, Buffer.alloc(st.blksize * 100), function (err) {
      t.absent(err, 'no error')
      file.stat(function (err, before) {
        t.absent(err, 'no error')
        file.del(st.blksize * 20 - 483, st.blksize * 50 + 851, function (err) {
          t.absent(err, 'no error')
          file.stat(function (err, after) {
            t.absent(err, 'no error')
            t.comment(before.blocks + ' -> ' + after.blocks + ' blocks')
            t.ok(after.blocks < before.blocks, 'fewer blocks')
            file.unlink(() => t.pass())
          })
        })
      })
    })
  })
})

// TODO: remove this test when we deprecate this usage of delete
test('del, infinity', function (t) {
  t.plan(4)

  const file = new RAF(gen(), { size: 100 })

  file.del(0, Infinity, function (err) {
    t.absent(err, 'no error')
    file.stat(function (err, st) {
      t.absent(err, 'no error')
      t.is(st.size, 0)
      file.unlink(() => t.pass())
    })
  })
})

test('truncate', function (t) {
  t.plan(7)

  const file = new RAF(gen(), { size: 100 })

  file.truncate(50, function (err) {
    t.absent(err, 'no error')
    file.stat(function (err, st) {
      t.absent(err, 'no error')
      t.is(st.size, 50)
      file.truncate(20, function (err) {
        t.absent(err, 'no error')
        file.stat(function (err, st) {
          t.absent(err, 'no error')
          t.is(st.size, 20)
          file.unlink(() => t.pass())
        })
      })
    })
  })
})

test('open and close many times', function (t) {
  t.plan(3)

  const name = gen()
  const file = new RAF(name)
  const buf = Buffer.alloc(4)

  file.write(0, buf, function (err) {
    t.absent(err, 'no error')
    file.close(function (err) {
      t.absent(err, 'no error')
      loop(5000, function (err) {
        t.absent(err, 'no error')
      })
    })
  })

  function loop (n, cb) {
    const file = new RAF(name)
    file.read(0, 4, function (err, buffer) {
      if (err) return cb(err)
      if (!buf.equals(buffer)) {
        t.alike(buffer, buf)
        return cb()
      }
      buf.writeUInt32BE(n)
      file.write(0, buf, function (err) {
        if (err) return cb(err)
        file.close(function (err) {
          if (!n || err) return cb(err)
          loop(n - 1, cb)
        })
      })
    })
  }
})

test('cannot escape directory', function (t) {
  t.plan(2)

  const name = '../../../../../../../../../../../../../tmp'
  const file = new RAF(name, { truncate: true, directory: tmp })

  file.open(function (err) {
    t.absent(err, 'no error')
    t.is(file.filename, path.join(tmp, 'tmp'))
  })
})

test('directory filename resolves correctly', function (t) {
  const name = 'test.txt'
  const file = new RAF(name, { directory: tmp })
  t.is(file.filename, path.join(tmp, name))
})

test('unlink', async function (t) {
  t.plan(5)

  const name = gen()
  const file = new RAF(name)

  file.write(0, Buffer.from('hi'), function (err) {
    t.absent(err, 'no error')
    file.read(0, 2, function (err, buf) {
      t.absent(err, 'no error')
      t.alike(buf, Buffer.from('hi'))
      file.unlink(onunlink)
    })
  })

  function onunlink (err) {
    t.absent(err, 'no error')
    fs.stat(name, function (err) {
      t.is(err && err.code, 'ENOENT', 'should be removed')
    })
  }
})

function gen () {
  return path.join(tmp, ++i + '.txt')
}
