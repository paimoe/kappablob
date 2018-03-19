
var http = require('http');
var path = require('path');
var _ = require('underscore');

var express = require('express');

//
// ## SimpleServer `SimpleServer(obj)`
//
// Creates a new instance of SimpleServer with the following options:
//  * `port` - The HTTP port to listen on. If `process.env.PORT` is set, _it overrides this value_.
//
var router = express();
var server = http.createServer(router);

var channel = '#mlg';
var chats = {};

    var irc = require('irc');
    var client = new irc.Client('irc.twitch.tv', 'buddhasdietitian', {
        //userName: 'buddhasdietitian',
        port: 6667,
        debug: true,
        showErrors: true,
        secure: false,
        channels: [channel],
        nick: 'buddhasdietitian', 
        password: 'oauth:ae7w18ikiomu37c85487ix55odyvlb'
    });
    
    if (!Date.now){
    	Date.now = function() { return new Date().getTime(); };
    }
    
    // Add a message to mongodb when a message is sent
    client.addListener('message', function (from, to, message) {
    	//console.log(from + ' => ' + to + ': ' + message);
    
    	// store messages from specific channels
    	if (to === channel) {
    	    chats[message] = (chats[message] || 0) + 1;
    		/*console.log({ 
    			message: message, 
    			from: from, 
    			to: to,
    			timestamp: Date.now()
    		});*/
    	}
    });
    
    client.addListener('error', function(message) {
        console.log('error: ', message);
    });
    
    setInterval(showChats, 5000);
    
    function showChats() {
        //console.log(chats);
        var more_than_one = {};
        _.each(chats, function(ele, key, list) {
            if (ele > 1) {
                more_than_one[key] = ele;
            } 
        });
        console.log(more_than_one);
    }

server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("Chat server listening at", addr.address + ":" + addr.port);
});