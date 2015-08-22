"use strict";

var Construction = CompoundTool.extend(function() {
    
    this.typename = "Construction"; // intended for debugging
    
    this.create = function() {
	var instance = CompoundTool.create.call(this); 
	instance.ControlPoints = ControlPointTool.create();
	return instance;
    }
    
    this.get_gizmo_set = function() {
	this.recalculate();
	var set = {};
	this.ControlPoints.build_draw_set(set);
	this.build_draw_set_with_internals(set);
	return set;
    }
    
    this.get_scaled_positions = function(bbox_orig, bbox_new) {
	var cp = this.get_positions();
	for (var i=0; i<cp.length; i++) {
	    if (cp[i]) cp[i] = [(cp[i][0]-bbox_orig[0])/bbox_orig[2] * bbox_new[2] + bbox_new[0],
			        (cp[i][1]-bbox_orig[1])/bbox_orig[3] * bbox_new[3] + bbox_new[1]];
	}
	return cp;
    }
    
    this.get_positions = function() {
	// return this.ControlPoints.get_state(); 
	var ii = this.id2tool[0];
	var state = [];
	for (var i=0; i<this.max_input_socket(); i++) {
	    var gizmo = ii.listen(i);
	    state.push(gizmo ? gizmo.dup() : undefined);
	}
	return state;
    }

    this.set_positions = function(state) {
	// this.ControlPoints.restore_state(where); 
	var ii = this.id2tool[0];
	for (var i=0; i<state.length; i++) {
	    if (state[i]) ii.listen(i).pos = state[i];
	}
    }

    
});
