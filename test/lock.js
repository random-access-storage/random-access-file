const test = require('brittle')
const RAF = require('..')

test('2 writers', function (t) {
  t.plan(4)

  const file = 'test/fixture/exclusive.txt'

  const a = new RAF(file, { lock: true })
  const b = new RAF(file, { lock: true })

  a.open(function (err) {
    t.absent(err, 'a granted lock')

    b.open(function (err) {
      t.ok(err, 'b denied lock')

      a.close(() => t.pass('a closed'))
      b.close(() => t.pass('b closed'))
    })
  })
})

test('2 readers', function (t) {
  t.plan(4)

  const file = 'test/fixture/shared.txt'

  const a = new RAF(file, { lock: true, writable: false })
  const b = new RAF(file, { lock: true, writable: false })

  a.open(function (err) {
    t.absent(err, 'a granted lock')

    b.open(function (err) {
      t.absent(err, 'b granted lock')

      a.close(() => t.pass('a closed'))
      b.close(() => t.pass('b closed'))
    })
  })
})

test('2 readers + 1 writer', function (t) {
  t.plan(6)

  const file = 'test/fixture/shared.txt'

  const a = new RAF(file, { lock: true, writable: false })
  const b = new RAF(file, { lock: true, writable: false })
  const c = new RAF(file, { lock: true })

  a.open(function (err) {
    t.absent(err, 'a granted lock')

    b.open(function (err) {
      t.absent(err, 'b granted lock')

      c.open(function (err) {
        t.ok(err, 'c denied lock')

        a.close(() => t.pass('a closed'))
        b.close(() => t.pass('b closed'))
        c.close(() => t.pass('c closed'))
      })
    })
  })
})

test('1 writer + 1 reader', function (t) {
  t.plan(4)

  const file = 'test/fixture/exclusive.txt'

  const a = new RAF(file, { lock: true })
  const b = new RAF(file, { lock: true, writable: false })

  a.open(function (err) {
    t.absent(err, 'a granted lock')

    b.open(function (err) {
      t.ok(err, 'b denied lock')

      a.close(() => t.pass('a closed'))
      b.close(() => t.pass('b closed'))
    })
  })
})
