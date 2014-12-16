"use strict";

var Gizmo = new function() {

    var classes = {}; // maps classes to classnames

    this.get_class_mask = function(classnames) {
	var mask = 0;
	for (var i=0; i<classnames.length; i++) { mask |= classes[classnames[i]]; }
	return mask;
    }

    this.is_a = function(classname) {
	return this.class_mask & classes[classname];
    }

    this.is_among_mask = function(mask) {
	return this.class_mask & mask;
    }

    this.is_among = function(classnames) {
	return this.is_among_mask(Gizmo.get_class_mask(classnames));
    }

    // Conveniently construct a subclass. All members are given an id.
    this.extend = function() { 
	var class_bit = 1;
	return function(classname, constr) {
	    constr.prototype = this;
	    var derived = new constr();
	    derived.class_mask = this.class_mask | class_bit;
	    derived.type = classname;
	    classes[classname] = class_bit;
	    class_bit += class_bit;
	    return derived;
	}
    }();

    /* Call with an object containing any extra fields the instance should have.
       This object should at least contain a 'parents' field. It creates the following automatically:
       - id
       - parents = [] (unless supplied)
       - children = {}
       It also adds itself as a child to all parents.
    */
    this.instantiate = function() {
	var id = 0;
	return function(initial) {
	    var instance = Object.create(this);
	    for (var key in initial) {
		if (initial.hasOwnProperty(key)) instance[key] = initial[key];
	    }
	    if (!("parents" in instance)) instance.parents = [];
	    instance.id = id++;
	    instance.children = {};
	    for (var i=0; i<instance.parents.length; i++) {
		var parent = instance.parents[i];
		if (parent.hidden) instance.hidden = true;
		parent.children[instance.id]=instance;
	    }
	    return instance;
	}
    }();

    this.create = function(initial) {
	var instance = this.instantiate(initial);
	instance.recalculate_check_valid();
	return instance;
    }

    this.destruct = function() {
	console.error("*** DESTRUCTING "+this.toString()+" ***");
	if (this.svg) { 
	    Graphics.hide(this.group, this.svg);
	    delete this.svg;
	}
	this.id = -1;
	delete this.parents;
	delete this.children;
    }

    this.highlight = function(state) {
	if (!this.svg) this.init_graphics();
	if (state) Graphics.add_class(this.svg, "highlighted");
	else       Graphics.remove_class(this.svg, "highlighted");		
    }

    this.hide = function(state) {
	if (!this.svg) { if (this.init_graphics) this.init_graphics(); else return; }
	if (state) Graphics.add_class(this.svg, "hidden");
	else       Graphics.remove_class(this.svg, "hidden");
	this.hidden = state;
    }

    this.recalculate = function() {}
    this.recalculate_graphics = function() {}
    this.recalculate_check_valid = function() {
	var v = true;
	if (this.parents) {
	    for (var i=0; i<this.parents.length; i++) {
		if (!this.parents[i].valid) { v = false; break; }
	    }
	}
	var old_valid = this.valid || false;
	this.valid = v;
	if (v) this.recalculate();
	if (this.init_graphics) {
	    if (this.valid) {
		if (!this.svg) this.init_graphics();
		this.recalculate_graphics();
		if (!old_valid) Graphics.show(this.group, this.svg);
	    } else {
		if (old_valid) Graphics.hide(this.group, this.svg);
	    }
	}
    }

    //	Start out detached from the DOM tree. Attach upon recalculate_check_valid
    this.svg_create = function(name, clazz) {
	this.svg = Graphics.svg_create(name, clazz);
	if (this.hidden) {
	    Graphics.add_class(this.svg, "hidden");
	    this.svg.style.visibility = "hidden";
	}
    }

    this.svg_attrib = function(attrib) { Graphics.svg_attrib(this.svg, attrib); }

    this.toString = function(indent) {
	var spc = "";
	if (!indent) indent=0;
	for (var i=0; i<indent; i++) { spc+=" "; }
	var r = spc + this.type+"["+this.id+"/"+(this.valid?"+":"-")+"]:\n";
	if ("parents" in this) {
	    for (var i=0; i<this.parents.length; i++) {
		r += this.parents[i].toString(indent+2);
	    }
	} else {
	    r += "<no parents>";
	}
	return r;
    }

    // DEPRECATED!!! This function is wrong!!!!!!!!!!!!!!!!!!!!!!
    // I'll kill you, kill your children and if your parents have no other children, they're dead too
    // actually, this method has a problem: if three lines go through a single point that is defined
    // by two of them, then deleting one of the two lines will remove the intersection point even though
    // it should still be accessible through the other two lines.
    this.destroy = function() {
	var c = []; // this.children should not be modified while iterating over it. So buffer it
	for (var id in this.children) {
	    c.push(this.children[id]);
	}
	if (c.length>0) {
	    this.children = {};
	    for (var i=0; i<c.length; i++) { c[i].destroy(); }
	}
	if (c.length==0 || this.is_among(["ControlPoint", "ToolControlPoint"])) {
	    this.destroy_upstream();
	}
    }

    // destroy me if I have no remaining children, 
    // and if I'm destroyed, check if my parents have more children
    this.destroy_upstream = function() {
	var id = this.id;
	var p = this.parents;
	this.destruct();
	for (var i=0; i<p.length; i++) {
	    if (p[i].id==-1) continue;
	    delete p[i].children[id];
	    if (Object.keys(p[i].children) == 0 && !p[i].is_a("ControlPoint")) {
		p[i].destroy_upstream();
	    }
	}
    }
};

var Point = Gizmo.extend("Point", function() {

    this.group = "points";

    this.distance_cc = function(x1,y1,x2,y2) { 
	var dx = x1-x2, dy = y1-y2;
	return Math.sqrt(dx*dx+dy*dy);
    }

    this.distance_c = function(x, y) {
	return Point.distance_cc(this.x, this.y, x, y);
    }

    // Sorts points by x coordinate. Used by find_duplicates
    this.comparator = function(p1, p2) { return p1.x - p2.x; }

    this.distance = function(p1, p2) {
	return Point.distance_cc(p1.x, p1.y, p2.x, p2.y);
    }

    this.recalculate_graphics = function() {
	if (isNaN(this.x) || isNaN(this.y)) {
	    console.error("Undefined coordinate; I am a "+this.type+" with id="+this.id);
	    console.error(this.toString());
	}
	Graphics.svg_attrib(this.svg, { "cx": this.x, "cy": this.y });
    }
});

var ControlPoint = Point.extend("ControlPoint", function() {

    this.init_graphics = function() {
	this.svg_create("circle", "controlpoint");
	this.svg_attrib({"r": "10"});
    }

    this.set_position = function(x,y) { 
	this.x = x;
	this.y = y; 
    }

    this.toString = function(indent) {
	var spc = "";
	if (indent) for (var i=0; i<indent; i++) { spc+=" "; }
	return spc+this.type+"["+this.id+"]("+this.x+","+this.y+")\n"; 
    }

});

var ToolControlPoint = ControlPoint.extend("ToolControlPoint", function() {

    this.init_graphics = function() {
	this.svg_create("circle", "toolcontrolpoint");
	this.svg_attrib({"r": "10"});
    }
});

var Line = Gizmo.extend("Line", function() {

    this.init_graphics = function() {
	this.group = "lines";
	this.svg_create("line", "line");
    }

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


    // Sorts lines by their x coordinate at y=0. Used by find_duplicates
    this.comparator = function(l1, l2) {
	function x_at_y0(l) {
	    var x0 = l1.parents[0].x, y0 = l1.parents[0].y;
	    var dx = l1.parents[1].x - x0, dy = l1.parents[1].y-y0;
	    if (Math.abs(dy)<SMALL) return Infinity;
	    var steps = -y0/dy;
	    return x0 + steps * dx;
	}
	return x_at_y0(l1) - x_at_y0(l2);
    }

    // returns the distance between parallel lines l1 and l2, or some large number if they
    // are not parallel
    this.distance = function(l1, l2) {
	var x0 = l1.parents[0].x, y0 = l1.parents[0].y;
	var dx = l1.parents[1].x - x0, dy = l1.parents[1].y-y0;
	var d = dx*dx+dy*dy;
	if (d<SMALL) return Infinity;
	var steps = 1000 / d;
	var d1 = l2.distance_c(x0, y0);
	var d2 = l2.distance_c(x0+steps*dx, y0+steps*dy);
	return d1 > d2 ? d1 : d2;
    }

    this.distance_c = function(x,y) {
	var p = this.project_coords(x,y);
	return p ? Point.distance_cc(p[0], p[1], x, y) : Infinity;
    }

    this.compute_intersection = function(line1, line2) {
	return this.compute_intersection_coords(
	    line1.parents[0].x, line1.parents[0].y,
	    line1.parents[1].x, line1.parents[1].y,
	    line2.parents[0].x, line2.parents[0].y,
	    line2.parents[1].x, line2.parents[1].y);
    }

    this.recalculate_graphics = function() {
	var exit1 = extend(this.parents[0], this.parents[1]);
	var exit2 = extend(this.parents[1], this.parents[0]);

	if (exit1!=null && exit2 != null) {
	    Graphics.svg_attrib(this.svg, { "x1": exit1[0], "y1": exit1[1],
					    "x2": exit2[0], "y2": exit2[1]});
	}

	// If the exits are undefined we can only hope that the old line runs
	// more or less in the right direction, or that the defining points are
	// moved to another position quickly! Also, avoid lines with 
	// parents[0]=parents[1].

	// extends the vector v1 -> v2 to the edge of the screen
	function extend(v1, v2, v) {
	    var x = v1.x, dx = v2.x-v1.x, y = v1.y, dy = v2.y-v1.y;
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

var IntersectionPoint = Point.extend("IntersectionPoint", function() {});


var LineLineIntersection = IntersectionPoint.extend("LineLineIntersection", function() {

    this.init_graphics = function() { 
	this.svg_create("circle", "intersectionpoint");
	this.svg_attrib({"r": "5"});
    }

    this.recalculate = function() {
	var line1 = this.parents[0], line2 = this.parents[1];
	var xy = Line.compute_intersection(line1, line2);
	if (xy && isFinite(xy[0]) && isFinite(xy[1])) {
	    this.x = xy[0];
	    this.y = xy[1];
	} else {
	    this.valid = false;
	}
    }

});


var Circle = Gizmo.extend("Circle", function() {

    this.init_graphics = function() {
	this.group = "lines";
	this.svg_create("circle", "circle");
    }

    this.radius = function() {
	return Point.distance(this.parents[0], this.parents[1]); 
    }

    // Sorts circles by the x position of their centre. Used by find_duplicates.
    this.comparator = function(c1, c2) { return c1.parents[0].x - c2.parents[0].x; }

    // The "distance" between two circles makes no sense, but is used to quantify
    // to what extent they are equal. It is the distance between the centres plus the difference
    // in radius.
    this.distance = function(c1, c2) {
	return Point.distance(c1.parents[0], c2.parents[0]) + Math.abs(c1.radius()-c2.radius());
    }

    // Distance between a point and the circle, used for highlighting
    this.distance_c = function(x,y) {
	return Math.abs(this.radius() - this.parents[0].distance_c(x,y));
    }

    this.recalculate_graphics = function() {
	var cx = this.parents[0].x, cy = this.parents[0].y;
	var bx = this.parents[1].x, by = this.parents[1].y;
	var r = Math.sqrt((cx-bx)*(cx-bx)+(cy-by)*(cy-by));
	Graphics.svg_attrib(this.svg, {"cx": cx, "cy": cy, "r": r});
    }
});


var CircleIntersections = Gizmo.extend("CircleIntersections", function() {

    this.num_intersections = function() {
	return this.valid==false ? 0 : this.x.length;
    }

});

var CircleLineIntersections = CircleIntersections.extend("CircleLineIntersections", function() {

    this.recalculate = function() {
	var circle = this.parents[0], line = this.parents[1];
	var cx = circle.parents[0].x, cy = circle.parents[0].y, 
	    bx = circle.parents[1].x, by = circle.parents[1].y;
	var r2 = (cx-bx)*(cx-bx) + (cy-by)*(cy-by);
	var x1 = line.parents[0].x - cx, y1 = line.parents[0].y - cy;
	var x2 = line.parents[1].x - cx, y2 = line.parents[1].y - cy;
	var dx = x2-x1, dy = y2-y1;
	var dr2 = dx*dx+dy*dy;
	var D = x1*y2-x2*y1;
	var R = r2*dr2 - D*D;
	
	// case 1: no intersections
	if (R<=-SMALL || dr2<=SMALL) { this.valid = false; return; }
	D = D/dr2;

	var xs = cx+D*dy;
	var ys = cy-D*dx;

	if (R<SMALL) {
	    // case 2: one intersection. Pretend that R is zero
	    this.x = xs;
	    this.y = ys;
	} else {
	    // case 3: two intersections
	    var sqrtR = Math.sqrt(R)/dr2;
	    var xt = dx*sqrtR, yt = dy*sqrtR;

	    this.x = [xs+xt, xs-xt];
	    this.y = [ys+yt, ys-yt];
	}
    }
});

var CircleCircleIntersections = CircleIntersections.extend("CircleCircleIntersections", function() {

    this.recalculate = function() {
	var centre1 = this.parents[0].parents[0], centre2 = this.parents[1].parents[0];
	var b1 = this.parents[0].parents[1];
	var x1 = centre1.x, y1 = centre1.y;
	var x2 = centre2.x, y2 = centre2.y;
	var r1 = this.parents[0].radius(), r2 = this.parents[1].radius();
	var dx = x2-x1, dy = y2-y1;
	var d2 = dx*dx+dy*dy;

	if (d2<SMALL) {
	    // circles with same centre have no intersections
	    this.valid = false;
	    return;
	}

	var D = ((r1+r2)*(r1+r2)/d2-1) * (1-(r1-r2)*(r1-r2)/d2);

	// case 1: no intersections
	if (D<-SMALL) { this.valid = false; return; }
	
	var dr2 = 0.5*(r1*r1-r2*r2)/d2;
	var xs = 0.5*(x1+x2)+dx*dr2
	var ys = 0.5*(y1+y2)+dy*dr2

	if (D<SMALL) {
	    // case 2: one intersection. Pretend that D is zero
	    this.x = [xs];
	    this.y = [ys];
	} else {
	    // case 3: two intersections
	    var K = 0.5*Math.sqrt(D);
	    var xt =  dy*K;
	    var yt = -dx*K;

	    // get a consistent ordering of the two intersection points
	    if (xt*(b1.x-x1) + yt*(b1.y-y1) > SMALL) {
		xt = -xt; yt = -yt;
	    }

	    this.x = [xs+xt, xs-xt];
	    this.y = [ys+yt, ys-yt];
	}
    }
});


var SingleCircleIntersection = IntersectionPoint.extend("SingleCircleIntersection", function() {

    this.init_graphics = function() { 
	this.svg_create("circle", "intersectionpoint");
	this.svg_attrib({"r": "5"});
    }

    this.recalculate = function() {
	var w = "which" in this ? this.which : 2;
	if (w<this.parents[0].num_intersections()) {
	    this.x = this.parents[0].x[this.which];
	    this.y = this.parents[0].y[this.which];
	} else {
	    this.valid = false;
	}
    }

});
