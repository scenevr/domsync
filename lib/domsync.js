var PacketParser = require('./packet-parser');

/**
 * Establishes a synchronising channel between a directly-accessed dom object, and a remote dom,
 * over a pair of streams.
 */
var DomSync = function (dom) {
  this.dom = dom;
  this.sockets = [];

  var self = this;
  this.socketMessageCallback = function (chunk) {
    self.parseInput(chunk);
  };
};

/**
 * Connect a new socket to this synchroniser and being listening for changes from it
 */
DomSync.prototype.addConnection = function (socket) {
  this.sockets.push(socket);
  socket.on('message', this.socketMessageCallback);
};

/**
 * Disconnect from a previously connected socket
 * @return boolean true if the socket was previously connected, false if it couldn't be found
 */
DomSync.prototype.removeConnection = function (socket) {
  // Find the socket
  for (var i in this.sockets) {
    if (socket === this.sockets[i]) {
      socket.removeListener('message', this.socketMessageCallback);
      delete this.sockets[i];
      return true;
    }
  }

  return false;
};

/**
 * Send any changes from the dom to the socket
 */
DomSync.prototype.sendChanges = function () {
  if (this.sockets.length === 0) return;

  var packets = [], uuid;

  for (uuid in this.dom.dirtyNodes) {
    var element = this.dom.dirtyNodes[uuid];

    if (element.reflect) {
      packets.push(element.outerHTML);
    }
  };

  for (uuid in this.dom.deadNodes) {
    packets.push('<dead uuid="' + uuid + '" />');
  }

  // Clear the dirtyNodes
  this.dom.dirtyNodes = {};
  this.dom.deadNodes = {};

  if (packets.length > 0) {
    var xml = '<packet>' + packets.join('\n') + '</packet>';
    this.sockets.forEach(function (socket) {
      socket.send(xml);
    });
  }
};

DomSync.prototype.parseInput = function (xml) {
  var self = this;

  PacketParser(xml).childNodes.forEach(function (element) {
    self.processElement(element);
  });
};

DomSync.prototype.processElement = function (el) {
  if (el.tagName === 'event') {
    throw new Error('Events not supported yet');

  // Update scene dom
  } else {
    var uuid = el.uuid;
    if (!uuid) throw new Error('Element has no UUID in:\n' + el[0].outerHTML);
    var obj = this.dom.getElementByUUID(uuid);
    var oldObj = null;

    // Remove a dead node or a node that has changed its tagName
    if (el.tagName === 'dead' || obj && obj.tagName.toLowerCase() !== el.tagName.toLowerCase()) {
      oldObj = obj;
      if (obj) obj.parentNode.removeChild(obj);
      obj = null;
    }

    if (el.tagName !== 'dead') {
      // Create node if it doesn't exist
      if (!obj) {
        obj = this.dom.createElement(el.tagName);
        obj.uuid = el.uuid;
        this.dom.scene.appendChild(obj);
      }

      // Copy attributes from the old object, in the case of a tag rename
      if (oldObj) {
        oldObj.attributes.forEach(function (attr) {
          obj[attr.name] = attr.value;
        });
      }

      // Set its attributes
      el.attributes.forEach(function (attr) {
        obj[attr.name] = attr.value;
      });
    }
  }
};

module.exports = DomSync;
