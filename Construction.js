"use strict";

var Construction = CompoundTool.extend(function() {
    
    this.typename = "Construction"; // intended for debugging
    
    this.create = function() {
	var instance = CompoundTool.create.call(this); 
	instance.ControlPoints = ControlPointTool.create();
	return instance;
    }
    
    this.redraw = function(renderer, graphics_state) {
	this.recalculate();
	var set = {};
	this.ControlPoints.build_draw_set(set);
	this.build_draw_set_with_internals(set);
	renderer(set, graphics_state);
    }
    
    function add_to_bbox(bbox, pos) {
	if (bbox.length==0) { bbox.push(pos[0],pos[1],0,0); return; }
	if (pos[0] < bbox[0]) bbox[0]=pos[0]; else if (pos[0] > bbox[0]+bbox[2]) bbox[2] = pos[0]-bbox[0];
	if (pos[1] < bbox[1]) bbox[1]=pos[1]; else if (pos[1] > bbox[1]+bbox[3]) bbox[3] = pos[1]-bbox[1];
    }
    
    
    this.change_bounding_box = function(bbox_orig, bbox_new) {
	var cp = this.ControlPoints.get_state();
	for (var i=0; i<cp.length; i++) {
	    if (cp[i]) cp[i] = [(cp[i][0]-bbox_orig[0])/bbox_orig[2] * bbox_new[2] + bbox_new[0],
			        (cp[i][1]-bbox_orig[1])/bbox_orig[3] * bbox_new[3] + bbox_new[1]];
	}
	this.ControlPoints.restore_state(cp);
	this.recalculate();
    }
    
    this.get_positions = function() { return this.ControlPoints.get_state(); }
    this.set_positions = function(where) { this.ControlPoints.restore_state(where); }

    this.get_animation = function(from, to, renderer, graphics_state, bbox0, bbox1, cp_r0, cp_r1) {
	var a = 0.9;
	var me = this;
	var my_gs = {};
	for (var key in graphics_state) {
	    if (graphics_state.hasOwnProperty(key)) my_gs[key] = graphics_state[key];
	}
	var my_from = from.slice(0); my_from.push([bbox0[0], bbox0[1]], [bbox0[0]+bbox0[2], bbox0[1]+bbox0[3]]);
	var my_to   = to.slice(0);   my_to.push  ([bbox1[0], bbox1[1]], [bbox1[0]+bbox1[2], bbox1[1]+bbox1[3]]);

	var dist = [];
	var endtimes = [];
	var total_time = 0;
	for (var i=0; i<my_from.length; i++) {
	    if (!my_from[i]) continue;
	    dist[i] = Point.distance_cc(my_from[i], my_to[i]);
	    var T = 2*Math.sqrt(0.5*dist[i]/a);
	    endtimes[i] = T; 
	    if (T > total_time) total_time = T;
	    
	}

	return function(t) {
	    var moving = 0;
	    var now = [];

	    for (var i=0; i<my_from.length; i++) {
		if (!my_from[i]) continue;

		var p0 = my_from[i], p1 = my_to[i];
		var X = dist[i], T = endtimes[i];
		if (t < T) {
		    moving++; // this point is still moving
		    var f = 2*t > T ? 1 - a*(T-t)*(T-t)/X : (a * t * t)/X;
		    now[i] = [ p0[0]*(1-f) + p1[0]*f,
			       p0[1]*(1-f) + p1[1]*f ];
		} else {
		    now[i] = p1;
		}
	    }

	    var br = now.pop();
	    var tl = now.pop();

	    me.set_positions(now);
	    my_gs.bbox = [tl[0], tl[1], br[0]-tl[0], br[1]-tl[1]];
	    var f = t/total_time;
	    my_gs.cp_radius = cp_r0*(1-f) + cp_r1*f;

	    me.redraw(renderer, my_gs);
	    return moving!=0;
	}
    }

    /*

      embed:
      creates new compoundtools-within-compoundtools
      after embedding, all inputs of the embedded tool are to controlpoints
      destroying a compoundtool should therefore:
      (1) destroy its contents.
      (2) all remaining inputs should be destroyed recursively up to and including their controlpoints
    */

    this.destroy = function(level) {
	var ii = this.id2tool[0];

	// first destroy recursively
	for (var i=this.id2tool.length-1; i>=2; i--) {
	    this.id2tool[i].destroy((level||0)+1);
	}

	// then destroy any remaining controlpoints
	for (var i=0; i<ii.max_input_socket(); i++) {
	    var input = [ii, i];
	    var next = ii.get_input(i);
	    while (next) {
		input[0].disconnect(input[1]);
		input = next;
		next = input[0].get_input(input[1]);
	    }
	    if (input[0]===this.ControlPoints) {
		input[0].remove_output(input[1]);
	    }
	}
    }

    
});
