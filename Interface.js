"use strict";

var ControlPointTool = BasicTool.extend(function() {

	this.typename = "ControlPointTool"; // intended for debugging

	this.create_controlpoint = function(socket, pos) {
		if (this.gizmos[socket] || this.ties[socket]) {
			console.error("Attempt to add a controlpoint at a used socket"); return;
		}
		this.create_output(socket);
		this.gizmos[socket].pos = pos;
	}

	this.recalculate = function() { }

	this.create_output_gizmo = function(socket) { return ControlPoint.create(); }

	this.find_closest = function(pos) {
		var i_best=-1, d_best = Infinity;
		for (var i=0; i<this.gizmos.length; i++) {
			var d = this.gizmos[i].distance_to_c(pos);
			if (d < d_best) { d_best = d; i_best = i; }
		}
		return [i_best, d_best];
	}

	this.get_state = function() {
		var state = [];
		for (var i=0; i<this.gizmos.length; i++) {
			var gizmo = this.gizmos[i];
			if (gizmo) state[i] = gizmo.dup();
		}
		return state;
	}

	this.restore_state = function(state) {
		for (var i=0; i<state.length; i++) {
			var pos = state[i];
			if (pos) this.gizmos[i].pos = pos;
		}
	}

	this.randomize = function() {
		for (var i=0; i<this.gizmos.length; i++) {
			var gizmo = this.gizmos[i];
			if (gizmo) gizmo.pos = [100*Math.random(), 100*Math.random() ];
		}
	}

});


//TODO bug: get_gizmo reports connected gizmos, while its contract is to return only gizmos owned
//by this tool. This leads to problems in Tool.remove_output.
//Perhaps solution is to override get_output rather than get_gizmo?

var InterfaceTool = BasicTool.extend(function() {

	this.typename = "InterfaceTool"; // intended for debugging

	this.create_output = function() {} // we never own any gizmos
	this.max_output_socket = function() { return this.max_input_socket(); }

	this.get_output = function(socket) { 
		var tie = this.get_tie(socket);
		return tie ? tie[0].get_output(tie[1]) : this.listen(socket);
	}

	this.recalculate = function() {}

});
