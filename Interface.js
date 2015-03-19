"use strict";

var ControlPointTool = BasicTool.extend(function() {

    this.add = function(pos) {
	var socket = this.first_free_output();
	this.create_output(socket);
	this.gizmos[socket].pos = pos;
	return socket;
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




var InterfaceTool = BasicTool.extend(function() {

    this.max_output_socket = function() { return this.ties.length; }

    this.create_output = function() {} // we never own any gizmos, sprites or inputs!

    // connect is actually implemented using a tie
    this.connect = function(left_tool, left_output_socket, right_in_socket) {
	this.tie(left_tool, left_output_socket, right_in_socket);
    }

    this.disconnect = function(right_in_socket) {
	this.untie(right_in_socket);
    }

    this.recalculate = function() { }
});
