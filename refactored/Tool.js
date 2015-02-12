/*

  A socket is the integer identifier of an input or output in a tool

  =================================== Tool: ==================================
  - tool.id             - for serialization and to use as key in hash

  - abstract tool.create({fields})    - create an instance of this tool class
  - abstract tool.connect(src_tool, src_socket, dst_socket)
  - abstract tool.disconnect(dst_socket)
  - abstract tool.recalculate()       - update the outputs and the valid status of the tool  
  - abstract tool.add_graphics(level) - make this tool visible. Level 1 - show outputs, 2 - show everything
  - abstract tool.update_graphics()   - bring graphics up to date
  
  ================================ BasicTool: =================================
  hidden fields:
  - bt.inputs    - [ [src_tool, src_socket], ... ]
  - bt.outputs   - [ gizmo, ... ]
  - bt.graphics  - if it exists, [ svg object, ... ] one for each output

  additional methods:
  - bt.listen        - get gizmo at an input; could be moved up to tool if that should be useful
  - bt.add_output    - add an output gizmo to a tool and create its graphics if necessary
  - bt.remove_output - remove an output gizmo, deleting its graphics if necessary

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

    // return the Gizmo at the given input
    this.listen = function(socket) {
	var connection = this.inputs[socket];
	return connection[0].outputs[connection[1]];
    }

    // create svg objects for all connected outputs
    this.add_graphics = function() {
	if (this.graphics) { console.error("Attempt to add graphics to a tool that already has them"); return; }
	this.graphics = [];
	for (var i=0; i<this.outputs.length; i++) {
	    if (this.outputs[i]) {
		this.graphics[i] = this.outputs[i].create_graphics();
	    }
	}
    }

    this.update_graphics = function() {
	if (!this.graphics) return;
	for (var i=0; i<this.outputs.length; i++) {
	    var output = this.outputs[i];
	    if (output) output.update_graphics(this.graphics[i]);
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
	if (this.graphics) this.graphics[socket] = gizmo.create_graphics();
	return socket;
    }

    this.remove_output = function(socket) {
	if (!this.outputs[socket]) { console.error("Attempt to remove a nonexisting output"); return; }
	if (this.graphics) { 
	    this.outputs[socket].destroy_graphics(this.graphics[socket]); 
	    this.graphics[socket]=null;
	}
	this.outputs[socket] = null;
    }

    this.highlight = function(socket, value) {
	if (!this.graphics || !this.graphics[socket]) { console.error("Bad attempt to highlight"); return; }
	(value ? Graphics.add_class : Graphics.remove_class)(this.graphics[socket], "highlighted");
    }

});

var ControlPointTool = BasicTool.extend(function() {

    this.add = function(x,y) {
	return this.add_output(ControlPoint.create_at(x,y));
    }

    this.find_closest = function(x,y) {
	var i_best=-1, d_best = Infinity;
	for (var i=0; i<this.outputs.length; i++) {
	    var d = this.outputs[i].distance_to_c(x,y);
	    if (d < d_best) { d_best = d; i_best = i; }
	}
	return [i_best, d_best];
    }

});


var LineTool = BasicTool.extend(function() {

    this.recalculate = function() {
	this.outputs[0].recalculate(this.listen(0), this.listen(1));
    }

    this.create = function(fields) {
	var instance = BasicTool.create.call(this, fields);
	instance.add_output(Line.create());
	return instance;
    }

});


var CircleTool = BasicTool.extend(function() {

    this.recalculate = function() {
	this.outputs[0].recalculate(this.listen(0), this.listen(1));
    }

    this.create = function(fields) {
	var instance = BasicTool.create.call(this, fields);
	instance.add_output(Circle.create());
	return instance;
    }

});


var InterfaceTool = BasicTool.extend(function() {
    
    this.connect = function(src_tool, src_socket, dst_socket) {
	BasicTool.connect.call(this, src_tool, src_socket, dst_socket);
	this.outputs[dst_socket] = this.listen(dst_socket); // equals src_tool.outputs[src_socket] 
	if (this.graphics) this.graphics[dst_socket] = this.outputs[dst_socket].create_graphics();
    }
    
    this.disconnect = function(socket) {
	BasicTool.disconnect.call(this, socket);
	if (this.graphics) { 
	    this.outputs[socket].destroy_graphics(this.graphics[socket]); 
	    this.graphics[socket]=null;
	}
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

    /*
  - abstract tool.recalculate()       - update the outputs and the valid status of the tool  
  - abstract tool.add_graphics(level) - make this tool visible. Level 1 - show outputs, 2 - show everything
  - abstract tool.update_graphics()   - bring graphics up to date
    */

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
	if (lvl==1) {
	    this.output_interface.add_graphics();
	} else {
	    for (var i=0; i<this.tools.length; i++) {
		this.tools[i].add_graphics();
	    }
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
	this.tools.push(tool);
	if (this.graphics_level==2 && !tool.graphics) tool.add_graphics();
    }
        

});
