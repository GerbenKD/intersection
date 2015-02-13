/*

  A socket is the integer identifier of an input or output in a tool

  =================================== Tool: ==================================
  - tool.id             - for serialization and to use as key in hash

  - abstract tool.create({fields})     - create an instance of this tool class
  - abstract tool.connect(src_tool, src_socket, dst_socket)
  - abstract tool.disconnect(dst_socket)
  - abstract tool.recalculate()        - update the outputs and the valid status of the tool  
  - abstract tool.add_graphics(level)  - make this tool visible. Level 1 - show outputs, 2 - show everything
  - abstract tool.update_graphics()    - bring sprite up to date
  - abstract tool.max_input_socket()   - returns a number greater than all used input socket numbers
  - abstract tool.max_output_socket()  - returns a number greater than all used output socket numbers
  - abstract tool.get_input(socket)    - returns [input_tool, output_socket]
  - abstract tool.get_output(socket)   - returns output gizmo at that socket
  - abstract tool.get_sprite(socket) - returns sprite object or an error
  - tool.listen                        - get gizmo at an input
  ================================ BasicTool: =================================
  hidden fields:
  - bt.inputs    - [ [src_tool, src_socket], ... ]
  - bt.outputs   - [ gizmo, ... ]
  - bt.sprites   - if it exists, [ sprite, ... ] one for each output

  additional methods:

  - bt.add_output    - add an output gizmo to a tool and create its sprite if necessary
  - bt.remove_output - remove an output gizmo, deleting its sprite if necessary

  =============================== CompoundTool: ===============================
  hidden fields:
  - ct.input_interface
  - ct.output_interface
  - ct.tools             - [ tool, tool, ... ] - in topological sorted order
  - ct.graphics_level (1 = outputs, 2 = everything)

  additional methods:
  - ct.add_tool          - add a new tool to the compound tool
*/

var Tool = new function() {

    // Conveniently construct a subclass or instance. Each tool is given an id.
    this.extend = function() { 
	var id = 0;
	return function(constr) {
	    constr.prototype = this;
	    var instance = new constr();
	    instance.id = id++;
	    return instance;
	}
    }();

    // return the Gizmo at the given input
    this.listen = function(socket) {
	var connection = this.get_input(socket);
	return connection[0].get_output(connection[1]);
    }

};

var BasicTool = Tool.extend(function() {

    this.create = function(fields) {
	return this.extend(function() {
	    this.inputs   = [];
	    this.outputs  = [];
	    this.num_connections = 0;
	    for (var key in fields) { this[key] = fields[key]; }
	});
    }

    this.connect = function(src_tool, src_socket, dst_socket) {
	// rudimentary sanity check
	if (this.inputs[dst_socket]) {
	    console.error("Disconnect socket "+dst_socket+" first"); return;
	}
	this.inputs[dst_socket] = [src_tool, src_socket];
	this.num_connections++;
    }

    this.disconnect = function(socket) {
	if (this.inputs[socket]) {
	    console.error("Attempt to disconnect an unconnected socket "+socket); return;
	}
	this.inputs[socket] = null;
	this.num_connections--;
    }

    // create sprites for all connected outputs
    this.add_graphics = function() {
	if (this.sprites) { console.error("Attempt to add sprites to a tool that already has them"); return; }
	this.sprites = [];
	for (var i=0; i<this.outputs.length; i++) {
	    if (this.outputs[i]) {
		this.sprites[i] = this.outputs[i].create_sprite();
	    }
	}
    }

    this.update_graphics = function() {
	if (!this.sprites) return;
	for (var i=0; i<this.outputs.length; i++) {
	    var output = this.outputs[i];
	    if (output) output.update_sprite(this.sprites[i]);
	}
    }

    this.add_output = function(gizmo) {
	var socket;
	for (socket = 0; socket < this.outputs.length; socket++) {
	    if (this.outputs[socket] == null) {
		break;
	    }
	}
	this.outputs[socket] = gizmo;
	if (this.sprites) this.sprites[socket] = gizmo.create_sprite();
	return socket;
    }

    this.remove_output = function(socket) {
	if (!this.outputs[socket]) { console.error("Attempt to remove a nonexisting output"); return; }
	if (this.sprites) { this.sprites[socket].destroy(); this.sprites[socket]=null; }
	this.outputs[socket] = null;
    }

    this.max_input_socket = function() { return this.inputs.length; }
    this.max_output_socket = function() { return this.outputs.length; }

    this.get_input = function(socket) { return this.inputs[socket]; }
    this.get_output = function(socket) { return this.outputs[socket]; }
    this.get_sprite = function(socket) {
	if (!this.sprites || !this.sprites[socket]) { 
	    console.error("Sprite expected for output "+socket); return null; 
	}
	return this.sprites[socket];
    }

    this.highlight = function(socket, value) {
	if (!this.sprites || !this.sprites[socket]) { console.error("Bad attempt to highlight"); return; }
	var g = this.get_sprite(socket);
	if (value) g.add_class("highlighted"); else g.remove_class("highlighted"); 
    }

});

var ControlPointTool = BasicTool.extend(function() {

    this.add = function(pos) {
	return this.add_output(ControlPoint.create(pos));
    }

    this.find_closest = function(pos) {
	var i_best=-1, d_best = Infinity;
	for (var i=0; i<this.outputs.length; i++) {
	    var d = this.outputs[i].distance_to_c(pos);
	    if (d < d_best) { d_best = d; i_best = i; }
	}
	return [i_best, d_best];
    }

});


var LineTool = BasicTool.extend(function() {

    this.recalculate = function() {
	var point1 = this.listen(0), point2 = this.listen(1);
	var line = this.outputs[0];
	line.valid = point1.valid && point2.valid;
	if (line.valid) {
	    line.p1 = point1.dup();
	    line.p2 = point2.dup();
	}
    }

    this.create = function(fields) {
	var instance = BasicTool.create.call(this, fields);
	instance.add_output(Line.create());
	return instance;
    }

});


var CircleTool = BasicTool.extend(function() {

    this.recalculate = function() {
	var center = this.listen(0), border = this.listen(1);
	var circle = this.outputs[0];
	circle.valid = center.valid && border.valid;
	if (circle.valid) {
	    circle.center = center.dup();
	    circle.border = border.dup();
	}
    }

    this.create = function(fields) {
	var instance = BasicTool.create.call(this, fields);
	instance.add_output(Circle.create());
	return instance;
    }

});


var CCI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.add_output(ConstructedPoint.create());
	instance.add_output(ConstructedPoint.create());
	return instance;
    }

    this.mark_valid = function(v) {
	this.outputs[0].valid = v;
	this.outputs[1].valid = v;
    }

    this.recalculate = function() {
 	var circle1 = this.listen(0), circle2 = this.listen(1); // nieuw
	if (!circle1.valid || !circle2.valid) { this.mark_valid(false); return; }
	this.mark_valid(true);
	var centre1 = circle1.center; // UK vs US!
	var centre2 = circle2.center;

	var x1 = centre1[0], y1 = centre1[1];
	var x2 = centre2[0], y2 = centre2[1];
	var r1 = circle1.radius(), r2 = circle2.radius();
	var dx = x2-x1, dy = y2-y1;
	var d2 = dx*dx+dy*dy;

	if (d2<SMALL2) { this.mark_valid(false); return; } // circles with same centre have no intersections

	var D = ((r1+r2)*(r1+r2)/d2-1) * (1-(r1-r2)*(r1-r2)/d2);

	// case 1: no intersections
	if (D < -SMALL) { this.mark_valid(false); return; }
	
	var dr2 = 0.5*(r1*r1-r2*r2)/d2;
	var xs = 0.5*(x1+x2)+dx*dr2
	var ys = 0.5*(y1+y2)+dy*dr2

	if (D<SMALL) {
	    // case 2: one intersection. Pretend that D is zero
	    this.outputs[0].pos = [xs, ys];
	    this.outputs[1].pos = [xs, ys];
	} else {
	    // case 3: two intersections
	    var K = 0.5*Math.sqrt(D);
	    var xt =  dy*K;
	    var yt = -dx*K;

	    // get a consistent ordering of the two intersection points
	    var b1 = circle1.border;
	    if (xt*(b1[0]-x1) + yt*(b1[1]-y1) > SMALL) {
		xt = -xt; yt = -yt;
	    }
	    
	    this.outputs[0].pos = [xs+xt, ys+yt];
	    this.outputs[1].pos = [xs-xt, ys-yt];
	}
    }
});


var LCI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.add_output(ConstructedPoint.create());
	instance.add_output(ConstructedPoint.create());
	return instance;
    }

    this.mark_valid = function(v) {
	this.outputs[0].valid = v;
	this.outputs[1].valid = v;
    }

    this.recalculate = function() {
	var line = this.listen(0), circle = this.listen(1);
	if (!line.valid || !circle.valid) { this.mark_valid(false); return; }
	this.mark_valid(true);
	var cx = circle.center[0], cy = circle.center[1],
	    bx = circle.border[0], by = circle.border[1];
	var r2 = (cx-bx)*(cx-bx) + (cy-by)*(cy-by);
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
	    this.outputs[0].pos = [xs, ys];
	    this.outputs[1].pos = [xs, ys];
	} else {
	    // case 3: two intersections
	    var sqrtR = Math.sqrt(R)/dr2;
	    var xt = dx*sqrtR, yt = dy*sqrtR;

	    this.outputs[0].pos = [xs+xt, ys+yt];
	    this.outputs[1].pos = [xs-xt, ys-yt];
	}
    }


});

var LLI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.add_output(ConstructedPoint.create());
	return instance;
    }

    this.mark_valid = function(v) {
	this.outputs[0].valid = v;
    }


    this.recalculate = function() {
	var line1 = this.listen(0), line2 = this.listen(1);
	var v = line1.valid && line2.valid;
	var xy;
	if (v) {
	    xy = Line.compute_intersection(line1, line2);
	    v = xy && isFinite(xy[0]) && isFinite(xy[1]);
	}
	this.mark_valid(v);
	if (v) this.outputs[0].pos = xy;
    }

});



var InterfaceTool = BasicTool.extend(function() {
    
    this.connect = function(src_tool, src_socket, dst_socket) {
	BasicTool.connect.call(this, src_tool, src_socket, dst_socket);
	this.outputs[dst_socket] = this.listen(dst_socket); // equals src_tool.outputs[src_socket] 
	if (this.sprites) this.sprites[dst_socket] = this.outputs[dst_socket].create_sprite();
    }
    
    this.disconnect = function(socket) {
	BasicTool.disconnect.call(this, socket);
	if (this.sprites) { this.graphics[socket].destroy(); this.graphics[socket]=null; }
	this.outputs[socket] = null;
    }
    
    // by copying over the inputs every recalculation we ensure that tools can change their output gizmos
    // if they want
    this.recalculate = function() {
	for (var i = 0; i < this.inputs.length; i++) {
	    if (this.inputs[i]) {
		this.outputs[i] = this.listen(i);
	    }
	}
    }
    
});


var CompoundTool = Tool.extend(function() {

    this.create = function(fields) {
	return this.extend(function() {
	    for (var key in fields) { this[key] = fields[key]; }
	    this.input_interface  = InterfaceTool.create();
	    this.output_interface = InterfaceTool.create();
	    this.tools = [];
	});
    }

    this.connect = function(src_tool, src_socket, dst_socket) {
	this.input_interface.connect(src_tool, src_socket, dst_socket);
    }

    this.disconnect = function(dst_socket) {
	this.input_interface.disconnect(dst_socket);
    }

    
    this.recalculate = function() {
	this.input_interface.recalculate();
	for (var i = 0; i < this.tools.length; i++) {
	    this.tools[i].recalculate();
	}
	this.output_interface.recalculate();
    }

    this.add_graphics = function(lvl) {
	this.graphics_level = lvl;
	switch (lvl) {
	case 1:
	    this.output_interface.add_graphics();
	    break;
	case 2:
	    // TODO perhaps outputs should have a special look, or something
	    for (var i=0; i<this.tools.length; i++) {
		this.tools[i].add_graphics();
	    }
	    break;
	default:
	    console.error("Bad graphics level!");
	    break;
	}
    }
    
    this.update_graphics = function() {
	if (!this.graphics_level) return;
	switch (this.graphics_level) {
	case 1:
	    this.output_interface.update_graphics();
	    break;
	case 2:
	    for (var i=0; i<this.tools.length; i++) {
		this.tools[i].update_graphics();
	    }
	    break;
	default:
	    console.error("Graphics level "+this.graphics_level+" not implemented in update_graphics");
	    break;
	}
    }

    this.add_tool = function(tool) {
	function create_intersection(tool1, socket1, gizmo1, tool2, socket2, gizmo2) {
	    var itool;
	    var invert = false;
	    if (gizmo1.type == "line") {
		itool = gizmo2.type == "line" ? LLI_Tool.create() : LCI_Tool.create(); 
	    } else {
		invert = true;
		itool = gizmo2.type == "line" ? LCI_Tool.create() : CCI_Tool.create(); 
	    }
	    itool.connect(tool1, socket1, invert ? 1 : 0);
	    itool.connect(tool2, socket2, invert ? 0 : 1);
	    return itool;
	}

	var n_existing_tools = this.tools.length;
	this.tools.push(tool);

	var gr = this.graphics_level==2 && !tool.graphics;
	if (gr) tool.add_graphics();

	for (var j=0; j<tool.max_output_socket(); j++) {
	    var gizmo = tool.get_output(j);
	    if (!gizmo) continue;
	    if (gizmo.type == "point") continue;
	    for (var i=0; i<n_existing_tools; i++) {
		var test_tool = this.tools[i];
		for (var k=0; k<test_tool.max_output_socket(); k++) {
		    var test_gizmo = test_tool.get_output(k);
		    if (!test_gizmo) continue;
		    if (test_gizmo.type == "point") continue;
		    var itool = create_intersection(tool, j, gizmo, test_tool, k, test_gizmo);
		    if (gr) itool.add_graphics();
		    this.tools.push(itool);
		}
	    }
	}
    }
     
    this.get_input  = function(socket) { return this.input_interface.get_input(socket);   }
    this.get_output = function(socket) { return this.output_interface.get_output(socket); }
    this.get_sprite = function(socket) { return this.output_interface.get_sprite(socket); }
    this.max_output_socket = function() { return this.output_interface.max_output_socket(); }
    this.max_input_socket = function() { return this.input_interface.max_input_socket(); }

    // invariant: every tool's inputs refer to tools earlier in the tools array, or to the controlpoint tool
    this.separate = function(tool, socket) {
	var dependent = {}; // hashes dependent tools that have been seen
	var dependent_tools = [];

	var i_wr = 0;
	for (var i_rd=0; i_rd<this.tools.length; i_rd++) {
	    var t = this.tools[i_rd];
	    var dep = check_dependent(t);
	    if (dep) {
		dependent_tools.push(t);
		dependent[t.id] = true;
	    } else {
		this.tools[i_wr++] = t;
	    }
	}
	if (i_rd-i_wr != dependent_tools.length) console.error("More shit and fans");
	for (var i=0; i<i_rd-i_wr; i++) { this.tools[i_wr+i] = dependent_tools[i]; }
	
	return i_wr;

	// tool is dependent on the controlpoint if its inputs refer to either another dependent tool, or
	// to the controlpoint tool with the correct socket
	function check_dependent(t) {
	    for (var i=0; i<t.max_input_socket(); i++) {
		var inp = t.get_input(i);
		if (!inp) continue;
		if ((inp[0]===tool && inp[1]==socket) || dependent[inp[0].id]) return true;
	    }
	    return false;
	}
    }

});
