var fs = require('fs');
var thunky = require('thunky');
var EventEmitter = require('events').EventEmitter;

var POOL_SIZE = 512*1024;

var noop = function() {};
var pool = null;
var used = 0;

var alloc = function(size) {
	if (size >= POOL_SIZE) return new Buffer(size);

	if (!pool || used+size > pool.length) {
		used = 0;
		pool = new Buffer(POOL_SIZE);
	}

	return pool.slice(used, used += size);
};

var RandomAccessFile = function(filename) {
	if (!(this instanceof RandomAccessFile)) return new RandomAccessFile(filename);
	EventEmitter.call(this);

	var self = this;
	this.filename = filename;
	this.open = thunky(function(callback) {
		fs.exists(filename, function(exists) {
			fs.open(filename, exists ? 'r+' : 'w+', function(err, fd) {
				if (err) {
					self.emit('error', err);
				} else {
					self.emit('open');
				}
				callback(err, fd);
			});
		});
	});
};

RandomAccessFile.prototype.__proto__ = EventEmitter.prototype;

RandomAccessFile.prototype.close = function(callback) {
	callback = callback || noop;
	var self = this;
	this.open(function(err, fd) {
		if (err) return callback(err);
		fs.close(fd, function(err) {
			if (err) return callback(err);
			self.emit('close');
			callback();
		});
	});
};

RandomAccessFile.prototype.read = function(offset, length, callback) {
	this.open(function(err, fd) {
		if (err) return callback(err);
		fs.read(fd, alloc(length), 0, length, offset, function(err, read, buffer) {
			if (read !== buffer.length) return callback(new Error('range not satisfied'));
			callback(err, buffer);
		});
	});
};

RandomAccessFile.prototype.write = function(offset, buffer, callback) {
	callback = callback || noop;
	if (typeof buffer === 'string') buffer = new Buffer(buffer);
	this.open(function(err, fd) {
		if (err) return callback(err);
		fs.write(fd, buffer, 0, buffer.length, offset, callback);
	});
};

RandomAccessFile.prototype.unlink = function(callback) {
	callback = callback || noop;
	var self = this;
	this.close(function(err) {
		if (err) return callback(err);
		fs.unlink(self.filename, callback);
	});
};

module.exports = RandomAccessFile;