/*

  A socket is the integer identifier of an input or output in a tool

  A connection is [left_tool, left_output_socket, right_tool, right_socket, is_tie].

  =================================== Tool: ==================================
  - abstract tool.create()             - create an instance of this tool class
  - abstract tool.connect(src_tool, src_socket, dst_socket)
  - abstract tool.disconnect(dst_socket)
  - abstract tool.recalculate(num_indep) - update the outputs and the valid status of the tool, skipping independents
  - abstract tool.add_graphics(level)  - make this tool visible. Level 1 - show outputs, 2 - show everything
  - abstract tool.update_graphics(num_indep) - bring sprite up to date, skipping independent tools
  - abstract tool.max_input_socket()   - returns a number greater than all used input socket numbers
  - abstract tool.max_output_socket()  - returns a number greater than all used output socket numbers
  - abstract tool.get_input(socket)    - returns [input_tool, output_socket]
  - abstract tool.get_output(socket)   - returns output gizmo at that socket
  - abstract tool.get_sprite(socket)   - returns sprite object or an error
  - abstract tool.has_graphics()       - returns graphics level
  - abstract tool.tie(src_socket, dst_tool, dst_socket) - fix and mirror dst_tool's output at src_socket
  - abstract tool.untie(socket)        - untie the tool, upon recalculate will reconstruct its own output
  - abstract tool.create_output(socket)- create an uninitialized output gizmo at given socket, and possibly graphics
  - abstract tool.delete_output(socket)- delete an output gizmo at given socket, and possibly graphics
  - abstract tool.add_graphics(socket) - add graphics object at given socket, requires output gizmo
  - abstract tool.remove_graphics(socket) - reverse of the above
  - tool.listen(socket)                - get gizmo at an input
  - tool.get_matching_outputs(gizmo)   - get output sockets that match the gizmo
  ================================ BasicTool: =================================
  hidden fields:
  - bt.inputs    - [ [src_tool, src_socket], ... ]
  - bt.outputs   - [ gizmo, ... ]
  - bt.sprites   - if it exists, [ sprite, ... ] one for each output

  additional methods:

  - bt.add_output    - add an output gizmo to a tool and create its sprite if necessary
  - bt.remove_output - remove an output gizmo, deleting its sprite if necessary
*/


var Tool = new function() {

    // Conveniently construct a subclass or instance. Each tool is given an id.
    this.extend = function(constr) { 
	constr.prototype = this;
	return new constr();
    };
    

    this.create_output = function(socket) {
	this.add_gizmo(socket);
	if (this.has_graphics()) this.add_sprite(socket);
    }

    this.get_output = function(socket) { 
	var tie = this.get_tie(socket);
	return tie ? tie[0].get_output(tie[1]) : this.get_gizmo(socket);
    }

    this.remove_output = function(socket) {
	if (this.get_tie(socket)) this.untie(socket);
	if (this.has_graphics() && this.get_sprite(socket)) this.remove_sprite(socket);
	if (this.get_gizmo(socket)) this.remove_gizmo(socket);
    }
    
    // return the Gizmo at the given input
    this.listen = function(socket) {
	var connection = this.get_input(socket);
	return connection[0].get_output(connection[1]);
    }

    this.destroy = function() {
	for (var i=0; i<this.max_output_socket(); i++) {
	    this.remove_output(i);
	}
	this.inputs = [];
    }


    this.get_matching_outputs = function(gizmo) {
	var matches = [];
	for (var i=0; i<this.max_output_socket(); i++) {
	    var out_gizmo = this.get_output(i);
	    if (out_gizmo && ((!out_gizmo.valid && !gizmo.valid) || out_gizmo.equals(gizmo))) {
		matches.push(i);
	    } 
	}
	return matches;
    }

    // returns all incoming connections, including ties.
    this.incoming_connections = function() {
	var res = [];
	for (var i=0; i<this.max_input_socket(); i++) {
	    var conn = this.get_input(i);
	    if (conn) res.push([conn[0], conn[1], this, i, false]);
	}
	for (var i=0; i<this.max_output_socket(); i++) {
	    var conn = this.get_tie(i);
	    if (conn) res.push([conn[0], conn[1], this, i, true]);
	}
	return res;
    }
};



var BasicTool = Tool.extend(function() {

    this.create = function(fields) {
	return this.extend(function() {
	    this.inputs   = [];
	    this.gizmos  = [];
	    this.ties     = [];
	    for (var key in fields) { this[key] = fields[key]; }
	});
    }

    // --------------------------------- inputs ----------------------------------

    this.max_input_socket = function() { return this.inputs.length; }

    this.get_input = function(socket) { return this.inputs[socket]; }

    this.connect = function(left_tool, left_out_socket, right_in_socket) {
	// rudimentary sanity check
	if (this.inputs[right_in_socket]) {
	    console.error("Disconnect socket "+right_in_socket+" first"); return;
	}
	this.inputs[right_in_socket] = [left_tool, left_out_socket];
    }

    this.disconnect = function(right_in_socket) {
	if (!this.inputs[right_in_socket]) {
	    console.error("Attempt to disconnect an unconnected socket "+socket); return;
	}
	this.inputs[right_in_socket] = undefined;
    }

    // ----------------------------------- ties ----------------------------------

    this.tie = function(left_tool, left_out_socket, right_out_socket) {
	if (this.ties[right_out_socket]) {
	    console.error("Untie socket "+right_out_socket+" first"); return;
	}
	if (this.gizmos[right_out_socket].type != "point" ||
	    left_tool.get_output(left_out_socket).type != "point") { 
	    console.error("I'm very surprised that you are not tieing two points");
	}
	this.remove_output(right_out_socket);
	this.ties[right_out_socket] = [left_tool, left_out_socket];
    }

    this.get_tie = function(right_out_socket) {
	return this.ties[right_out_socket];
    }

    this.destroy_tie = function(socket) {
	if (!this.ties[socket]) {
	    console.error("Attempt to destroy a tie in an untied socket, "+socket); return;
	}
	this.ties[socket] = undefined;

    }

    this.untie = function(socket) {
	this.destroy_tie(socket);
	this.create_output(socket);
    }

    // ----------------------------------- gizmos --------------------------------------------

    this.max_output_socket = function() { return this.gizmos.length; }

    this.add_gizmo = function(socket) {
	if (this.gizmos[socket]) {
	    console.error("Attempt to create a gizmo at socket "+socket+", but it already exists");
	    return;
	}
	this.gizmos[socket] = this.create_output_gizmo(socket);
    }

    this.get_gizmo = function(socket) { return this.gizmos[socket]; }

    this.remove_gizmo = function(socket) {
	if (!this.gizmos[socket]) {
	    console.error("Attempt to remove a gizmo at socket "+socket+", but there is none");
	    return;
	}
	this.gizmos[socket] = undefined;
    }

    this.first_free_output = function() {
	var socket;
	for (socket = 0; socket < this.max_output_socket(); socket++) {
	    if (!this.gizmos[socket]) {
		break;
	    }
	}
	return socket;
    }

    // ----------------------------------- sprites -------------------------------------------

    this.add_sprite = function(socket) {
	if (!this.has_graphics()) { console.error("Call add_graphics first"); return;	}
	if (!this.sprites) this.sprites = [];
	if (this.sprites[socket]) { console.error("There already is a sprite at socket "+socket); return; }
	if (!this.gizmos[socket]) { console.error("Cannot create sprite without gizmo at socket "+socket); return; }
	this.sprites[socket] = this.gizmos[socket].create_sprite(socket);
    }

    this.get_sprite = function(socket) {
	if (!this.has_graphics() || !this.sprites[socket]) { 
	    if (this.get_tie(socket)) {
		console.error("Attempted to get sprite for socket "+socket+", which is tied");
	    }
	    return undefined;
	}
	return this.sprites[socket];
    }

    this.remove_sprite = function(socket) {
	if (!this.sprites) { console.error("No graphics"); return;	}
	if (!this.sprites[socket]) { console.error("There was no sprite at socket "+socket); return; }
	this.sprites[socket].destroy();
	this.sprites[socket] = undefined;
    }

    // create sprites for all connected outputs
    this.add_graphics = function() {
	if (this.has_graphics()) { console.error("Attempt to add graphics to a tool that already has them"); return; }
	this.i_have_graphics = true;
	for (var i=0; i<this.max_output_socket(); i++) {
	    this.add_sprite(i);
	}
    }

    this.has_graphics = function() { return this.i_have_graphics; }

    this.remove_graphics = function() {
	for (var i=0; i<this.max_output_socket; i++) {
	    this.remove_sprite(i);
	}
	delete this.i_have_graphics;
    }

    this.update_graphics = function() {
	if (!this.sprites) return;
	for (var i=0; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];
	    if (gizmo) gizmo.update_sprite(this.sprites[i]);
	}
    }
});

var LineTool = BasicTool.extend(function() {

    this.recalculate = function() {
	var point1 = this.listen(0), point2 = this.listen(1);
	var line = this.gizmos[0];
	line.valid = point1.valid && point2.valid;
	if (line.valid) {
	    line.p1 = point1.dup();
	    line.p2 = point2.dup();
	}
    }

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return Line.create(); }

});


var CircleTool = BasicTool.extend(function() {

    this.recalculate = function() {
	var center = this.listen(0), border = this.listen(1);
	var circle = this.gizmos[0];
	circle.valid = center.valid && border.valid;
	if (circle.valid) {
	    circle.center = center.dup();
	    circle.border = border.dup();
	}
    }

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return Circle.create(); }

});


var CCI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	instance.create_output(1);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return ConstructedPoint.create(); }

    this.mark_valid = function(v) {
	for (var i=0; i!=2; i++) {
	    if (!this.ties[i]) this.gizmos[i].valid = v;
	}
    }

    this.solutions = function(p1, p2) {
	var i = this.ties[0] ? 0 : this.ties[1] ? 1 : -1;
	if (i==-1) {
	    this.gizmos[0].pos = p1;
	    this.gizmos[1].pos = p2;
	} else {
	    var tie = this.ties[i];
	    var tied_output = tie[0].get_output(tie[1]);
	    this.gizmos[1-i].pos = Point.distance_cc(p1, tied_output.pos) < SMALL ? p2 : p1;
	}
    }


    this.recalculate = function() {
	if (this.ties[0] && this.ties[1]) return; // our hands are tied!
 	var circle1 = this.listen(0), circle2 = this.listen(1); // nieuw
	if (!circle1.valid || !circle2.valid) { this.mark_valid(false); return; }
	this.mark_valid(true);
	var centre1 = circle1.center; // UK vs US!
	var centre2 = circle2.center;

	var x1 = centre1[0], y1 = centre1[1];
	var x2 = centre2[0], y2 = centre2[1];
	var dx = x2-x1, dy = y2-y1;
	var d2 = dx*dx+dy*dy;

	if (d2<SMALL2) { this.mark_valid(false); return; } // circles with same centre have no intersections

	var r1 = circle1.radius(), r2 = circle2.radius();
	var D = ((r1+r2)*(r1+r2)/d2-1) * (1-(r1-r2)*(r1-r2)/d2);

	// case 1: no intersections
	if (D < -SMALL) { this.mark_valid(false); return; }
	
	var dr2 = 0.5*(r1*r1-r2*r2)/d2;
	var xs = 0.5*(x1+x2)+dx*dr2
	var ys = 0.5*(y1+y2)+dy*dr2

	if (D<SMALL) {
	    // case 2: one intersection. Pretend that D is zero
	    this.solutions([xs,ys], [xs,ys]);
	} else {
	    // case 3: two intersections
	    var K = 0.5*Math.sqrt(D);
	    var xt =  dy*K;
	    var yt = -dx*K;


	    // get a consistent ordering of the two intersection points
	    // var b1 = circle1.border;
	    // if (xt*(b1[0]-x1) + yt*(b1[1]-y1) > SMALL) {
	    //   xt = -xt; yt = -yt;
	    // }

	    this.solutions([xs+xt, ys+yt], [xs-xt, ys-yt]);
	}
    }

    if (false) {
	this.add_graphics = function() {
	    BasicTool.add_graphics.call(this);
	    for (var i=0; i<this.max_output_socket(); i++) {
		var sprite = this.get_sprite(i);
		if (sprite) {
		    sprite.remove_class("intersectionpoint");
		    sprite.add_class("intersectionpoint"+i);
		    sprite.lift("controlpoints");
		}
	    }
	}
    }


});


var LCI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	instance.create_output(1);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return ConstructedPoint.create(); }

    this.mark_valid = function(v) {
	for (var i=0; i!=2; i++) {
	    if (!this.ties[i]) this.gizmos[i].valid = v;
	}
    }

    this.solutions = function(p1, p2) {
	var i = this.ties[0] ? 0 : this.ties[1] ? 1 : -1;
	if (i==-1) {
	    this.gizmos[0].pos = p1;
	    this.gizmos[1].pos = p2;
	} else {
	    var tie = this.ties[i];
	    var tied_output = tie[0].get_output(tie[1]);
	    this.gizmos[1-i].pos = Point.distance_cc(p1, tied_output.pos) < SMALL ? p2 : p1;
	}
    }

    this.recalculate = function() {
	if (this.ties[0] && this.ties[1]) return; // our hands are tied!
	var line = this.listen(0), circle = this.listen(1);
	if (!line.valid || !circle.valid) { this.mark_valid(false); return; }
	this.mark_valid(true);
	var cx = circle.center[0], cy = circle.center[1];
	var r2 = (cx-circle.border[0])*(cx-circle.border[0]) + (cy-circle.border[1])*(cy-circle.border[1]);
	var x1 = line.p1[0] - cx, y1 = line.p1[1] - cy;
	var x2 = line.p2[0] - cx, y2 = line.p2[1] - cy;
	var dx = x2-x1, dy = y2-y1;
	var dr2 = dx*dx+dy*dy;
	var D = x1*y2-x2*y1;
	var R = r2*dr2 - D*D;
	
	// case 1: no intersections
	if (R<=-SMALL2 || dr2<=SMALL2) { this.mark_valid(false); return; }
	D = D/dr2;

	var xs = cx+D*dy;
	var ys = cy-D*dx;

	if (R<SMALL2) {
	    // case 2: one intersection. Pretend that R is zero
	    this.solutions([xs,ys], [xs,ys]);
	} else {
	    // case 3: two intersections
	    var sqrtR = Math.sqrt(R)/dr2;
	    var xt = dx*sqrtR, yt = dy*sqrtR;
	    this.solutions([xs+xt,ys+yt], [xs-xt,ys-yt]);
	}
    }


    if (false) {
	this.add_graphics = function() {
	    BasicTool.add_graphics.call(this);
	    for (var i=0; i<this.max_output_socket(); i++) {
		var sprite = this.get_sprite(i);
		if (sprite) {
		    sprite.remove_class("intersectionpoint");
		    sprite.add_class("intersectionpoint"+i);
		    sprite.lift("controlpoints");
		}
	    }
	}
    }


});

var LLI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return ConstructedPoint.create(); }

    this.mark_valid = function(v) {
	if (!this.ties[0]) this.gizmos[0].valid = v;
    }


    this.recalculate = function() {
	if (this.ties[0]) return; // our single sad hand is tied
	var line1 = this.listen(0), line2 = this.listen(1);
	var v = line1.valid && line2.valid;
	var xy;
	if (v) {
	    xy = Line.compute_intersection(line1, line2);
	    v = xy && isFinite(xy[0]) && isFinite(xy[1]);
	}
	this.mark_valid(v);
	if (v) this.gizmos[0].pos = xy;
    }

});


/* Connect the ArcTool as follows:
   - create the CircleTool first, either with or without graphics.
   - connect input 0 to the CircleTool.
   - connect inputs 1 and 2 to a CCI_Tool or LCI_Tool, which intersect the correct Circle

   Upon recalculate, the Arc gizmo is supplied with the coordinates of central and two border points.
   Recalculate also checks that the intersections both have the correct Circle as parent.

   Note that the UI for ArcTools is different than for other Tools.
   It is combined with marking circles as outputs.
   There are no loose controlpoints
*/
var ArcTool = BasicTool.extend(function() {
	
    this.create = function() {
	
    }
    /*
  - abstract tool.recalculate(num_indep) - update the outputs and the valid status of the tool, skipping independents
  - abstract tool.add_graphics(level)  - make this tool visible. Level 1 - show outputs, 2 - show everything
  - abstract tool.update_graphics(num_indep) - bring sprite up to date, skipping independent tools
    */
});
