/* global d3, _, angular */

function collide2(node) {
    
  var r = node.radius + 16,
      nx1 = node.x - r,
      nx2 = node.x + r,
      ny1 = node.y - r,
      ny2 = node.y + r;
  return function(quad, x1, y1, x2, y2) {
    if (quad.point && (quad.point !== node)) {
      var x = node.x - quad.point.x,
          y = node.y - quad.point.y,
          l = Math.sqrt(x * x + y * y),
          r = node.radius + quad.point.radius;
      if (l < r) {
        l = (l - r) / l * .5;
        node.x -= x *= l;
        node.y -= y *= l;
        quad.point.x += x;
        quad.point.y += y;
      }
    }
    return x1 > nx2
        || x2 < nx1
        || y1 > ny2
        || y2 < ny1;
  };
};

var app = angular.module('kappablob', ['ngRoute', 'angular-amplitude'])

.constant('EVENTS', {
    clear: 'kappa-clear',
    update: 'kappa-update',
    hover_piece: 'kappa-hover-item',
    hover_piece_out: 'kappa-hover-item-out',
    hover_list: 'kappa-hover-list',
    hover_list_out: 'kappa-hover-list-out',
    compare: 'kappa-compare',
    redo_graph: 'kappa-redo-graph',
})
.constant('AMPLITUDE_KEY', 'f9617322a9f6b068ddc00f550c379845')
.constant('WS_URL', 'http://lvh.me:8000/ws')
.constant('CLIENT_ID', 'rj8utwzfkwrueeaff8g9eciakig863b')
.constant('CONFIG', {
    'AMPLITUDE_KEY': 'f9617322a9f6b068ddc00f550c379845',
    'WS_UR': 'http://lvh.me:8000/ws',
    'CLIENT_ID': 'rj8utwzfkwrueeaff8g9eciakig863b'
})

.run(['$rootScope', function($rootScope) {
    $rootScope.kappa = {};
    $rootScope.io = undefined;
    $rootScope.sub = null;

    $rootScope.messages = [];
    $rootScope.msgCounts = {};
    $rootScope.totals = [];
    $rootScope.server_status = 'down';
}])

.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
    $routeProvider
      /*.when('/', {
          //templateUrl: 'static/maintable.html',
          controller: 'MainController',
      })*/
      .when('/about', {
        templateUrl: 'client/about.html',
        controller: 'SiteController',
      })
      .when('/:channel', {
          controller: 'TestController',
      })
      ;

    $locationProvider.html5Mode(true);
}])

.config(['$httpProvider', 'CONFIG', function($httpProvider, CONFIG) {
    $httpProvider.interceptors.push(function() {
      return {
       'request': function(config) {
           // same as above
           config.headers['Client-ID'] = CONFIG.CLIENT_ID;
           
           return config;
        },
    
        'response': function(response) {
           // same as above
           return response;
        },
        /*'responseError': function(resp) {
            if (resp.status == 401) {
                // Require login
                window.location.reload(true);
            }
            return resp;
        }*/
      };
    });
}])

.service('amp', ['$amplitude', '$rootScope', '$location', 'CONFIG', function ($amplitude, $rootScope, $location, CONFIG) {
  function init() {
    $amplitude.init(CONFIG.AMPLITUDE_KEY);
  }

  /*function identifyUser(userId, userProperties) {
    $amplitude.setUserId(userId);
    $amplitude.setUserProperties(userProperties);
  }*/

  function logEvent(eventName, params) {
    $amplitude.logEvent(eventName, params);
  }

  return {
    init: init,
    event: logEvent,
    //identifyUser: identifyUser
  };
}])
    
.factory('twitchFactory', ['$http', 'CONFIG', function($http, CONFIG) {
    return {
        channel: (channel) => $http.get('https://api.twitch.tv/kraken/streams/' + channel),
        topchannels: () => $http.get('https://api.twitch.tv/kraken/streams?client_id=' + CONFIG.CLIENT_ID),
    }
}])

.factory('socket', ['CONFIG', 'EVENTS', '$rootScope', '$routeParams', function(CONFIG, EVENTS, $rootScope, $routeParams) {
    var handle = function(message) {
        //console.log('handle()', message)
        if (message.act == 'count') {
            // add to our stack
            // todo: convert this to just use msg, and not have to use _.pairs cause its stupid
            let msg = message.data;
            $rootScope.msgCounts[msg.md5] = msg;
            $rootScope.messages[msg.md5] = msg;
            
            var totals = _.values($rootScope.msgCounts).sort((a, b) => a.count - b.count).reverse();
            $rootScope.totals = totals;
            
            //$scope.$apply();
            $rootScope.$broadcast(EVENTS.update);
        }
    };
    var server_down = function() {
        console.log('server down');
        $rootScope.server_status = 'down';
        $rootScope.$apply();
    };
    var server_up = function() {
        console.log('server up');
        $rootScope.server_status = 'up';
        $rootScope.$apply();
    };

    // Setup
    let io = new Faye.Client(CONFIG.WS_URL, {});
    io.on('transport:down', server_down);
    io.on('transport:up', server_up);

    $rootScope.io = io;
    return {
        emit: function(msg, channel) {
            console.log('emit', $rootScope.io);
            return 'zb';
        },
        join: function(channel) {
            $rootScope.sub = $rootScope.io.subscribe('/' + channel, handle);
        },
        part: function(channel) {
            // remove $rootScope.sub
            console.log('unsub');
        },
        on: function(evt, fn) {
            // on incoming event, run fn()
            fn();
        }
    }
}])

.factory('graphFactory', ['$rootScope', 'EVENTS', 'picknodesFilter', function($rootScope, EVENTS, picknodes) {
    return {
        'pie':  {
            create: function(element) {
                var width = 750,
                height = 500,
                radius = Math.min(width, height) / 2;
                
                var svg = d3.select(element[0])
                .append("svg")
                .attr("width", width)
                .attr("height", height)
                .append('g')
                .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
                
                var labelArc = d3.svg.arc()
                .outerRadius(radius - 40)
                .innerRadius(radius - 40);
                
                var arc = d3.svg.arc()
                .outerRadius(radius - 10)
                .innerRadius(0);  
                
                return {svg: svg, nodes: {}, x: {arc: arc, labelArc: labelArc}}; 
            },
            update: function(args) {
                // Redraw the svg, using scope.totals
                //console.log(EVENTS);
                
                args.svg.selectAll('*').remove(); // Clear out the pie bits
                
                // Get list of counts
                var nodes_flat = picknodes(args.nodes);
                
                var pie = d3.layout.pie()
                .sort(null)
                .value(function(d) { return d.value; });
                
                //console.log(_.pluck(args.nodes, 'value'))
                var g = args.svg.selectAll(".arc")
                .data(pie(nodes_flat))
                .enter()
                .append("g")
                .attr("class", "arc pieslice")
                .attr('id', function(d, i) { return 'pie-' + d.data.id; });
                
                g.append("path")
                .attr("d", args.x.arc)
                .style("fill", function(d, i) { return d.data.fill; });
                
                g.append("text")
                .attr("transform", function(d) { return "translate(" + args.x.labelArc.centroid(d) + ")"; })
                .attr("dy", ".35em")
                .text(function(d) { return d.data.name.substring(0, 10); });
                
                // Events
                g.on('mouseover', function(d, i) {
                    var md5 = d.data.id;
                    $rootScope.$broadcast(EVENTS.hover_piece, md5);
                });
                g.on('mouseout', function(d, i) {
                    $rootScope.$broadcast(EVENTS.hover_piece_out);
                });
            
            }
        },
        'bubble': {
            create: function(element) {
                var width = 750,
                    height = 500,
                    radius = Math.min(width, height) / 2,
                    diameter = radius * 2;
                
                var svg = d3.select(element[0])
                .append("svg")
                .attr("width", width)
                .attr("height", height)
                .append('g');
                //.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
                
                return {svg: svg, nodes: {}, x: {width:width, height:height}}; 
            },
            update: function(args) {
                args.svg.selectAll('*').remove(); // Clear out the bubbles
                
                // Get list of counts
                var piedata = [];
                _.each(args.nodes, function(ele, idx) {
                    piedata.push(ele);
                });
                
                // Bubble object
                var bubble = d3.layout.pack()
                .sort(null)
                .size([args.x.width, args.x.height])
                .padding(1.5)
                .value(function(d) { return d.value; });
                
                //console.log('pies', piedata, bubble.nodes({ name: 'idk', children: piedata }));
                var node_data = {name: '__rootNode', children: _.values(args.nodes)};
                //console.log(piedata);
                
                var node = args.svg.selectAll(".node")
                .data(bubble.nodes(node_data))
                .enter().append("g")
                .attr("class", function(d) { return "node" })
                .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
                
                node.append("title")
                .text(function(d) { 
                    if (d.name != '__rootNode') {
                        return d.name; 
                    }
                    return '';
                });
                
                node.append("circle")
                .attr("r", function(d) { return d.r; })
                .style("fill", function(d) { 
                    if (d.name != '__rootNode') {
                        return d.fill;
                    }
                    return '#ffffff';
                });
                
                node.append("text")
                .attr("dy", ".3em")
                .style("text-anchor", "middle")
                .text(function(d) { 
                    if (d.name != '__rootNode') {
                        return d.name.substring(0, 5); 
                    }
                    return '';
                });
                
                node.on('mouseover', function(d, i) {
                    var md5 = d.id;
                    $rootScope.$broadcast(EVENTS.hover_piece, md5);
                });
                node.on('mouseout', function(d, i) {
                    $rootScope.$broadcast(EVENTS.hover_piece_out);
                });
            }
        },
        'force': {
            create: function(element) {
                var nodes = {};
                var nodes_flat = [];
                
                var width = 750,
                    height = 500,
                    radius = d3.scale.sqrt().range([0, 12]),
                    diameter = radius * 2,
                    padding = 60;
                
                var svg = d3.select(element[0])
                .append("svg")
                .attr("width", width)
                .attr("height", height);
                //.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
                
                var sel = svg.selectAll('.node');
                
                // Set up graph stuff
                // Force
                var force = d3.layout.force()
                .size([width, height])
                .linkDistance(200) // idkkkkkk?
                .friction(0.9) // how slow they wander over
                .charge(0)
                .on('tick', function() {
                    var svg2 = svg.selectAll('g');
                    //svg2.each(collide(.1, picknodes(nodes)));
                    var p = picknodes(nodes);
                    var q = d3.geom.quadtree(p),
                    i = 0,
                    n = p.length;
                    
                    while (++i < n) {
                        q.visit(collide2(p[i]));
                    }
                
                    svg.selectAll('g circle')
                    .attr("cx", function (d) {return d.x;})
                    .attr("cy", function (d) {return d.y;});
                    svg.selectAll('g text')
                    .attr('x', function(d) { return d.x })
                    .attr('y', function(d) { return d.y });
                });
                
                function g_text(d) {
                    if (d.radius < 15) {
                    return '';
                    }
                    return d.name.substring(0, 20);
                };
                
                return {svg: svg, nodes: nodes, x: {force: force, g_text: g_text}};
            },
            update: function(args) {
                
                var nodes_flat = picknodes(args.nodes);
                var sel = args.svg.selectAll('g').data(nodes_flat, function(d) { return d.id; });
                
                // Update old elements
                var old = sel.attr('class', 'node');
                old.select('text').text(args.x.g_text);
                old.select('circle').attr('r', function(d) { return d.radius });
                // Set xy on old elements to what they already are
                
                // New elements
                
                var g = sel.enter().append('g')
                .attr("class", 'node')
                .attr('translate', 'transform(0,0)')
                .call(args.x.force.drag);
                
                // After calling enter, sel refers to all elements, so add in all the things we need
                g.append('circle')
                .attr('r', function(d) { return d.radius })
                .attr('fill', function(d) { return d.fill })
                .attr('id', function(d, i) { return 'bubble-' + d.id });
                g.append('text')
                .attr({
                "alignment-baseline": "middle",
                "text-anchor": "middle"
                })
                .text(args.x.g_text);
                
                g.on('mouseover', function(d, i) {
                    var md5 = d.id;
                    $rootScope.$broadcast(EVENTS.hover_piece, md5);
                });
                g.on('mouseout', function(d, i) {
                    $rootScope.$broadcast(EVENTS.hover_piece_out);
                });
                
                // Removed elements
                sel.exit().remove();
                args.x.force.nodes(nodes_flat).start();
            }
        }
    }
}])

.filter('picknodes', ['$rootScope', 'EVENTS', function($rootScope, EVENTS) {
    return function(nodes) {
        var limit = $rootScope.kappa.limit || 1;
        //console.log('limit', limit);
        var filtered = _.filter(nodes, function(e) { return e.value >= limit; });
        
        // Run compare
        if (Array.isArray($rootScope.kappa.compare) && $rootScope.kappa.compare.length > 1) {
            var filtered = _.filter(filtered, function(e) { return $rootScope.kappa.compare.indexOf(e.name) !== -1 });
        }
        
        // Run ignore
        
        // Find any fixed nodes [@todo: would be nice but it kills the physics somehow]
        /*for (node_md5 in filtered) {
            if (node_md5 in scope.$parent.d3.fixedNodes) {
                filtered[node_md5].fixed = true;
                //filtered[node_md5].charge = -400;????
            } else {
                filtered[node_md5].fixed = false;
            }
        }*/
        
        //console.log('total nodes', Object.keys(nodes).length, filtered.length);
        return _.values(filtered);//.filter(function(e) { console.log('filter', e);return true; }));
    }
}])

.controller('MainController', ['$rootScope', '$scope', '$filter','$routeParams', '$route', '$location', 'socket', 'EVENTS', 'twitchFactory', 'amp',
    function($rootScope, $scope, $filter, $routeParams, $route, $location, socket, EVENTS, twitch, amp) {
        
        amp.init();
        
        $scope.d3 = {fixedNodes: []};
        $scope.graphType =  'pie';
        $scope.messages = {}; // these 2 are kinda related maybe
        $scope.min = 2;
        $rootScope.htmltitle = 'kappablob';
        
        $scope.twitch = {'loaded': false};
        $scope.twitch.topchannels = [];
        $scope.channel_loaded = false;
        $scope.channel_not_live = true;
        $scope.channel = {};

        $scope.server = () => $rootScope.server_status == 'up';
        $scope.is_graph = () => _.contains(['pie', 'bubble', 'force'], $scope.graphType);
        
        $scope.$on('$routeChangeSuccess', function() {
            $rootScope.htmltitle = $routeParams.channel + ' - kappablob';
            amp.event('new channel', {'name': $routeParams.channel});
            $scope.new_channel($routeParams.channel);
        });
        
        $scope.reload_topchannels = function() {
            $scope.twitch.loaded = false;
            $scope.twitch.topchannels = [];
            twitch.topchannels().success(function(data) {
                $scope.twitch.topchannels = data.streams.slice(0,10);
                $scope.twitch.loaded = true;
            });
        };
        $scope.reload_topchannels();
        
        $scope.new_channel = function(channel) {
            console.log('Joining Channel', channel)  ;
            //socket.publish()
            socket.join(channel);

            // remove any old data for now, so one page = one channel basically
            $scope.clear();
            
            twitch.channel(channel).success(function(data) {
                $scope.channel_loaded = true;
                if (data.stream === null) {
                   $scope.channel_not_live = true;
                } else {
                   $scope.channel_not_live = false;
                   $scope.channel = data;
                }
            });
        };
        
        $scope.running = false;
        $scope.running_text = 'Start';
        $scope.channel = '';

        $scope.limit = 5;
        $scope.highlighted = ''; // ID of the slice we're hovering
        $scope.messages = [];
        $scope.msgCounts = {};
        $scope.totals = [];
        
        $scope.compare = '';
        $scope.ignore = [];

        $scope.$on(EVENTS.update, (evt) => {
            // get from rootScope
            //console.log('update event', evt);
            $scope.msgCounts = $rootScope.msgCounts;
            $scope.messages = $rootScope.messages;
            $scope.totals = $rootScope.totals;
            $scope.$apply();
        });
        
        $scope.$on(EVENTS.hover_piece, function(evt, md5) {
            $scope.highlighted = md5;
            $scope.$apply();
        });
        $scope.$on(EVENTS.hover_piece_out, function(evt) {
            $scope.highlighted = '';
            $scope.$apply();
        });
        $scope.$watch('min', function(newVal, oldVal) {
            $rootScope.kappa.limit = newVal;
            $rootScope.$broadcast(EVENTS.redo_graph);
        });
        $scope.$watch('compare', function(newVal, oldVal) {
            $rootScope.kappa.compare = newVal.split(' ');
            $rootScope.$broadcast(EVENTS.redo_graph);
        })
        
        $scope.results = () => $scope.totals;
        /*
        $scope.pause = function() {
            console.log('start/pause ', $routeParams.channel);
            if ($scope.running === true) {
                $scope.running = false;
                $scope.running_text = 'Start';
                socket.emit('/'+$routeParams.channel, {act: 'start'});
                //socket.emit('stop', $routeParams.channel);
            } else {
                $scope.running = true;
                $scope.running_text = 'Stop';
                socket.emit('/'+$routeParams.channel, {act: 'stop'});
                //socket.emit('start', $routeParams.channel);
            }
        };
        */
        $scope.clear = () => {
            $scope.messages = [];
            $scope.msgCounts = {};
            $scope.totals = [];
            $rootScope.NODES = {};
            $rootScope.$broadcast(EVENTS.clear);
        };
        
        $scope.do_compare = function() {
            // Restrict output to only the shown keywords
            var kw = $scope.compare.split(' ');
            //console.log(kw);
            $rootScope.kappa.compare = kw;
            //$rootScope.$broadcast(EVENTS.compare, kw);
        };
        
        $scope.do_ignore = function() {
            
        };
        
        $scope.highlightWhich = function(row) {
            if ($scope.highlighted === '') {
                return '';
            }
            if (row.md5 == $scope.highlighted)   {
                return 'pielight success';
            }
            return 'pielowlight';
        };
        
        $scope.highlight_bubble = function(md5) {
            var bubble = d3.select('#bubble-' + md5);
            bubble.classed('glow', true);
            $scope.d3.fixedNodes = _.unique($scope.d3.fixedNodes, [md5]);
        };
        
        $scope.unhighlight_bubble = function(md5) {
            var bubble = d3.select('#bubble-' + md5);
            bubble.classed('glow', false);
            $scope.d3.fixedNodes = _.without($scope.d3.fixedNodes, md5);
        };
        
        $scope.list_of_messages = function() {
            var filtered = _.filter($scope.totals, function(e) { return e.count >= $scope.min });
            if (filtered.length) {
                $scope.hidden_singles = $scope.totals.length - filtered.length;
            } else {
                $scope.hidden_singles = 0;
            }
            return filtered;
        };
        $scope.total_messages = () => $scope.totals.length;
    }
])

.directive('d3Graph', ['$rootScope', 'EVENTS', 'graphFactory', function ($rootScope, EVENTS, graphFactory) {
  // define constants and helpers used for the directive
  // ...
  return {
    restrict: 'E', // the directive can be invoked only by using <my-directive> tag in the template
    scope: { // attributes bound to the scope of the directive
      data: '=',
      type: '=',
    },
    transclude: true,
    link: function (scope, element, attrs) {
      
        var nodes = {};
                    
        var color = d3.scale.ordinal().range(["#69D2E7", "#A7DBD8", "#E0E4CC", "#F38630", "#FA6900"]);
        var color = d3.scale.ordinal().range(['#73C8A9','#DEE1B6','#E1B866','#BD5532','#373B44']);
        
        scope.$watch('type', function(graphType, oldVal) {
            console.log('Switch graph type', graphType);
            if (graphType == 'list') {
                return;
            }
            
            // Remove any old graphs
            d3.select(element[0]).selectAll('*').remove();
            
            var factory = graphFactory[graphType];
            var graph = factory.create(element);
            
            // ugly, make better
            function add_node(ele) {
                graph.nodes[ele.md5] = { 
                    id: ele.md5,
                    name: ele.norm, 
                    value: Math.min(100, ele.count),
                    radius: Math.max(10, Math.min(ele.count, 100)),
                    fill: color(_.sample(_.range(0, 4)))
                };
                $rootScope.NODES = graph.nodes;
            };
            
            scope.$on(EVENTS.clear, function(event, args) {
                factory.update({svg: graph.svg, nodes: {}, scope: scope, x: graph.x});
                graph.nodes = {};
            });
            
            /*scope.$on(EVENTS.compare, function(event, compare) {
               console.log('do compare', compare); 
               $rootScope.kappa.compare = compare;
            });*/
            
            scope.$on(EVENTS.redo_graph, function(event) {
                factory.update({svg: graph.svg, nodes: graph.nodes, scope: scope, x: graph.x});
            });
        
            scope.$watch('data', function (newVal, oldVal, sc) {
                //console.log(newVal)
                if (newVal) {
                
                    // Update nodes
                    var newData = newVal.slice(0, 20); // Too many elements = bad fps
                    
                    // Get list of counts
                    _.each(newData, function(ele, idx, list) {
                        
                        // Don't add again if count hasn't changed, otherwise it seems to reset the entire nodelist
                        // and restarts the animation
                        // Oh maybe cause i didn't copy the px from nodes[ele.md5], i reset the whole object
                        if (ele.md5 in graph.nodes) {
                            var _current = graph.nodes[ele.md5];
                            if (_current.value == ele.count) {
                                return;
                            } else {
                                // Update node?
                                graph.nodes[ele.md5].value = ele.count;
                                // Move to force graph, cause eg pie doesn't need it
                                graph.nodes[ele.md5].radius = Math.max(10, Math.min(ele.count, 100));
                            }
                        } else {
                            add_node(ele);
                        }
                    });
                }
                    
                // Redraw
                factory.update({svg: graph.svg, nodes: graph.nodes, scope: scope, x: graph.x});
            }); // end scope.$watch
        }); // end $watch on the graphType
    }
  };
}])


;