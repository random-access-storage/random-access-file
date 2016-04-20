var thunky = require('thunky')
var fs = require('fs')
var path = require('path')
var inherits = require('inherits')
var mkdirp = require('mkdirp')
var events = require('events')
var c = require('constants')

module.exports = RandomAccessFile

function RandomAccessFile (filename, opts) {
  if (!(this instanceof RandomAccessFile)) return new RandomAccessFile(filename, opts)
  if (!opts) opts = {}

  events.EventEmitter.call(this)

  var self = this

  this.filename = filename
  this.fd = 0
  this.readable = opts.readable !== false
  this.writable = opts.writable !== false
  this.length = opts.length || 0
  this.opened = false
  this.open = thunky(open)
  this.open()

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

      self.opened = true
      self.fd = fd
      self.emit('open')

      if (self.length || opts.truncate) return fs.ftruncate(fd, opts.truncate ? 0 : self.length, cb)

      fs.fstat(fd, function (err, st) {
        if (err) return cb(err)
        self.length = st.size
        cb()
      })
    }
  }
}

inherits(RandomAccessFile, events.EventEmitter)

RandomAccessFile.prototype.read = function (offset, length, cb) {
  if (!this.opened) return openAndRead(this, offset, length, cb)
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
    fs.read(self.fd, buf, buf.length - offset, length, offset, onread)
  }
}

RandomAccessFile.prototype.write = function (offset, buf, cb) {
  if (!cb) cb = noop
  if (!this.opened) return openAndWrite(this, offset, buf, cb)
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

RandomAccessFile.prototype.close = function (cb) {
  if (!cb) cb = noop
  if (this.opened && !this.fd) return cb()

  var self = this
  this.open(onopen)

  function onopen (err) {
    if (err) return cb()
    fs.close(self.fd, onclose)
  }

  function onclose (err) {
    if (err) return cb(err)
    self.fd = 0
    self.emit('close')
    cb()
  }
}

RandomAccessFile.prototype.unlink = function (cb) {
  if (!cb) cb = noop
  fs.unlink(this.filename, cb)
}

function noop () {}

function openAndRead (self, offset, length, cb) {
  self.open(function (err) {
    if (err) return cb(err)
    self.read(offset, length, cb)
  })
}

function openAndWrite (self, offset, buf, cb) {
  self.open(function (err) {
    if (err) return cb(err)
    self.write(offset, buf, cb)
  })
}

function mode (self) {
  if (self.readable && self.writable) return c.O_RDWR | c.O_CREAT
  if (self.writable) return c.O_WRONLY | c.O_CREAT
  return c.O_RDONLY
}
