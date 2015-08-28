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
	this.build_draw_set(set);
	return set;
    }

    this.get_gizmo_set_with_internals = function() {
	this.recalculate();
	var set = {};
	this.ControlPoints.build_draw_set(set);
	this.build_draw_set_with_internals(set);
	return set;
    }
        
});
