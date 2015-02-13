/* Gizmos no longer know their relationships to other gizmos,
   so they simply receive the relevant parents on the recalculate call.
   Connections are maintained by the tools.
*/

var Gizmo = new function() {

    this.extend = function(constr) { 
	constr.prototype = this;
	return new constr();
    };

    this.create = function() { return this.extend(function() {}); }

    this.update_sprite = function(sprite) {
	if (this.valid) {
	    this.move_sprite(sprite);
	    if (sprite.hidden()) sprite.show();
	} else {
	    if (!sprite.hidden()) sprite.hide();
	}
    }

}();

var Point = Gizmo.extend(function() {
    this.type = "point";

    this.dup = function() { return [this.pos[0], this.pos[1]]; }

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

    this.move_sprite = function(sprite) { sprite.attrib({ "cx": this.pos[0], "cy": this.pos[1] }); }
});

var ConstructedPoint = Point.extend(function() {

    this.create_sprite = function() { 
	var sprite = Graphics.create("circle", "points");
	sprite.add_class("intersectionpoint");
	sprite.attrib({"r":"5"});
	return sprite;
    }

});

var ControlPoint = Point.extend(function() {

    this.valid = true;

    this.create = function(pos) { return this.extend(function() { this.pos = pos; }); }

    this.create_sprite = function() {
	var sprite = Graphics.create("circle", "controlpoints");
	sprite.add_class("controlpoint");
	sprite.attrib({"r":"10"});
	return sprite;
    }
});


var Line = Gizmo.extend(function() {

    this.type = "line";

    this.create_sprite = function() {
	var sprite = Graphics.create("line", "lines");
	sprite.add_class("line");
	return sprite;
    }

    // computers the intersection of two given lines
    this.compute_intersection_coords = function(x1,y1,x2,y2,x3,y3,x4,y4) {
	var x12 = x1-x2, x34=x3-x4, y12=y1-y2, y34=y3-y4;
	var N = x12*y34 - y12*x34;
	if (Math.abs(N)<0.01) return null; // No intersections for lines that are almost parallel
	var f1 = x1*y2-y1*x2, f2 = x3*y4-y3*x4;
	return [(f1*x34 - x12*f2)/N, (f1*y34 - y12*f2)/N];
    }

    this.compute_intersection = function(line1, line2) {
	return this.compute_intersection_coords(
	    line1.p1[0], line1.p1[1],
	    line1.p2[0], line1.p2[1],
	    line2.p1[0], line2.p1[1],
	    line2.p2[0], line2.p2[1]);
    }

    // returns the coordinates of the projection of (x,y) onto this line
    this.project_coords = function(x,y) {
	var x1 = this.p1[0], y1 = this.p1[1],
	    x2 = this.p2[0], y2 = this.p2[1];
	var bx = x2-x1, by = y2-y1, ax = x - x1, ay = y - y1;
	var b_len = Math.sqrt(bx*bx+by*by);
	if (b_len < SMALL) return null;
	var b_hat_x = bx / b_len, b_hat_y = by / b_len;
	var a_scalar = ax * b_hat_x + ay * b_hat_y;
	return [x1 + b_hat_x * a_scalar, y1 + b_hat_y * a_scalar];
    } 

    this.move_sprite = function(sprite) {
	var exit1 = extend(this.p1, this.p2);
	var exit2 = extend(this.p2, this.p1);

	if (exit1!=null && exit2 != null) {
	    sprite.attrib({ "x1": exit1[0], "y1": exit1[1], "x2": exit2[0], "y2": exit2[1]});
	}

	// If the exits are undefined we can only hope that the old line runs
	// more or less in the right direction, or that the defining points are
	// moved to another position quickly! Also, avoid lines with 
	// parents[0]=parents[1].

	// extends the vector v1 -> v2 to the edge of the screen
	function extend(p1, p2, v) {
	    var x = p1[0], dx = p2[0]-p1[0], y = p1[1], dy = p2[1]-p1[1];
	    if (dx!=0) {
		var ix = dx>0 ? Graphics.XS : 0;
		var iy = y + (ix-x)/dx * dy;
		if (iy>=0 && iy<=Graphics.YS) return [ix, iy];
	    }
	    if (dy!=0) {
		var iy = dy>0 ? Graphics.YS : 0;
		var ix = x+(iy-y)/dy * dx;
		if (ix>=0 && ix<=Graphics.XS) return [ix, iy];
	    }
	    return null;
	}
    }

});

var Circle = Gizmo.extend(function() {
    this.type = "circle";
    
    this.create_sprite = function() {
	var sprite = Graphics.create("circle", "lines");
	sprite.add_class("circle");
	return sprite;
    }

    this.radius = function() {
	return Point.distance_cc(this.center, this.border);
    }

    // Distance between a point and the circle, used for highlighting
    this.distance_c = function(pos) {
	return Math.abs(this.radius() - Point.distance_cc(this.center, pos));
    }

    this.move_sprite = function(sprite) {
	sprite.attrib({"cx": this.center[0], "cy": this.center[1], "r": this.radius()});
    }
});
