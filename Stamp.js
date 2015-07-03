"use strict";

var Stamp = new function() {
    this.extend = function(construct) { construct.prototype = this; return new construct(); }

    this.create = function(stamp_id, mouse_handler) {
	return this.extend(function() { 
	    this.stamp_id = stamp_id;
	    this.mouse_handler = mouse_handler;
	});
	
    };

    this.attach_svg_object = function(svg_object) { 
	this.svg_object = svg_object;
	this.renderer = svg_object.create_renderer();
	svg_object.add_class("stamp");
	var me = this;
	svg_object.svg_elt.onclick = function() { me.mouse_handler(me.stamp_id); }
    }

}

var BasicStamp = Stamp.extend(function() {
    this.redraw = function() { 
	var bbox = this.svg_object.bbox;
	this.renderer(this.get_gizmo_set(), { bbox: [0,0,bbox[2],bbox[3]],
					      cp_radius: 3}); 
    }
});

var LineStamp = BasicStamp.extend(function() {

    this.get_gizmo_set = function() {
	if (this.gizmo_set) return this.gizmo_set;
	var width = this.svg_object.bbox[2];
	var height = this.svg_object.bbox[3];
	var pos1 = [0.2*width, height/2];
	var pos2 = [0.8*width, height/2];
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
	var width = this.svg_object.bbox[2];
	var height = this.svg_object.bbox[3];
	var min = width<height?width:height;
	var center = [0.5*width, 0.5*height];
	var border = [0.5*width+0.4*min, 0.5*height];
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

    this.attach_file = function(filename) {
	this.filename = filename;
    }

    this.redraw = function() {
	var savestate = Storage.get_file(this.filename);
	if (!savestate) { this.renderer(); return; }
	var construction = Construction.create();
	construction.initialize(savestate[1]);
	this.construction = construction;

	this.pos_screen = construction.get_positions();
	// change bounding box
	var oldbb = [0,0,Graphics.XS, Graphics.YS];
	var newbb = [0,0,this.svg_object.bbox[2], this.svg_object.bbox[3]];
	if (newbb[2]*oldbb[3] > oldbb[2]*newbb[3]) {
	    // old bb is taller than new (should become pillar)
	    var newwidth = oldbb[2] * (newbb[3]/oldbb[3]);
	    newbb[0] = (newbb[2]-newwidth)/2;
	    newbb[2] = newwidth;
	} else {
	    // old bb is wider than new (should become letterbox)
	    var newheight = oldbb[3] * (newbb[2]/oldbb[2]);
	    newbb[1] = (newbb[3]-newheight)/2;
	    newbb[3] = newheight;
	}
	construction.change_bounding_box(oldbb, newbb);
	this.pos_stamp = construction.get_positions();
	for (var i=0; i<this.pos_stamp.length; i++) {
	    if (this.pos_stamp[i]) {
		this.pos_stamp[i][0] += this.svg_object.bbox[0];
		this.pos_stamp[i][1] += this.svg_object.bbox[1];
	    }
	}
	var bbox = this.svg_object.bbox;
	construction.redraw(this.renderer, { bbox: [0,0,bbox[2],bbox[3]],
					   cp_radius: 3}); 
    }
}); 
