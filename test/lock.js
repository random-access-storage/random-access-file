const test = require('brittle')
const { fork } = require('child_process')

test('2 exclusive locks', function (t) {
  t.plan(2)

  const file = 'test/fixture/exclusive.txt'

  const p1 = fork('test/fixture/lock.js', [file])

  p1.on('message', (message) => {
    t.alike(message, { opened: true }, 'lock granted')

    const p2 = fork('test/fixture/lock.js', [file])

    p2.on('message', (message) => {
      t.alike(message, {
        opened: false,
        error: {
          code: 'ELOCKED',
          path: file
        }
      }, 'lock denied')

      p1.kill()
      p2.kill()
    })
  })
})

test('2 shared locks', function (t) {
  t.plan(2)

  const file = 'test/fixture/shared.txt'

  const p1 = fork('test/fixture/lock.js', [file, '--writable=false'])

  p1.on('message', (message) => {
    t.alike(message, { opened: true }, 'lock granted')

    const p2 = fork('test/fixture/lock.js', [file, '--writable=false'])

    p2.on('message', (message) => {
      t.alike(message, { opened: true }, 'lock granted')

      p1.kill()
      p2.kill()
    })
  })
})

test('2 shared locks + 1 exclusive lock', function (t) {
  t.plan(3)

  const file = 'test/fixture/shared.txt'

  const p1 = fork('test/fixture/lock.js', [file, '--writable=false'])

  p1.on('message', (message) => {
    t.alike(message, { opened: true }, 'lock granted')

    const p2 = fork('test/fixture/lock.js', [file, '--writable=false'])

    p2.on('message', (message) => {
      t.alike(message, { opened: true }, 'lock granted')

      const p3 = fork('test/fixture/lock.js', [file])

      p3.on('message', (message) => {
        t.alike(message, {
          opened: false,
          error: {
            code: 'ELOCKED',
            path: file
          }
        }, 'lock denied')

        p1.kill()
        p2.kill()
        p3.kill()
      })
    })
  })
})

test('1 exclusive lock + 1 shared lock', function (t) {
  t.plan(2)

  const file = 'test/fixture/shared.txt'

  const p1 = fork('test/fixture/lock.js', [file])

  p1.on('message', (message) => {
    t.alike(message, { opened: true }, 'lock granted')

    const p2 = fork('test/fixture/lock.js', [file, '--writable=false'])

    p2.on('message', (message) => {
      t.alike(message, {
        opened: false,
        error: {
          code: 'ELOCKED',
          path: file
        }
      }, 'lock denied')

      p1.kill()
      p2.kill()
    })
  })
})
