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
const PAGE_BUFFER_SIZE = 65536

class Pool {
  constructor (maxSize) {
    this.maxSize = maxSize
    this.active = []
  }

  _onactive (file) {
    // suspend a random one when the pool
    if (this.active.length >= this.maxSize) {
      const r = Math.floor(Math.random() * this.active.length)
      this.active[r].suspend()
    }

    file._pi = this.active.push(file) - 1
  }

  _oninactive (file) {
    const head = this.active.pop()
    if (head !== file) {
      head._pi = file._pi
      this.active[head._pi] = head
    }
  }
}

module.exports = class RandomAccessFile extends RandomAccessStorage {
  constructor (filename, opts = {}) {
    const size = opts.size || (opts.truncate ? 0 : -1)

    super()

    if (opts.directory) filename = path.join(opts.directory, path.resolve('/', filename).replace(/^\w+:\\/, ''))

    this.directory = opts.directory || null
    this.filename = filename
    this.fd = 0

    const {
      readable = true,
      writable = true
    } = opts

    this.mode = readable && writable ? RDWR : (readable ? RDONLY : WRONLY)

    this._pi = 0 // pool index
    this._pool = opts.pool || null
    this._size = size
    this._rmdir = !!opts.rmdir
    this._lock = opts.lock === true
    this._sparse = opts.sparse === true
    this._alloc = opts.alloc || Buffer.allocUnsafe
    this._alwaysCreate = size >= 0
    this._pages = new Map()
  }

  static createPool (maxSize) {
    return new Pool(maxSize)
  }

  _open (req) {
    const create = this._alwaysCreate || this.writing // .writing comes from RAS
    const self = this
    const mode = this.mode | (create ? CREAT : 0)

    if (create) fs.mkdir(path.dirname(this.filename), { recursive: true }, ondir)
    else ondir(null)

    function ondir (err) {
      if (err) return req.callback(err)
      fs.open(self.filename, mode, onopen)
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

      if (!self._sparse || !fsext || self.mode === RDONLY) return onsparse(null)

      fsext.sparse(self.fd).then(onsparse, onsparse)
    }

    function onsparse (err) {
      if (err) return onerrorafteropen(err)

      if (self._size < 0) return ontruncate(null)

      fs.ftruncate(self.fd, self._size, ontruncate)
    }

    function ontruncate (err) {
      if (err) return onerrorafteropen(err)
      if (self._pool !== null) self._pool._onactive(self)
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
    const self = this
    const data = req.data
    const fd = this.fd

    fs.write(fd, data, 0, req.size, req.offset, onwrite)

    function onwrite (err, wrote) {
      if (err) return req.callback(err)

      req.size -= wrote
      req.offset += wrote

      if (!req.size) {
        self._pages.clear()
        req.callback(null)
        return
      }

      fs.write(fd, data, data.length - req.size, req.size, req.offset, onwrite)
    }
  }

  _read (req) {
    const self = this
    const data = req.data || this._alloc(req.size)
    const index = Math.floor(req.offset / PAGE_BUFFER_SIZE)

    if (req.size === 0) {
      req.callback(null, data)
      return
    }

    let offset = 0
    let rel = req.offset - (index * PAGE_BUFFER_SIZE)

    this._loadPage(index, onpage)

    function onpage (err, page) {
      if (err) {
        req.callback(err)
        return
      }
      if (page.size !== PAGE_BUFFER_SIZE && req.offset + req.size > page.index * PAGE_BUFFER_SIZE + page.size) {
        req.callback(createReadError(self.filename, req.offset, req.size))
        return
      }

      const missing = data.byteLength - offset
      const chunk = page.buffer.subarray(rel, rel + missing)

      data.set(chunk, offset)

      offset += chunk.byteLength
      rel = 0

      if (offset === data.byteLength) {
        req.callback(null, data)
        return
      }

      self._loadPage(page.index + 1, onpage)
    }
  }

  _loadPage (index, onpage) {
    const self = this

    let p = this._pages.get(index)

    if (p) {
      if (p.buffer) {
        onpage(null, p)
        return
      }
      p.waiting.push(onpage)
      return
    }

    p = {
      index,
      size: 0,
      buffer: null,
      waiting: []
    }

    this._pages.set(index, p)

    const fd = this.fd
    const buffer = this._alloc(PAGE_BUFFER_SIZE)

    let size = buffer.byteLength
    let offset = index * PAGE_BUFFER_SIZE

    fs.read(fd, buffer, 0, size, offset, onread)

    function onread (err, read) {
      if (err) {
        done(err, null)
        return
      }

      if (!read) {
        buffer.fill(0, buffer.byteLength - size)
        done(null, p)
        return
      }

      size -= read
      offset += read
      p.size += read

      if (size === 0) {
        done(null, p)
        return
      }

      fs.read(fd, buffer, buffer.byteLength - size, size, offset, onread)
    }

    function done (err, p) {
      const waiting = p.waiting

      if (err) {
        self._pages.delete(index)
      } else {
        p.waiting = null
        p.buffer = buffer
      }

      onpage(err, p)
      for (let i = 0; i < waiting.length; i++) waiting[i](err, p)
    }
  }

  _del (req) {
    const self = this
    if (req.size === Infinity) return this._truncate(req) // TODO: remove this when all callsites use truncate

    if (!fsext) return req.callback(null)

    fsext.trim(this.fd, req.offset, req.size).then(ontrim, ontrim)

    function ontrim (err) {
      self._pages.clear()
      req.callback(err)
    }
  }

  _truncate (req) {
    const self = this
    fs.ftruncate(this.fd, req.offset, ontruncate)

    function ontruncate (err) {
      self._pages.clear()
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
      if (self._pool !== null) self._pool._oninactive(self)
      self.fd = 0
      req.callback(null)
    }
  }

  _unlink (req) {
    const self = this

    const root = this.directory && path.resolve(path.join(this.directory, '.'))
    let dir = path.resolve(path.dirname(this.filename))

    fs.unlink(this.filename, onunlink)

    function onunlink (err) {
      // if the file isn't there, its already unlinked, ignore
      if (err && err.code === 'ENOENT') err = null

      if (err || !self._rmdir || !root || dir === root) return req.callback(err)
      fs.rmdir(dir, onrmdir)
    }

    function onrmdir (err) {
      dir = path.join(dir, '..')
      if (err || dir === root) return req.callback(null)
      fs.rmdir(dir, onrmdir)
    }
  }
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
