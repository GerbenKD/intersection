"use strict";


var Stamp = new function() {

    this.STAMP_SCALE = 0.3;

    this.extend = function(constr) { constr.prototype = this; return new constr(); }

    this.create = function(id) {
	return this.extend(function() {
	    this.id = id;
	    this.filename = "file_"+(id+1);
	    this.div_object = Graphics.DIV.create();
	    this.svg_object = Graphics.SVG.create();
	    this.renderer = this.svg_object.create_renderer();
	    this.graphics_state = { scale: this.STAMP_SCALE };
	});
    }

    this.change_layer = function(layer) {
	this.div_object.change_layer(layer);
	this.svg_object.change_layer(layer);
    }

    this.focus   = function() {
	this.change_layer("bottom"); 
	this.graphics_state.suppress_internals = 0;
	change_state.call(this, "activestamp"); 
    }

    this.unfocus = function() { 
	this.change_layer("top");
	if (this.construction.has_outputs()) {
	    change_state.call(this, "toolstamp");
	    this.graphics_state.suppress_internals = 1;
	} else {
	    change_state.call(this, "workstamp");
	    this.graphics_state.suppress_internals = 0;
	}
    }
        
    // state is one of "workstamp", "toolstamp", "activestamp"
    function change_state(state) {
	if (this.graphics_state.state) {
	    this.div_object.remove_class(this.graphics_state.state);
	    this.svg_object.remove_class(this.graphics_state.state);
	}
	this.div_object.add_class(state);
	this.svg_object.add_class(state);
	this.graphics_state.state = state;
    }


    // for the time being, only works on deselected stamps
    // move the stamp to the given position and size, and redisplay contents
    this.reposition = function(nstamps) {
	var stamp_height = Graphics.YS / nstamps;
	var stamp_width  = stamp_height * 3/2;
	
	this.small_bbox = [0, stamp_height*this.id, stamp_width, stamp_height];
	this.div_object.set_bbox(this.small_bbox);
	this.large_bbox = [0, 0, Graphics.XS, Graphics.YS];
	var active = this.graphics_state.state=="activestamp";
	var bbox = active ? this.large_bbox : this.small_bbox;
	this.graphics_state.bbox = bbox;
	this.update_small_positions();
	if (!active) this.small_positions.move();
    }

    this.move = function(screen_bbox, scale) {
	this.graphics_state.bbox = screen_bbox;
	this.graphics_state.scale = scale;
	this.redraw();
    }

    this.redraw = function() {
	this.renderer(this.get_gizmo_set(), this.graphics_state);
    }

    // called just before shrinking the construction. Recalculates the large_positions and small_positions.
    this.update_large_positions = function() {
	this.large_positions = this.construction.get_cp_positions();
    }


    // used when the screen is resized AND when the stamp is deactivated
    this.update_small_positions = function() {
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
	this.small_positions = this.large_positions.scale(oldbb, newbb);
    }


    this.get_gizmo_set = function() {
	return this.construction.get_gizmo_set_with_internals();
    }



    this.animate_enlarge = function() {
	return get_animation(this, this.small_positions.pos, this.large_positions.pos, this.small_bbox, this.large_bbox, this.STAMP_SCALE, 1);
    }

    this.animate_shrink = function() {
	return get_animation(this, this.large_positions.pos, this.small_positions.pos, this.large_bbox, this.small_bbox, 1, this.STAMP_SCALE);
    }

    this.animate_no_zoom = function(from_positions, to_positions, speed) {
	return get_animation(this, from_positions, to_positions, this.large_bbox, this.large_bbox, 1, 1, speed);
    }

    this.get_animation = function(from_bbox, to_bbox, from_positions, to_positions,
				  from_scale, to_scale, speed) {
	return get_animation(this, from_positions.pos, to_positions.pos, from_bbox, to_bbox, from_scale, to_scale, 1);
    }

    function get_animation(stamp, from, to, bbox0, bbox1, scale0, scale1, speed) {
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

	    CPPos.create(stamp.construction, now).move();
	    stamp.graphics_state.bbox = [tl[0], tl[1], br[0]-tl[0], br[1]-tl[1]];

	    var size_now  = Math.sqrt(stamp.graphics_state.bbox[2] * stamp.graphics_state.bbox[3]);
	    
	    if (size_to != size_from) {
		var f = (size_now - size_from)/(size_to - size_from);
		stamp.graphics_state.scale = scale0*(1-f) + scale1*f;
	    }

	    stamp.renderer(stamp.get_gizmo_set(), stamp.graphics_state);
	    return moving!=0;
	}
    }



}();


var LineStamp = Stamp.extend(function() {
    this.create = function(id) {
	var instance = Stamp.create.call(this, id);
	var c = Construction.create();
	var ii = c.id2tool[0];
	instance.construction = c;
	var cp1 = ii.first_free_output(), pos1 = [0.3*Graphics.XS, 0.5*Graphics.YS];
	var cf1 = c.change(["create_controlpoint", cp1, pos1]);
	var cp2 = ii.first_free_output(), pos2 = [0.7*Graphics.XS, 0.5*Graphics.YS];
	var cf2 = c.change(["create_controlpoint", cp2, pos2]);
	var cf3 = c.change(["create_line", cp1, cp2]);
	c.change(["connect_output", cf3, 0, 0]);
	instance.update_large_positions();
	return instance;
    }

});

var CircleStamp = Stamp.extend(function() {

    this.create = function(id) {
	var instance = Stamp.create.call(this, id);
	var c = Construction.create();
	var ii = c.id2tool[0];
	instance.construction = c;
	var cp1 = ii.first_free_output(), pos1 = [0.5*Graphics.XS, 0.5*Graphics.YS];
	var cf1 = c.change(["create_controlpoint", cp1, pos1]);
	var cp2 = ii.first_free_output(), pos2 = [0.7*Graphics.XS, 0.5*Graphics.YS];
	var cf2 = c.change(["create_controlpoint", cp2, pos2]);
	var cf3 = c.change(["create_circle", cp1, cp2]);
	c.change(["connect_output", cf3, 0, 0]);
	instance.update_large_positions();
	return instance;
    }

});



var ConstructionStamp = Stamp.extend(function() { 

    this.create = function(id) {
	var instance = Stamp.create.call(this, id);
	instance.filename = "file_"+(id+1);
	instance.construction = instance.load_construction();
	instance.update_large_positions();
	return instance;
    }
    
    this.load_construction = function() {
	var savestate = Storage.get_file(this.filename);
	var construction = Construction.create();
	if (savestate) construction.initialize(savestate[1]);
	return construction;
    }

}); 
