var app = angular.module('kappablob', ['ngRoute'])

/*
.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('{[{').endSymbol('}]}');
})
*/

.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
    $routeProvider
      /*.when('/', {
          //templateUrl: 'static/maintable.html',
          controller: 'MainController',
      })*/
      .when('/about', {
        templateUrl: 'static/add_expense.html',
        controller: 'SiteController',
      })
      .when('/:channel', {
          //templateUrl: 'static/add_onetime_expense.html',
          controller: 'TestController',
      })
      ;

    $locationProvider.html5Mode(true);
}])
/*
.controller('TestController', ['$scope', '$routeParams', 
    function ($scope, $routeParams) {
        console.log('TestController,', $routeParams);
    }])*/
    
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

.controller('MainController', ['$scope', '$filter','$routeParams', '$route', '$location', 'twitchFactory',
    function($scope, $filter, $routeParams, $route, $location, twitch) {
        
        $scope.d3 = {fixedNodes: []};
        $scope.twitch = {'loaded': false};
        $scope.twitch.topchannels = [];
        $scope.channel_loaded = false;
        $scope.channel = {};
        
        $scope.$on('$routeChangeSuccess', function() {
            $scope.new_channel($routeParams.channel);
        });
        
        twitch.topchannels().success(function(data) {
            $scope.twitch.topchannels = data.streams.slice(0,10);
            $scope.twitch.loaded = true;
        });
        
        $scope.new_channel = function(channel) {
            console.log('Joining Channel', channel)  ;
            // Call factory function to use that channel?
            socket.emit('clearchannels');
            socket.emit('joinchannel', channel);
            
            twitch.channel(channel).success(function(data) {
               $scope.channel_loaded = true;
               $scope.channel = data;
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
            $scope.msgCounts[msg.md5] = msg;
            var msgCountsA = _.pairs($scope.msgCounts);
            var totals = msgCountsA.sort(function(a, b) {return a[1].count - b[1].count}).reverse();
            $scope.totals = {'limit': $scope.limit, 'data': totals};
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
            if (row[1].md5 == $scope.highlighted)   {
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
            var filtered = _.filter($scope.totals.data, function(e) { return e[1].count > 1 });
            if (filtered.length) {
                $scope.hidden_singles = $scope.totals.data.length - filtered.length;
            } else {
                $scope.hidden_singles = 0;
            }
            return filtered;
        };
    }
])

.directive('d3Graph', function ( /* dependencies */ ) {
  // define constants and helpers used for the directive
  // ...
  return {
    restrict: 'E', // the directive can be invoked only by using <my-directive> tag in the template
    scope: { // attributes bound to the scope of the directive
      //val: '='
      data: '=',
      using: '=',
    },
    transclude: true,
    //template: '<svg width="850" height="500"></svg>',
    link: function (scope, element, attrs) {
      // initialization, done once per my-directive tag in template. If my-directive is within an
      // ng-repeat-ed template then it will be called every time ngRepeat creates a new copy of the template.
      // Draw empty d3 template
      
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
    

      // whenever the bound 'exp' expression changes, execute this 
      // totals refers to $scope.totals (i think)
      scope.$watch('data', function (newVal, oldVal, sc) {
        // ...
        // Redraw the svg, using scope.totals
        svg.selectAll('*').remove(); // Clear out the pie bits
        
        // Get list of counts
        var piedata = [];
        _.each(newVal.data, function(ele, idx, list) {
            piedata.push(ele[1]);
        });
        var piedata2 = piedata.slice(0, newVal.limit);
        
        if (!_.isUndefined(newVal)) {
            var piedata = newVal.data.slice(0, newVal.limit);
        }
        
        var pie = d3.layout.pie()
            .sort(null)
            .value(function(d) {  return d.count; });
        
        var g = svg.selectAll(".arc")
          .data(pie(piedata2))
            .enter().append("g")
          .attr("class", "arc pieslice")
          .attr('id', function(d, i) { return 'pie-' + piedata[i][0]; });
          
          //g.append('svg:title').text(function(d, i) { console.log('svgtitle', d, i);return 'ass'; })
          
        var color = d3.scale.ordinal()
            .range(["#69D2E7", "#A7DBD8", "#E0E4CC", "#F38630", "#FA6900"]);

        var arc = d3.svg.arc()
            .outerRadius(radius - 10)
            .innerRadius(0);   
          
          g.append("path")
              .attr("d", arc)
              .style("fill", function(d, i) { return color(i); });
              
              
          g.append("text")
              .attr("transform", function(d) { return "translate(" + labelArc.centroid(d) + ")"; })
              .attr("dy", ".35em")
              .text(function(d) { return d.data[0]; });
              
            // Events
            g.on('mouseover', function(d, i) {
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
            });
            
      });
    }
  };
})

.directive('d3Bubbles', function ( /* dependencies */ ) {
  // define constants and helpers used for the directive
  // ...
  return {
    restrict: 'E', // the directive can be invoked only by using <my-directive> tag in the template
    scope: { // attributes bound to the scope of the directive
      //val: '='
      data: '=',
      using: '=',
    },
    transclude: true,
    //template: '<svg width="850" height="500"></svg>',
    link: function (scope, element, attrs) {
      // initialization, done once per my-directive tag in template. If my-directive is within an
      // ng-repeat-ed template then it will be called every time ngRepeat creates a new copy of the template.
      // Draw empty d3 template
      
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
        
        var labelArc = d3.svg.arc()
            .outerRadius(radius - 40)
            .innerRadius(radius - 40);
    
        
        var color = d3.scale.ordinal()
            .range(["#69D2E7", "#A7DBD8", "#E0E4CC", "#F38630", "#FA6900"]);

      // whenever the bound 'exp' expression changes, execute this 
      // totals refers to $scope.totals (i think)
      scope.$watch('data', function (newVal, oldVal, sc) {
        // ...
        // Redraw the svg, using scope.totals
        svg.selectAll('*').remove(); // Clear out the bubbles
        
        // Get list of counts
        var piedata = [];
        _.each(newVal.data, function(ele, idx, list) {
            piedata.push({ className: ele[1].norm, name: ele[1].norm, value: ele[1].count });
        });
        
        // Bubble object
        var bubble = d3.layout.pack()
            .sort(null)
            .size([width, height])
            .padding(1.5)
            .value(function(d) { return d.value; });
            
        //console.log('pies', piedata, bubble.nodes({ name: 'idk', children: piedata }));
        
        var node_data = {name: '__rootNode', children: piedata};
        
        var node = svg.selectAll(".node")
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
                      return color(d.value);
                    }
                  return '#ffffff';
              })
              ;
        
          node.append("text")
              .attr("dy", ".3em")
              .style("text-anchor", "middle")
              .text(function(d) { 
                  if (d.name != '__rootNode') {
                    return d.name.substring(0, 5); 
                  }
                  return '';
              });
          
          //g.append('svg:title').text(function(d, i) { console.log('svgtitle', d, i);return 'ass'; })
              
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
            
      });
    }
  };
})

.directive('d3Force', function ( /* dependencies */ ) {
  // define constants and helpers used for the directive
  // ...
  return {
    restrict: 'E', // the directive can be invoked only by using <my-directive> tag in the template
    scope: { // attributes bound to the scope of the directive
      //val: '='
      data: '=',
      using: '=',
    },
    transclude: true,
    //template: '<svg width="850" height="500"></svg>',
    link: function (scope, element, attrs) {
      // initialization, done once per my-directive tag in template. If my-directive is within an
      // ng-repeat-ed template then it will be called every time ngRepeat creates a new copy of the template.
      // Draw empty d3 template
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
        
        var color = d3.scale.ordinal()
            .range(["#69D2E7", "#A7DBD8", "#E0E4CC", "#F38630", "#FA6900"]);
            
            // Resolve collisions between nodes.
            
        var sel = svg.selectAll('.node');
          
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
        function gravity(alpha) {
            return function (d) {
                d.y += (d.cy - d.y) * alpha;
                d.x += (d.cx - d.x) * alpha;
            };
        };
        function collide(alpha, nodes) {
            var quadtree = d3.geom.quadtree(nodes);
            return function (d) {
                var r = d.radius + radius.domain()[1] + padding,
                    nx1 = d.x - r,
                    nx2 = d.x + r,
                    ny1 = d.y - r,
                    ny2 = d.y + r;
                quadtree.visit(function (quad, x1, y1, x2, y2) {
                    if (quad.point && (quad.point !== d)) {
                        var x = d.x - quad.point.x,
                            y = d.y - quad.point.y,
                            l = Math.sqrt(x * x + y * y),
                            r = d.radius + quad.point.radius + (d.color !== quad.point.color) * padding;
                        if (l < r) {
                            l = (l - r) / l * alpha;
                            d.x -= x *= l;
                            d.y -= y *= l;
                            quad.point.x += x;
                            quad.point.y += y;
                        }
                    }
                    return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
                });
            };
        };
        function tick() {
            //circles.each(gravity(.2 * e.alpha));
           // console.log('tick', d);
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
        };
        
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
        
        function g_text(d) {
            if (d.radius < 15) {
                return '';
            }
            return d.name.substring(0, 20);
        };
        
        // Set up graph stuff
        // Force
        var force = d3.layout.force()
        .size([width, height])
        .linkDistance(200) // idkkkkkk?
        .friction(0.9) // how slow they wander over
        .charge(0)
        .on('tick', tick);
        
        // Update function
        function update_graph() {
            var nodes_flat = picknodes(nodes);
            //svg.selectAll('*').remove();
            
            //var sel = svg.selectAll('g').data(nodes_flat, function(d) { return d.id; });
            var sel = svg.selectAll('g').data(nodes_flat, function(d) { return d.id; });
            //sel.data(nodes_flat);
            
            // Update old elements
            var old = sel.attr('class', 'node');
            old.select('text').text(g_text);
            old.select('circle').attr('r', function(d) { return d.radius });
            // Set xy on old elements to what they already are
            
            // New elements
            
            var g = sel.enter().append('g')
                .attr("class", 'node')
                .attr('translate', 'transform(0,0)')
                .call(force.drag);
             
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
                .text(g_text);
              
            g.on('mouseover', function(d, i) {
                scope.$parent.highlighted = d.id;
                scope.$parent.$apply();
                //d3.select(this).classed('fixed', d.fixed = true);
            })
            .on('mouseout', function(d, i) {
                scope.$parent.highlighted = ''; 
                scope.$parent.$apply();
                //d3.select(this).classed('fixed', d.fixed = false);
            });
              
            // Removed elements
            sel.exit().remove();
            force.nodes(nodes_flat).start();
        };
        
        function add_node(ele) {
            nodes[ele.md5] = { 
                id: ele.md5,
                name: ele.norm, 
                value: Math.min(100, ele.count),
                radius: Math.max(10, Math.min(ele.count, 100)),
                fill: color(_.sample(_.range(0, 4)))
            };
        };
        
      // 'data' refers to data attr on d3-force ele, which is totals, which points ot $scope.totals
      scope.$watch('data', function (newVal, oldVal, sc) {
          if (newVal.data) {
            var newData = newVal.data.slice(0, 20); // Too many elements = bad fps
            
            // Get list of counts
            var totalmessagevalue = 0;
            _.each(newData, function(ele, idx, list) {
                // Calculate for scale of circles
                totalmessagevalue += ele[1].count;
                
                // Don't add again if count hasn't changed, otherwise it seems to reset the entire nodelist
                // and restarts the animation
                // Oh maybe cause i didn't copy the px from nodes[ele.md5], i reset the whole object
                if (ele[1].md5 in nodes) {
                    var _current = nodes[ele[1].md5];
                    if (_current.value == ele[1].count) {
                        return;
                    } else {
                        // Update node?
                        nodes[ele[1].md5].value = ele[1].count;
                        nodes[ele[1].md5].radius = Math.max(10, Math.min(ele[1].count, 100));
                    }
                } else {
                    add_node(ele[1]);
                }
            });
            
            // Redraw
            update_graph();
          }
      }); // end scope.$watch
    }
  };
})

;