var test = require('tape');
var DomSync = require('../');
var Dom = require('scene-dom');

/**
 * Simple mock socket that lets us feed data in & out
 */
var MockSocket = function () {
  var _testData = [];
  var _handlers = {
    'open': [],
    'close': [],
    'message': []
  };

  // These functions will be called by the domsync implementation
  this.send = function (data) {
    _testData.push(data);
  };

  this.on = function (type, data) {
    console.log(type);
    _handlers[type].push(data);
  };

  // These functions are used by our test
  this.sendTestData = function (data) {
    _handlers['message'].forEach(function (handler) {
      handler(data);
    });
  };

  this.popTestData = function () {
    var result = _testData;
    _testData = [];
    return result;
  };
};

test('domsync', function (t) {
  test('should accept updates from the input stream', function (t) {
    var socket = new MockSocket();

    var doc = Dom.createDocument();
    var sync = new DomSync(doc, socket);
    sync.start();

    socket.sendTestData('<packet><box uuid="1" id="el1" position="1 2 3" /></packet>');

    t.equals('1 2 3', doc.getElementById('el1').position.toString());
    t.end();
  });

  test('multiple updates should add to the world', function (t) {
    var socket = new MockSocket();

    var doc = Dom.createDocument();
    (new DomSync(doc, socket)).start();

    socket.sendTestData('<packet><box uuid="1" id="el1" position="1 2 3" /></packet>');
    socket.sendTestData('<packet><box uuid="2" id="el2" position="4 5 6" />'
      + '<box uuid="3" id="el3" position="7 8 9" /></packet>');

    t.equals('1 2 3', doc.getElementById('el1').position.toString(), 'first element added');
    t.equals('4 5 6', doc.getElementById('el2').position.toString(), 'second element added');
    t.equals('7 8 9', doc.getElementById('el3').position.toString(), 'multi-part packet adds both item');
    t.end();
  });

  test('updates with the same uuid should update nodes', function (t) {
    var socket = new MockSocket();

    var doc = Dom.createDocument();
    (new DomSync(doc, socket)).start();

    socket.sendTestData('<packet><box uuid="1a2b" id="el1" position="1 2 3" rotation="0 1 0" /></packet>');
    socket.sendTestData('<packet><box uuid="1a2b" id="el2" position="4 5 6" material="test" /></packet>');

    t.equals(null, doc.getElementById('el1'), 'id indexing updates correctly');
    t.equals('4 5 6', doc.getElementById('el2').position.toString(), 'attributes updated correctly');
    t.equals('0 1 0', doc.getElementById('el2').rotation.toString(), 'skipped attributes are preserved');
    t.equals('test', doc.getElementById('el2').material.toString(), 'new attributes are added');
    t.end();
  });

  test('updates can change tag name', function (t) {
    var socket = new MockSocket();

    var doc = Dom.createDocument();
    (new DomSync(doc, socket)).start();

    socket.sendTestData('<packet><box uuid="1a2b" position="1 2 3" rotation="0 1 0" /></packet>');
    socket.sendTestData('<packet><sphere uuid="1a2b" rotation="0 0 0" /></packet>');

    t.equals(doc.scene.toString(), '<scene><sphere uuid="1a2b" position="1 2 3" rotation="0 0 0"></sphere></scene>');
    t.end();
  });

  test('dom changes will emit packets', function (t) {
    var socket = new MockSocket();

    var doc = Dom.createDocument();
    var sync = new DomSync(doc, socket);
    sync.start();

    var b = doc.createElement('box');
    b.position = '1 2 3';
    doc.scene.appendChild(b);

    // Trigger the send process, normally runs on a setInterval() timer
    sync.sendChanges();

    b.position = '4 5 6';

    // Need a 0-timeout to allow Object.observe() to run
    setTimeout(function () {
      sync.sendChanges();

      doc.scene.removeChild(b);
      sync.sendChanges();

      var packets = socket.popTestData();
      t.equals(packets.length, 3);
      t.equals(packets[0], '<packet><box uuid="' + b.uuid + '" position="1 2 3"></box></packet>', 'New nodes send element tags');
      t.equals(packets[1], '<packet><box uuid="' + b.uuid + '" position="4 5 6"></box></packet>', 'Updated nodes send element tags');
      t.equals(packets[2], '<packet><dead uuid="' + b.uuid + '" /></packet>', 'Removed nodes send <dead> tags');
      t.end();
    }, 0);
  });

  t.end();
});
