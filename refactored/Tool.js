/*

A socket is the number of an input or output in the inputs or outputs array.

Tool fields:
- tool.id        - for serialization and to use as key in hash
- tool.visible   - whether the outputs (and possibly even internals) of this tool are supposed to be visible
- tool.inputs    - [ [src_tool, src_socket], ... ]
- tool.outputs   - [ gizmo, ... ]
- tool.listeners - { src_socket+">"+dst_tool.id+":"+dst_socket => [src_socket, dst_tool, dst_socket], ...}

- tool.recalculate()     - update the outputs and the valid status of the tool
- tool.update_graphics() - ensure the graphics of all visible gizmos owned by this tool are up to date
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
		var connection = this.inputs[socket];
		return connection[0].outputs[connection[1]];
	}

	this.connected = function() { return this.num_connections>0; }

	this.connect = function(src_tool, src_socket, dst_socket) {
		// rudimentary sanity check
		if (this.inputs[dst_socket]) {
			console.error("Disconnect socket "+dst_socket+" first"); return;
		}
		this.inputs[dst_socket] = [src_tool, src_socket];
		var key = src_socket+">"+this.id+":"+dst_socket;
		src_tool.listeners[key] = [src_socket, this, dst_socket];
		this.num_connections++;
	}

	this.disconnect_input = function(socket) {
		var connection = this.inputs[socket];
		this.inputs[socket] = null;
		var src_tool = connection[0], src_socket = connection[1];
		var key = src_socket+">"+this.id+":"+socket;
		delete src_tool.listeners[key];
		//while (this.inputs[this.inputs.length-1]==null) { this.inputs.pop(); }
		this.num_connections--;
	}

	// normally, for visible tools the outputs should be updated
	this.update_graphics = function() {
		if (!this.visible) return;
		for (var i=0; i<this.outputs.length; i++) {
			var output = this.outputs[i];
			if (output) output.update_graphics();
		}
	}

	this.create = function(fields) {
		return this.extend(function() {
			this.inputs = [];
			this.outputs = [];
			this.listeners = {};
			this.num_connections = 0;
			for (var key in fields) { this[key] = fields[key]; }
		});
	}


};

var ControlPointTool = Tool.extend(function() {

	this.add = function(x,y) {
		var cp = ControlPoint.create(x,y);
		cp.create_graphics(this.is_tool);
		var socket;
		for (socket = 0; socket < this.outputs.length; socket++) {
			if (this.outputs[socket] == null) {
				break;
			}
		}
		this.outputs[socket] = cp;
		return socket;
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


var LineTool = Tool.extend(function() {

	this.recalculate = function() {
		this.outputs[0].recalculate(this.listen(0), this.listen(1));
	}

	this.create = function(fields) {
		var line = Line.create();
		if (fields.visible) line.create_graphics();
		var instance = Tool.create.call(this, fields);
		instance.outputs = [ line ];
		return instance;
	}

});


var CircleTool = Tool.extend(function() {

	this.recalculate = function() {
		this.outputs[0].recalculate(this.listen(0), this.listen(1));
	}

	this.create = function(fields) {
		var circle = Circle.create();
		if (fields.visible) circle.create_graphics();
		var instance = Tool.create.call(this, fields);
		instance.outputs = [ circle ];
		return instance;
	}

});


var InterfaceTool = Tool.extend(function() {
	
	this.connect = function(src_tool, src_socket, dst_socket) {
		Tool.connect.call(this, src_tool, src_socket, dst_socket);
		this.outputs[dst_socket] = this.listen(dst_socket); // equals src_tool.outputs[src_socket] 
	}
	
	this.disconnect_input = function(socket) {
		Tool.disconnect_input.call(this, socket);
		this.outputs[socket] = null;
	}
	
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
		var instance = Tool.create.call(this, fields);
		instance.input_interface  = InterfaceTool.create();
		instance.output_interface = InterfaceTool.create();
		instance.tools = [];
		return instance;
	}
	
	this.add = function(tool) {
		this.tools.push(tool);
	}
	
	// this.visible_internals does what you think
	
	this.recalculate = function() {
		this.input_interface.recalculate();
		for (var i = 0; i < this.tools.length; i++) {
			this.tools[i].recalculate();
		}
		this.output_interface.recalculate();
	}
	
	this.update_graphics = function() {
		if (this.visible_internals) {
			
		} else {
			Tool.update_graphics.call(this);
		}
	}
	
	
});
