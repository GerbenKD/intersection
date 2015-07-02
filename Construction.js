"use strict";

var Construction = CompoundTool.extend(function() {
    
    this.typename = "Construction"; // intended for debugging
    
    this.create = function() {
	var instance = CompoundTool.create.call(this); 
	instance.ControlPoints = ControlPointTool.create();
	return instance;
    }
    
    this.redraw = function(svg_object) {
	this.recalculate();
	var set = {};
	this.ControlPoints.build_draw_set(set);
	this.build_draw_set_with_internals(set);
	svg_object.redraw(set);
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

    this.animate = function(from, to, svg_object, continuation) {
	var t = 0, a=0.5;
	requestAnimationFrame(animate);
	var me = this;

	function animate() {
	    t++;
	    var moving = 0;
	    var now = [];
	    for (var i=0; i<from.length; i++) {
		var p0 = from[i], p1 = to[i];
		var X = Point.distance_cc(p0, p1);
		var T = 2*Math.sqrt(0.5*X/a);
		if (t < T) {
		    moving++; // this point is still moving
		    var f = 2*t > T ? 1 - a*(T-t)*(T-t)/X : (a * t * t)/X;
		    now[i] = [ p0[0]*(1-f) + p1[0]*f,
			       p0[1]*(1-f) + p1[1]*f ];
		} else {
		    now[i] = p1;
		}
	    }
	    me.set_positions(now);
	    me.redraw(svg_object);	    
	    if (moving > 0) requestAnimationFrame(animate); else continuation();
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
