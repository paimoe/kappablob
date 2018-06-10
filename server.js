"use strict";
var config = require('./config.js');

if (config.TWITCH_AUTH.length == 0) {
  console.error('Set twitch auth in config.js');
  process.exit(1);
}

var http = require('http');
var path = require('path');
var _ = require('underscore');
var faye = require('faye');

var async = require('async');
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

var cors = require('cors');
var sprintf = require("sprintf-js").sprintf,
    vsprintf = require("sprintf-js").vsprintf

var app = express();
var server = http.createServer(app);
var bayeux = new faye.NodeAdapter({mount: '/ws', timeout: 45});

bayeux.attach(server);

//server.listen(3000);

// Routing
// First, send a static file if it exists, then just send index (for angular routing)
app.use(express.static(path.resolve(__dirname, 'client')));
//app.use(cors({origin:config.CORS_ORIGIN, credentials:true}))
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', config.CORS_ORIGIN);
  res.header('Access-Control-Allow-Credentials', true);
  next();
});
server.listen(config.PORT, () => {
  console.log('Server running on ' + config.PORT);
});


var messages = [];
var sockets = {};
var running = []; // Active sockets that haven't paused yet
var highestNormalized = {};
var msgblacklist = ['***'];
var channels_subbed = [];
var channels = [];
var chats = {};

/* TWITCH */
var tmi = require('tmi.js');
var tmiOptions = {
  //options: { debug: true },
  options: { debug: false },
  connection: { reconnect: true, },
  identity: {
    username: config.TWITCH_USER,
    password: config.TWITCH_AUTH,
  },
  channels: []
}
var client = new tmi.client(tmiOptions);
client.connect();
//console.log(client);

// Message received from irc
client.on('chat', (channel, userstate, msg, from_us) => {
  //console.log('chat received', channel, msg);
  var chan = channel.substring(1);
    if (!_.contains(msgblacklist, msg)) {
      // If number has changed, then resend the new amount
      var st = store_chat(chan, msg);// keeps chat and counts in memory

      store_chat2(chan, msg); // puts it in the db
      chat_count(chan, st.m).then(function(resp) { 
        // get chats on this md5, for this channel. so the number
        // is only updated when a new message comes through, which can lead to stale data
        resp = _.map(resp, function(e) { return e.substring(e.indexOf(':') + 1); });
        var mx = _.max(_.groupBy(resp), 'length');

        var ret = {'norm': st.n, 'count': resp.length, 'md5': st.m, 'high': mx[0]};
        //console.log('ret', ret);
        // TODO: With this, a count of 0 should still be sent, and then delete the info on the client side
        bayeux.getClient().publish('/' + chan, {
          act: 'count',
          data: ret,
        });
      
        // Delete older messages. Will only fire when a new message of the same thing comes in
        // which is also only when it will update
        let k = 'chats:' + chan + ':' + st.m;
        redis.zremrangebyscoreAsync(k, -Infinity, five_mins_ago()).then((resp) => {
          let del_count = resp;
          let k = mx[0];
          //console.log(`Deleted ${del_count} messages from key ${k}`);
          // Notify client
        });

        // remove old ones from redis
        remove_old();
      });
    }
})

bayeux.on('handshake', function (clientId) {
  console.log('client connected', clientId);
});
// message from the client
bayeux.on('publish', (clientId, channel, data) => {
  //console.log('message from ', channel, clientId, data);
  
});
bayeux.on('subscribe', (clientId, channel) => {
  console.log(clientId + ' joined ' + channel);
  if (!_.contains(channels_subbed, channel)) {
    channels_subbed.push(channel);
    // join channel in client
    client.join('#' + channel.slice(1));
  } else {
    // already subbed, so will already be in the channel, so do nuthin?
  }
});
bayeux.on('unsubscribe', (clientId, channel) => {
  console.log(clientId + ' left channel ' + channel)
})

if (!Date.now){
    Date.now = function() { return new Date().getTime(); };
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
    c: chats[channel][norm], // count
    n: norm, // normalized
    m: md5(norm) // hashed
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
  // also include 'omgKirby omgKirby omgK' ie if they were about to repeat it
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

var REMOVE_CURSOR = 0; // start at 0
function remove_old() {
  // Remove old chats from their sorted sets (for now, >1 hour)
  // Have to loop through all available keys, check their scores, and remove
  redis.scanAsync(REMOVE_CURSOR, 'MATCH', 'chats:*', 'COUNT', '500').then((resp) => {
    REMOVE_CURSOR = resp[0];
    //console.log('Updated REMOVE_CURSOR to ' + REMOVE_CURSOR);
    _.each(resp[1], (ele) => {
      redis.zremrangebyscoreAsync(ele, -Infinity, five_mins_ago()).then((deleted) => {
        if (deleted > 0) {
          //console.log(`deleted ${deleted} from ${ele}`);
        }
      });
    });
    //console.log('ran command', resp);
  })
}

app.get('*', function(req, res){
  console.log('serving index')
    res.set('Content-Type', 'text/html')
        .sendfile(__dirname + '/client/_index.html');
});