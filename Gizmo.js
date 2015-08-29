/* Gizmos no longer know their relationships to other gizmos,
   so they simply receive the relevant parents on the recalculate call.
   Connections are maintained by the tools.
*/


var Gizmo = new function() {

    this.extend = function() {
	var id = 0;
	return function(constr) { 
	    constr.prototype = this;
	    var instance = new constr();
	    instance.id = id++;
	    return instance;
	};
    }();

    this.create = function() {
	var instance = this.extend(function() {
	    this.classes = {};
	}); 
	return instance;
    }

    this.remove_sprite = function() {
	if (this.sprite) delete this.sprite;
    }

    this.draw = function(graphics_state) {	
	if (!this.sprite) {
	    this.create_sprite(graphics_state);
	    for (var cls in this.classes) {
		if (this.classes[cls]) this.sprite.add_class(cls);
	    }
	}
	this.set_class("hidden", !this.valid);
	if (this.valid) this.move_sprite(graphics_state);
    }

    this.has_class = function(cls) { return this.classes[cls]; }

    this.set_class = function(cls, value) {
	if (this.classes[cls] ^ value) {
	    this.classes[cls] = value;
	    if (this.sprite) {
		if (value) this.sprite.add_class(cls); else this.sprite.remove_class(cls);
	    }
	}
    }

}();

var Point = Gizmo.extend(function() {
    this.type = "point";

    this.dup = function() { return [this.pos[0], this.pos[1]]; }

    this.equals = function(gizmo) { 
	if (!this.valid && !gizmo.valid) {
	    console.error("Attempt to compare two invalid gizmos!");
	    return false; // don't use this value!
	}
	return gizmo.type=="point" && 
	    this.valid && gizmo.valid &&
	    (Point.distance_cc(this.pos, gizmo.pos) < SMALL);
    }

    this.distance_cc = function(pos1, pos2) { 
	var dx = pos1[0]-pos2[0], dy = pos1[1]-pos2[1];
	return Math.sqrt(dx*dx+dy*dy);
    }

    this.distance_pp = function(p1, p2) {
	return Point.distance_cc(p1.pos, p2.pos);
    }

    this.distance_to_c = function(pos) {
	return Point.distance_cc(this.pos, pos);
    }

  
});


var ConstructedPoint = Point.extend(function() {

    this.create_sprite = function() { 
	var sprite = Graphics.create_sprite("circle", "points");
	sprite.add_class("intersectionpoint");
	this.sprite = sprite;
    }

    this.move_sprite = function(graphics_state) { 
	var r = Graphics.SCALE * 0.003 * graphics_state.scale;
	var f = graphics_state.suppress_internals;
	if (f==undefined) f=1;
	if (!this.has_class("output")) r *= 1-f;
	this.sprite.attrib({ "cx": this.pos[0], "cy": this.pos[1], "r": r }); 
	this.sprite.sprite_elt.style["stroke-width"] = r/3;
    }

});

var ControlPoint = Point.extend(function() {
    this.valid = true;
    this.controlpoint = true;

    this.create = function(pos) {
	var instance = Point.create.call(this);
	instance.pos = pos;
	return instance;
    }

    this.create_sprite = function(graphics_state) {
	var sprite = Graphics.create_sprite("circle", "controlpoints");
	sprite.add_class("controlpoint");
	this.sprite = sprite;
    }

    this.move_sprite = function(graphics_state) {
	var r = Graphics.SCALE * graphics_state.scale;
	this.sprite.attrib({ "cx": this.pos[0], "cy": this.pos[1], "r": 0.006*r }); 
	this.sprite.sprite_elt.style["stroke-width"] = 0.001*r;
    }

});


var Line = Gizmo.extend(function() {

    this.type = "line";

    this.create_sprite = function() {
	var sprite = Graphics.create_sprite("line", "lines");
	sprite.add_class("line");
	this.sprite = sprite;
    }

    // computers the intersection of two given lines
    this.compute_intersection_coords = function(x1,y1,x2,y2,x3,y3,x4,y4) {
	var x12 = x1-x2, x34=x3-x4, y12=y1-y2, y34=y3-y4;
	var N = x12*y34 - y12*x34;
	if (Math.abs(N)<0.01) return null; // No intersections for lines that are almost parallel
	var f1 = x1*y2-y1*x2, f2 = x3*y4-y3*x4;
	return [(f1*x34 - x12*f2)/N, (f1*y34 - y12*f2)/N, N>0 ? 1 : -1];
    }

    this.compute_intersection = function(line1, line2) {
	return this.compute_intersection_coords(
	    line1.p1[0], line1.p1[1],
	    line1.p2[0], line1.p2[1],
	    line2.p1[0], line2.p1[1],
	    line2.p2[0], line2.p2[1]);
    }

    // returns the coordinates of the projection of (x,y) onto this line
    this.project_coords = function(pos) {
	var x1 = this.p1[0], y1 = this.p1[1],
	    x2 = this.p2[0], y2 = this.p2[1];
	var bx = x2-x1, by = y2-y1, ax = pos[0] - x1, ay = pos[1] - y1;
	var b_len = Math.sqrt(bx*bx+by*by);
	if (b_len < SMALL) return null;
	var b_hat_x = bx / b_len, b_hat_y = by / b_len;
	var a_scalar = ax * b_hat_x + ay * b_hat_y;
	return [x1 + b_hat_x * a_scalar, y1 + b_hat_y * a_scalar];
    } 

    this.distance_to_c = function(pos) {
	var p = this.project_coords(pos);
	return p ? Point.distance_cc(p, pos) : Infinity;
    }

    // output: suppress    0 => 0.003, 1 -> 0.001   
    // nonoutput: suppress 0 => 0.001, 1 -> 0
    this.move_sprite = function(graphics_state) {
	var r = Graphics.SCALE * 0.001 * graphics_state.scale;
	var f = graphics_state.suppress_internals;
	var sprite = this.sprite;
	if (f==undefined) f=1;
	r *= this.has_class("output") ? 3-2*f : 1-f; // TODO: use greyscales rather than line thickness to make it vanish
	var bbox;
	{ var bb = graphics_state.bbox;
	  bbox = [bb[0]-2*r, bb[1]-2*r, bb[2]+4*r, bb[3]+4*r];
	}
	
	var exit1 = extend(this.p1, this.p2);
	var exit2 = extend(this.p2, this.p1);

	if (exit1!=undefined && exit2 != undefined) {
	    sprite.attrib({ "x1": exit1[0], "y1": exit1[1], "x2": exit2[0], "y2": exit2[1]});
	    sprite.sprite_elt.style["stroke-width"] = r;
	}
	

	// If the exits are undefined we can only hope that the old line runs
	// more or less in the right direction, or that the defining points are
	// moved to another position quickly! Also, avoid lines with 
	// parents[0]=parents[1].

	// extends the vector v1 -> v2 to the edge of the screen
	function extend(p1, p2) {
	    var x = p1[0], dx = p2[0]-p1[0], y = p1[1], dy = p2[1]-p1[1];
	    if (dx!=0) {
		var ix = dx>0 ? bbox[2] : 0;
		var iy = y + (ix-x)/dx * dy;
		if (iy>=0 && iy<=bbox[3]) return [ix, iy];
	    }
	    if (dy!=0) {
		var iy = dy>0 ? bbox[3] : 0;
		var ix = x+(iy-y)/dy * dx;
		if (ix>0 && ix<=bbox[2]) return [ix, iy];
	    }
	    return undefined;
	}
    }

});

var Circle = Gizmo.extend(function() {
    this.type = "circle";

    this.create_sprite = function() {
	var sprite = Graphics.create_sprite("circle", "lines");
	sprite.add_class("circle");
	this.sprite = sprite;
    }

    this.radius = function() {
	return Point.distance_cc(this.center, this.border);
    }

    // Distance between a point and the circle, used for highlighting
    this.distance_to_c = function(pos) {
	return Math.abs(this.radius() - Point.distance_cc(this.center, pos));
    }

    this.move_sprite = function(graphics_state) {
	var r = Graphics.SCALE * 0.001 * graphics_state.scale;
	var f = graphics_state.suppress_internals;
	if (f==undefined) f=1;
	r *= this.has_class("output") ? (3-2*f) : 1-f;
	this.sprite.attrib({"cx": this.center[0], "cy": this.center[1], "r": this.radius()});
	this.sprite.sprite_elt.style["stroke-width"] = r;
    }
});
