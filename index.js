var thunky = require('thunky')
var fs = require('fs')
var path = require('path')
var inherits = require('inherits')
var mkdirp = require('mkdirp')
var c = require('constants')
var AbstractRandomAccess = require('abstract-random-access')

module.exports = RandomAccessFile

function RandomAccessFile (filename, opts) {
  if (!(this instanceof RandomAccessFile)) return new RandomAccessFile(filename, opts)
  if (!opts) opts = {}

  AbstractRandomAccess.call(this)

  var self = this

  this.filename = filename
  this.fd = 0
  this.readable = opts.readable !== false
  this.writable = opts.writable !== false
  this.mtime = opts.mtime
  this.atime = opts.atime
  this.length = opts.length || 0
  this._open = thunky(open)

  function open (cb) {
    var dir = path.dirname(filename)

    if (dir) mkdirp(dir, ondir)
    else ondir()

    function ondir () {
      fs.open(filename, mode(self), onopen)
    }

    function onopen (err, fd) {
      if (err && err.code === 'EACCES' && self.writable) {
        self.writable = false
        fs.open(filename, mode(self), onopen)
        return
      }

      if (err) return cb(err)

      self.fd = fd

      if (self.length || opts.truncate) return fs.ftruncate(fd, opts.truncate ? 0 : self.length, cb)

      fs.fstat(fd, function (err, st) {
        if (err) return cb(err)
        self.length = st.size
        cb()
      })
    }
  }
}

inherits(RandomAccessFile, AbstractRandomAccess)

RandomAccessFile.prototype._read = function (offset, length, cb) {
  if (!this.fd) return cb(new Error('File is closed'))
  if (!this.readable) return cb(new Error('File is not readable'))

  var self = this
  var buf = Buffer(length)

  if (!length) return cb(null, buf)
  fs.read(this.fd, buf, 0, length, offset, onread)

  function onread (err, bytes) {
    if (err) return cb(err)
    if (!bytes) return cb(new Error('Could not satisfy length'))

    offset += bytes
    length -= bytes

    if (!length) return cb(null, buf)
    if (!self.fd) return cb(new Error('File is closed'))
    fs.read(self.fd, buf, buf.length - length, length, offset, onread)
  }
}

RandomAccessFile.prototype._write = function (offset, buf, cb) {
  if (!this.fd) return cb(new Error('File is closed'))
  if (!this.writable) return cb(new Error('File is not writable'))

  var self = this
  var length = buf.length

  fs.write(this.fd, buf, 0, length, offset, onwrite)

  function onwrite (err, bytes) {
    if (err) return cb(err)

    offset += bytes
    length -= bytes
    if (offset > self.length) self.length = offset

    if (!length) return cb(null)
    if (!self.fd) return cb(new Error('File is closed'))
    fs.write(self.fd, buf, buf.length - offset, length, offset, onwrite)
  }
}

RandomAccessFile.prototype._close = function (cb) {
  if (!this.fd) return cb()

  var self = this

  fs.close(self.fd, function (err) {
    if (err) return cb(err)
    self.fd = 0
    cb()
  })
}

RandomAccessFile.prototype._end = function (opts, cb) {
  var atime = opts.atime || this.atime
  var mtime = opts.mtime || this.mtime
  var self = this

  if (!atime && !mtime) {
    cb()
  } else if (atime && mtime) {
    end(atime, mtime)
  } else {
    fs.fstat(this.fd, function (err, stat) {
      if (err) return cb(err)
      end(atime || stat.atime, mtime || stat.mtime)
    })
  }

  function end (atime, mtime) {
    fs.futimes(self.fd, atime, mtime, cb)
  }
}

RandomAccessFile.prototype._unlink = function (cb) {
  fs.unlink(this.filename, cb)
}

function mode (self) {
  if (self.readable && self.writable) return c.O_RDWR | c.O_CREAT
  if (self.writable) return c.O_WRONLY | c.O_CREAT
  return c.O_RDONLY
}
