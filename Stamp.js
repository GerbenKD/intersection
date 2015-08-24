"use strict";


var Stamp = new function() {

    this.extend = function(constr) { constr.prototype = this; return new constr(); }

    this.create = function(id, bbox) {
	return this.extend(function() {
	    this.id = id;
	    this.filename = "file_"+(id+1);
	    this.small_bbox = bbox;
	    this.large_bbox = [0, 0, Graphics.XS, Graphics.YS];
	    this.svg_object = Graphics.SVG.create(bbox);
	    this.svg_object.add_class("stamp");
	    this.svg_object.add_class("deselected");
	    this.renderer = this.svg_object.create_renderer();
	    this.graphics_state = { bbox: bbox, cp_radius: 3 };
	});
    }

    this.get_svg_elt  = function() { return this.svg_object.svg_elt; }

    this.redraw = function() {
	this.renderer(this.get_gizmo_set(), this.graphics_state);
    }

}();


var LineStamp = Stamp.extend(function() {

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

var CircleStamp = Stamp.extend(function() {


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

    this.create = function(id, bbox) {
	var instance = Stamp.create.call(this, id, bbox);
	instance.filename = "file_"+(id+1);
	instance.construction = instance.load_construction();
	instance.update_cp_positions();
	instance.construction.set_positions(instance.small_positions);
	return instance;
    }

    this.set_bbox = function(bbox) {
	var bbox_cur = this.graphics_state.bbox;
	var new_cp = this.construction.get_scaled_positions([0,0,bbox_cur[2],bbox_cur[3]], [0,0,bbox[2],bbox[3]]);
	this.construction.set_positions(new_cp);
	this.graphics_state.bbox = bbox;
	this.renderer(this.get_gizmo_set(), this.graphics_state);
    }

    this.load_construction = function() {
	var savestate = Storage.get_file(this.filename);
	var construction = Construction.create();
	if (savestate) construction.initialize(savestate[1]);
	return construction;
    }

    this.get_construction = function() { return this.construction; }

    // called just before shrinking the construction. Recalculates the large_positions and small_positions.
    this.update_cp_positions = function() {
	this.large_positions = this.construction.get_positions();
	// calculate new positions of the controlpoints
	var oldbb = this.large_bbox;
	var newbb = [0,0,this.small_bbox[2],this.small_bbox[3]];
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
	this.small_positions = this.construction.get_scaled_positions(oldbb, newbb);
    }

    this.animate_enlarge = function() {
	return get_animation(this, this.small_positions, this.large_positions, this.small_bbox, this.large_bbox, 3, 8);
    }

    this.animate_shrink = function() {
	return get_animation(this, this.large_positions, this.small_positions, this.large_bbox, this.small_bbox, 8, 3);
    }

    this.animate_no_zoom = function(from_positions, to_positions, speed) {
	return get_animation(this, from_positions, to_positions, this.large_bbox, this.large_bbox, 8, 8, speed);
    }


    this.get_gizmo_set = function() {
	return this.construction.get_gizmo_set(); 
    }

    function get_animation(stamp, from, to, bbox0, bbox1, cp_r0, cp_r1, speed) {
	var a = 0.9;

	var my_from = from.slice(0); my_from.push([bbox0[0], bbox0[1]], [bbox0[0]+bbox0[2], bbox0[1]+bbox0[3]]);
	var my_to   = to.slice(0);   my_to.push  ([bbox1[0], bbox1[1]], [bbox1[0]+bbox1[2], bbox1[1]+bbox1[3]]);
	var dist = [];
	var endtimes = [];
	// var total_time = 0;
	for (var i=0; i<my_from.length; i++) {
	    if (!my_from[i]) continue;
	    dist[i] = Point.distance_cc(my_from[i], my_to[i]);
	    var T = 2*Math.sqrt(0.5*dist[i]/a);
	    endtimes[i] = T; 
	    // if (T > total_time) total_time = T;
	}
	var size_from = Math.sqrt(bbox0[2]*bbox0[3]);
	var size_to   = Math.sqrt(bbox1[2]*bbox1[3]);

	return function(t) {
	    var moving = 0;
	    var now = [];

	    for (var i=0; i<my_from.length; i++) {
		if (!my_from[i]) continue;

		var p0 = my_from[i], p1 = my_to[i];
		var X = dist[i], T = endtimes[i];
		if (t < T) {
		    moving++; // this point is still moving
		    var f = 2*t < T ? (a * t * t)/X : 1 - a*(T-t)*(T-t)/X;
		    now[i] = [ p0[0]*(1-f) + p1[0]*f,
			       p0[1]*(1-f) + p1[1]*f ];
		} else {
		    now[i] = p1;
		}
	    }

	    var br = now.pop();
	    var tl = now.pop();

	    stamp.construction.set_positions(now);
	    stamp.graphics_state.bbox = [tl[0], tl[1], br[0]-tl[0], br[1]-tl[1]];

	    var size_now  = Math.sqrt(stamp.graphics_state.bbox[2] * stamp.graphics_state.bbox[3]);
	    
	    if (size_to != size_from) {
		var f = (size_now - size_from)/(size_to - size_from);
		stamp.graphics_state.cp_radius = cp_r0*(1-f) + cp_r1*f;
	    }

	    stamp.renderer(stamp.get_gizmo_set(), stamp.graphics_state);
	    return moving!=0;
	}
    }

}); 
