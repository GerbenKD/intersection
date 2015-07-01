"use strict";

var Stamp = new function() {
	this.extend = function(construct) { construct.prototype = this; return new construct(); }

	this.create = function() { return this.extend(function(){}) };

	this.attach_svg_object = function(svg_object) { 
		this.svg_object = svg_object; 
		svg_object.add_class("stamp");
	}

}

var BasicStamp = Stamp.extend(function() {
	this.redraw = function() { 
		this.svg_object.redraw(this.get_gizmo_set()); 
	}
});

var LineStamp = BasicStamp.extend(function() {

	this.get_gizmo_set = function() {
		if (this.gizmo_set) return this.gizmo_set;
		var width = this.svg_object.width;
		var height = this.svg_object.height;
		var pos1 = [0.2*width, height/2];
		var pos2 = [0.8*width, height/2];
		//var pos1 = [10, 40];
		//var pos2 = [60, 100];
		var cp1 = ControlPoint.create(pos1);
		var cp2 = ControlPoint.create(pos2);
		var line = Line.create();
		cp1.valid = true;
		cp2.valid = true;
		line.valid = true;
		line.p1 = pos1;
		line.p2 = pos2;
		var set = {};
		set[cp1.id] = cp1;
		set[cp2.id] = cp2;
		set[line.id] = line;
		this.gizmo_set = set;
		return set;
	}

});

var CircleStamp = BasicStamp.extend(function() {


	this.get_gizmo_set = function() {
		if (this.gizmo_set) return this.gizmo_set;
		var width = this.svg_object.width;
		var height = this.svg_object.height;
		var min = width<height?width:height;
		var center = [0.5*width, 0.5*height];
		var border = [0.5*width+0.45*min, 0.5*height];
		var cp1 = ControlPoint.create(center);
		var cp2 = ControlPoint.create(border);
		var circle = Circle.create();
		cp1.valid = true;
		cp2.valid = true;
		circle.valid = true;
		circle.center = center;
		circle.border = border;
		var set = {};
		set[cp1.id] = cp1;
		set[cp2.id] = cp2;
		set[circle.id] = circle;
		this.gizmo_set = set;
		return set;
	}
	
});

var ConstructionStamp = Stamp.extend(function() {

	this.attach_construction = function(construction) { 
		this.construction = construction;
		construction.change_bounding_box([0, 0, Graphics.XS, Graphics.YS], [0, 0, this.svg_object.width, this.svg_object.height]);
	}
	
	this.redraw = function() { this.construction.redraw(this.svg_object); }
	
}); 