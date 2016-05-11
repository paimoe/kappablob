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

          
        function picknodes(nodes) {
            var filtered = _.filter(nodes, function(e) { return e.value > 1; });
            
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
            
        };

var app = angular.module('kappablob', ['ngRoute'])

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
    
.factory('twitchFactory', ['$http', function($http) {
    return {
        'channel': function(channel) {
            return $http.get('https://api.twitch.tv/kraken/streams/' + channel);
        },
        'topchannels': function() {
            return $http.get('https://api.twitch.tv/kraken/streams');
        }
    }
}])

.factory('graphFactory', [function() {
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
                //console.log(args.nodes);
                
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
                .text(function(d) { return d.data.name; });
                
                // Events
                g.on('mouseover', function(d, i) {
                    var t = d3.select(this)[0][0];
                    var id = t.id;
                    var data = t.__data__;
                    var md5 = d.data.md5;
                    args.scope.$parent.highlighted = md5;
                    args.scope.$parent.$apply();
                });
                g.on('mouseout', function(d, i) {
                    args.scope.$parent.highlighted = ''; 
                    args.scope.$parent.$apply();
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
                
                // Events
                /*g.on('mouseover', function(d, i) {
                var t = d3.select(this)[0][0];
                var id = t.id;
                var data = t.__data__;
                var md5 = piedata[i][0];
                scope.$parent.highlighted = md5;
                scope.$parent.$apply();
                });
                g.on('mouseout', function(d, i) {
                scope.$parent.highlighted = ''; 
                scope.$parent.$apply();
                });*/
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
                    args.scope.$parent.highlighted = d.id;
                    args.scope.$parent.$apply();
                    //d3.select(this).classed('fixed', d.fixed = true);
                })
                .on('mouseout', function(d, i) {
                    args.scope.$parent.highlighted = ''; 
                    args.scope.$parent.$apply();
                    //d3.select(this).classed('fixed', d.fixed = false);
                });
                
                // Removed elements
                sel.exit().remove();
                args.x.force.nodes(nodes_flat).start();
            }
        }
    }
}])

.controller('MainController', ['$scope', '$filter','$routeParams', '$route', '$location', 'twitchFactory',
    function($scope, $filter, $routeParams, $route, $location, twitch) {
        
        $scope.d3 = {fixedNodes: []};
        $scope.graphType =  'pie';
        $scope.messages = {}; // these 2 are kinda related maybe
        
        $scope.twitch = {'loaded': false};
        $scope.twitch.topchannels = [];
        $scope.channel_loaded = false;
        $scope.channel_not_live = true;
        $scope.channel = {};
        
        $scope.$on('$routeChangeSuccess', function() {
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
            
            socket.emit('clearchannels');
            socket.emit('joinchannel', channel);
            
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
        
        var socket = io.connect();
        $scope.limit = 5;
        $scope.highlighted = ''; // ID of the slice we're hovering
        $scope.messages = [];
        $scope.msgCounts = {};
        $scope.totals = [];
        
        $scope.compare = '';
        $scope.ignore = [];
        
        
        socket.on('newcount', function(msg) {
            // todo: convert this to just use msg, and not have to use _.pairs cause its stupid
            $scope.msgCounts[msg.md5] = msg;
            $scope.messages[msg.md5] = msg;
            
            var totals = _.values($scope.msgCounts).sort(function(a, b) {return a.count - b.count}).reverse();
            $scope.totals = totals;
            
            $scope.$apply();
        });
        
        $scope.results = function() {
            //console.log($scope.msgCounts);  
            return $scope.totals;
        };

        $scope.send = function send() {
          console.log('Sending message:', $scope.text);
          socket.emit('message', $scope.text);
          $scope.text = '';
        };
        
        $scope.pause = function() {
            if ($scope.running === true) {
                $scope.running = false;
                $scope.running_text = 'Start';
                socket.emit('stop');
            } else {
                $scope.running = true;
                $scope.running_text = 'Stop';
                socket.emit('start');
            }
        };
        
        $scope.clear = function() {
            $scope.messages = [];
            $scope.msgCounts = {};
            $scope.totals = [];
        };
        
        $scope.do_compare = function() {
            // Restrict output to only the shown keywords
            //var kw = $scope.compare.split(' ');
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
            var filtered = _.filter($scope.totals, function(e) { return e.count > 1 });
            if (filtered.length) {
                $scope.hidden_singles = $scope.totals.length - filtered.length;
            } else {
                $scope.hidden_singles = 0;
            }
            return filtered;
        };
    }
])

.directive('d3Graph', ['graphFactory', function (graphFactory) {
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
        
        scope.$watch('type', function(graphType, oldVal) {
            //console.log('Switch graph type', graphType);
            
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
            };
        
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
                    
                    // Redraw
                    factory.update({svg: graph.svg, nodes: graph.nodes, scope: scope, x: graph.x});
                }
            }); // end scope.$watch
        }); // end $watch on the graphType
    }
  };
}])


;