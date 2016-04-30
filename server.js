//
var config = require('./config.js');

var http = require('http');
var path = require('path');
var _ = require('underscore');

var async = require('async');
var socketio = require('socket.io');
var express = require('express');
var md5 = require('md5');
var Promise = require('bluebird');
var noderedis = require('redis');
  Promise.promisifyAll(noderedis.RedisClient.prototype);
  Promise.promisifyAll(noderedis.Multi.prototype);
  var redis = noderedis.createClient();
  
  redis.on('error', function(err) {
    console.log('Redis Error: ', err);
  });

var sprintf = require("sprintf-js").sprintf,
    vsprintf = require("sprintf-js").vsprintf

//
// ## SimpleServer `SimpleServer(obj)`
//
// Creates a new instance of SimpleServer with the following options:
//  * `port` - The HTTP port to listen on. If `process.env.PORT` is set, _it overrides this value_.
//
var router = express();
var server = http.createServer(router);
var io = socketio.listen(server);

// Routing
// First, send a static file if it exists, then just send index (for angular routing)
router.use(express.static(path.resolve(__dirname, 'client')));
router.get('/[^\.]+$', function(req, res){
    res.set('Content-Type', 'text/html')
        .sendfile(__dirname + '/client/index.html');
});

var messages = [];
var sockets = {};
var running = []; // Active sockets that haven't paused yet
var highestNormalized = {};
var msgblacklist = ['***'];
var channels_subbed = {}; // Map of ['#channelname': [socket1, socket2]]

/* TWITCH */
var channels = [];
var chats = {};

var irc = require('irc');
var client = new irc.Client('irc.twitch.tv', config.TWITCH_USER, {
    port: 6667,
    debug: true,
    showErrors: true,
    secure: false,
    channels: channels,
    nick: config.TWITCH_USER, 
    password: config.TWITCH_AUTH
});

if (!Date.now){
    Date.now = function() { return new Date().getTime(); };
}

client.addListener('error', function(message) {
    console.log('error: ', message);
});

client.addListener('message', function (from, to, message) {
    // store messages from specific channels
    //console.log(to);
    var chan = to.substring(1);
    if (chan in channels_subbed) {
      if (!_.contains(msgblacklist, message)) {
        // If number has changed, then resend the new amount
        var st = store_chat(chan, message);
        store_chat2(chan, message);
        chat_count(chan, st.m).then(function(resp) {
          //console.log('zr call', resp);
          resp = _.map(resp, function(e) { return e.substring(e.indexOf(':') + 1); });
          var mx = _.max(_.groupBy(resp), 'length');
          //console.log('mxxxxx', resp, mx);
          
          // With this, a count of 0 should still be sent, and then delete the info on the client side
          if (resp.length > 0) {
            broadcast('newcount', {'norm': st.n, 'count': resp.length, 'md5': st.m, 'high': mx[0]}, chan);
          }
        });
        
        // Delete older messages
      }
    }
});
    
// Accumulation
var messages = [];
var msgcounts = {};

io.on('connection', function (socket) {
  
    // By default, don't actually send out the shit until they click go
    socket.on('start', function() {
        running.push(socket.id);
        console.log(['Added', socket.id, running]);
    });
    
    socket.on('stop', function() {
        running = _.without(running, socket.id);
        console.log(['Removed', socket.id, running]);
    });
    
    // 
    messages.forEach(function (data) {
      socket.emit('message', data);
    });

    sockets[socket.id] = socket;

    socket.on('disconnect', function () {
      running = _.without(running, socket.id);
      delete sockets[socket.id];//sockets.splice(sockets.indexOf(socket), 1);
      //updateRoster();
    });
    
    socket.on('clearchannels', function (){
      // Check if this socket.id has joined a previous channel
      _.each(channels_subbed, function(ele, idx, list) {
        _.each(ele, function(e, i, l) {
          if (i == socket.id) {
            console.log('Removing socket ', socket.id, ' from channels_subbed[', idx, '][', i, ']');
            delete channels_subbed[idx][i];
          }
        });
      });
    });
    
    // New tab = new socket id
    socket.on('joinchannel', function(data) {
      console.log('JOIN CHANNEL', data, socket.id);
      if (_.isArray(channels_subbed[data])) {
        channels_subbed[data][socket.id] = socket;
      } else {
        channels_subbed[data] = {};
        channels_subbed[data][socket.id] = socket;
        // Joined a new channel
        client.join('#' + data);
      }
    });

  });

function updateRoster() {
  async.map(
    sockets,
    function (socket, callback) {
      socket.get('name', callback);
    },
    function (err, names) {
      broadcast('roster', names);
    }
  );
}

function broadcast(event, data, channel) {
    _.each(channels_subbed[channel], function(ele, idx, list) {
        if (_.indexOf(running, idx) != -1) {
          ele.emit(event, data);
        };
    });
}

function normalize(text) {
  text = text.toLowerCase().replace(/_/g, '').replace(/ /g, '');
  text = text.replace('"', '');
  text = text.replace("'", '');
  
  // Remove @mentions
  if (text[0] == '@') {
    text = text.substring(text.indexOf(' ')).trim();
  }
  
  // If it's just the same thing repeated, reduce to just one instance
  var rep = check_repetitive(text);
  if (rep[0] === true) {
    text = rep[1];
  }
  
  return text;
}

function pickHighest(term, normalized) {
  // Keep up the most common one
  var group = highestNormalized[normalized];
  // Will contain eg 'vac' => 'VAC' V A C V.A.C
}

function part_empty_channels() {}

function store_chat(channel, message) {
  // Add to tally, and return count of message
  // Store in redis
  
  //var rediskey = sprintf();
  var norm = normalize(message);
  if (!(channel in chats)) {
    chats[channel] = {};
  }
  chats[channel][norm] = (chats[channel][norm] || 0) + 1;
  return {
    c: chats[channel][norm],
    n: norm,
    m: md5(norm)
  };
}

function store_chat2(channel, message) {
  // Requirements:
  // Counts should exire after 5 minutes, after each message is sent
  var norm = normalize(message);
  var d = {};
  d.emote = is_emote(norm);
  d.md5 = md5(norm);
  d.norm = norm;
  
  var zkey = 'chats:' + channel + ':' + d.md5;
  var score = Math.round(Date.now() / 1000);
  
  // key score member
  var combined = score + ':' + message; // to make it unique
  redis.zadd(zkey, score, combined);
  
  return d;
}

function chat_count(channel, md5) {
  var zkey = 'chats:' + channel + ':' + md5;
  
  // Get messages within 5 minutes ago
  return redis.zrangebyscoreAsync(zkey, five_mins_ago(), Infinity);
  // Delete older ones here?
}

function remove_old_chats(channel, md5) {
  
}

function check_repetitive(message) {
  // Check if a message is just the same thing over and over
  // eg kappakappakappa
  var fchar = message[0];
  
  try {
    var r = new RegExp('(?=' + fchar + ')', 'g');
    var sp = message.split(r);
    return (!_.without(sp, sp[0]).length, sp[0]);
  } catch(e) {
    return false;
  }
}

function is_emote(message) {
  return false;
};

function five_mins_ago() {
  return Math.round(Date.now() / 1000 - 300);
}

server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("Chat server listening at", addr.address + ":" + addr.port);
});
