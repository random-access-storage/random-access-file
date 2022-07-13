const RandomAccessStorage = require('random-access-storage')
const fs = require('fs')
const path = require('path')
const constants = fs.constants || require('constants') // eslint-disable-line n/no-deprecated-api

let fsext = null
try {
  fsext = require('fs-native-extensions')
} catch {
  try { // tmp workaround for places where fsctl is bundled...
    fsext = {
      tryLock: require('fsctl').lock,
      sparse: () => Promise.resolve()
    }
  } catch {}
}

const RDWR = constants.O_RDWR
const RDONLY = constants.O_RDONLY
const WRONLY = constants.O_WRONLY
const CREAT = constants.O_CREAT

module.exports = class RandomAccessFile extends RandomAccessStorage {
  constructor (filename, opts = {}) {
    const size = opts.size || 0
    const truncate = !!opts.truncate || size > 0

    super({ createAlways: truncate })

    if (opts.directory) filename = path.join(opts.directory, path.resolve('/', filename).replace(/^\w+:\\/, ''))

    this.directory = opts.directory || null
    this.filename = filename
    this.fd = 0

    const {
      readable = true,
      writable = true
    } = opts

    this.mode = readable && writable ? RDWR : (readable ? RDONLY : WRONLY)

    this._size = size
    this._truncate = truncate
    this._rmdir = !!opts.rmdir
    this._lock = opts.lock === true
    this._sparse = opts.sparse === true
    this._alloc = opts.alloc || Buffer.allocUnsafe
  }

  _open (req) {
    const self = this
    const mode = this.mode | (req.create ? CREAT : 0)

    if (req.create) fs.mkdir(path.dirname(this.filename), { recursive: true }, ondir)
    else ondir(null)

    function ondir (err) {
      if (err) return req.callback(err)

      if (self.fd) fs.close(self.fd, oncloseold)
      else fs.open(self.filename, mode, onopen)
    }

    function onopen (err, fd) {
      if (err) return onerror(err)

      self.fd = fd

      if (!self._lock || !fsext) return onlock(null)

      // Should we aquire a read lock?
      const shared = self.mode === RDONLY

      if (fsext.tryLock(self.fd, { shared })) onlock(null)
      else onlock(createLockError(self.filename))
    }

    function onlock (err) {
      if (err) return onerrorafteropen(err)

      if (!self._sparse || !fsext) return onsparse(null)

      fsext.sparse(self.fd).then(onsparse, onsparse)
    }

    function onsparse (err) {
      if (err) return onerrorafteropen(err)

      if (!self._truncate) return ontruncate(null)

      fs.ftruncate(self.fd, self._size, ontruncate)
    }

    function oncloseold (err) {
      if (err) return onerrorafteropen(err)

      self.fd = 0
      fs.open(self.filename, mode, onopen)
    }

    function ontruncate (err) {
      if (err) return onerrorafteropen(err)

      req.callback(null)
    }

    function onerror (err) {
      req.callback(err)
    }

    function onerrorafteropen (err) {
      fs.close(self.fd, function () {
        self.fd = 0
        onerror(err)
      })
    }
  }

  _write (req) {
    const data = req.data
    const fd = this.fd

    fs.write(fd, data, 0, req.size, req.offset, onwrite)

    function onwrite (err, wrote) {
      if (err) return req.callback(err)

      req.size -= wrote
      req.offset += wrote

      if (!req.size) return req.callback(null)
      fs.write(fd, data, data.length - req.size, req.size, req.offset, onwrite)
    }
  }

  _read (req) {
    const self = this
    const data = req.data || this._alloc(req.size)
    const fd = this.fd

    if (!req.size) return process.nextTick(readEmpty, req)
    fs.read(fd, data, 0, req.size, req.offset, onread)

    function onread (err, read) {
      if (err) return req.callback(err)
      if (!read) return req.callback(createReadError(self.filename, req.offset, req.size))

      req.size -= read
      req.offset += read

      if (!req.size) return req.callback(null, data)
      fs.read(fd, data, data.length - req.size, req.size, req.offset, onread)
    }
  }

  _del (req) {
    const fd = this.fd

    fs.fstat(fd, onstat)

    function onstat (err, st) {
      if (err) return req.callback(err)
      if (req.offset + req.size < st.size) return req.callback(null)
      fs.ftruncate(fd, req.offset, ontruncate)
    }

    function ontruncate (err) {
      req.callback(err)
    }
  }

  _stat (req) {
    fs.fstat(this.fd, onstat)

    function onstat (err, st) {
      req.callback(err, st)
    }
  }

  _close (req) {
    const self = this

    fs.close(this.fd, onclose)

    function onclose (err) {
      if (err) return req.callback(err)
      self.fd = 0
      req.callback(null)
    }
  }

  _destroy (req) {
    const self = this

    const root = this.directory && path.resolve(path.join(this.directory, '.'))
    let dir = path.resolve(path.dirname(this.filename))

    fs.unlink(this.filename, onunlink)

    function onunlink (err) {
      if (!self._rmdir || !root || dir === root) return req.callback(err)
      fs.rmdir(dir, onrmdir)
    }

    function onrmdir (err) {
      dir = path.join(dir, '..')
      if (err || dir === root) return req.callback(null)
      fs.rmdir(dir, onrmdir)
    }
  }
}

function readEmpty (req) {
  req.callback(null, Buffer.alloc(0))
}

function createLockError (path) {
  const err = new Error('ELOCKED: File is locked')
  err.code = 'ELOCKED'
  err.path = path
  return err
}

function createReadError (path, offset, size) {
  const err = new Error('EPARTIALREAD: Could not satisfy length')
  err.code = 'EPARTIALREAD'
  err.path = path
  err.offset = offset
  err.size = size
  return err
}
