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

    this.distance_cc = function(x1,y1,x2,y2) { 
	var dx = x1-x2, dy = y1-y2;
	return Math.sqrt(dx*dx+dy*dy);
    }

    this.distance_pp = function(p1, p2) {
	return Point.distance_cc(p1.x, p1.y, p2.x, p2.y);
    }

    this.distance_to_c = function(x, y) {
	return Point.distance_cc(this.x, this.y, x, y);
    }

    // Sorts points by x coordinate. Used by find_duplicates
    this.comparator = function(p1, p2) { return p1.x - p2.x; }

    this.move_sprite = function(sprite) { sprite.attrib({ "cx": this.x, "cy": this.y }); }
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

    this.create_at = function(x,y) { return this.extend(function() { this.x = x; this.y = y; }); }

    this.create_sprite = function() {
	var sprite = Graphics.create("circle", "controlpoints");
	sprite.add_class("controlpoint");
	sprite.attrib({"r":"10"});
	return sprite;
    }
});


var Line = Gizmo.extend(function() {

    this.type = "line";

    this.recalculate = function(point1, point2) {
	this.valid = point1.valid && point2.valid;
	if (this.valid) {
	    this.p1 = [point1.x, point1.y];
	    this.p2 = [point2.x, point2.y];
	}
    }

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

    // returns the coordinates of the projection of (x,y) onto this line
    this.project_coords = function(x,y) {
	var x1 = this.parents[0].x, y1 = this.parents[0].y,
	    x2 = this.parents[1].x, y2 = this.parents[1].y;
	var bx = x2-x1, by = y2-y1, ax = x - x1, ay = y - y1;
	var b_len = Math.sqrt(bx*bx+by*by);
	if (b_len < SMALL) return null;
	var b_hat_x = bx / b_len, b_hat_y = by / b_len;
	var a_scalar = ax * b_hat_x + ay * b_hat_y;
	return [x1 + b_hat_x * a_scalar, y1 + b_hat_y * a_scalar];
    } 

    this.compute_intersection = function(line1, line2) {
	return this.compute_intersection_coords(
	    line1.p1.x, line1.p1.y,
	    line1.p2.x, line1.p2.y,
	    line2.p1.x, line2.p1.y,
	    line2.p2.x, line2.p2.y);
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
		var ix = x+(iy-y)/dy * dx
		if (ix>=0 && ix<=Graphics.XS) return [ix, iy];
	    }
	    return null;
	}
    }

});

var Circle = Gizmo.extend(function() {
    this.type = "circle";
    
    this.recalculate = function(center, border) {
	this.valid = center.valid && border.valid;
	if (this.valid) {
	    this.center = [center.x, center.y];
	    this.border = [border.x, border.y];
	}
    }

    this.create_sprite = function() {
	var sprite = Graphics.create("circle", "lines");
	sprite.add_class("circle");
	return sprite;
    }

    this.radius = function() {
	return Point.distance_cc(this.center[0], this.center[1], this.border[0], this.border[1]); 
    }

    // Distance between a point and the circle, used for highlighting
    this.distance_c = function(x,y) {
	return Math.abs(this.radius() - Point.distance_cc(this.center[0], this.center[1], x, y));
    }

    this.move_sprite = function(sprite) {
	var r = this.radius(); 
	sprite.attrib({"cx": this.center[0], "cy": this.center[1], "r": r});
    }
});
