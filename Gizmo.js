"use strict";

var Gizmo = new function() {

    this.valid = false;

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
       It also adds itself as a child to all parents, and recalculates its position.
    */
    this.create = function() {
	var id = 0;
	return function(initial) {
	    this.init.prototype = this;
	    var instance = new this.init();
	    for (var key in initial) {
		instance[key] = initial[key];
	    }
	    if (!("parents" in instance)) instance.parents = [];
	    instance.id = id++;
	    instance.children = {};
	    for (var i=0; i<instance.parents.length; i++) {
		var parent = instance.parents[i];
		parent.children[instance.id]=instance;
	    }
	    instance.recalculate_check_valid();
	    return instance;
	}
    }();

    this.remove_svg = function() {
	if (this.svg) { 
	    this.hide();
	    delete this.svg;
	}
    }

    this.highlight = function(state) {
	if (this.svg) {
	    if (state) Graphics.add_class(this.svg, "highlighted");
	    else       Graphics.remove_class(this.svg, "highlighted");		
	}
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
	var old_valid = this.valid;
	this.valid = v;
	if (v) this.recalculate();
	// change visibility if validity changed
	if (this.svg) {
	    if (this.valid) {
		this.recalculate_graphics();
		if (!old_valid) this.show();
	    } else {
		if (old_valid) this.hide();
	    }
	}

    }

    //	Start out hidden. Show upon recalculate_check_valid
    this.svg_create = function(group, name, clazz) {
	this.group = group;
	this.svg = Graphics.svg_create(name, clazz);
    }

    this.svg_attrib = function(attrib) { Graphics.svg_attrib(this.svg, attrib); }

    this.hide = function() { Graphics.hide(this.group, this.svg); }
    this.show = function() { Graphics.show(this.group, this.svg); }

    this.toString = function(indent) {
	var spc = "";
	if (!indent) indent=0;
	for (var i=0; i<indent; i++) { spc+=" "; }
	var r = spc + this.type+"["+this.id+"/"+(this.valid?"+":"-")+"]:\n";
	for (var i=0; i<this.parents.length; i++) {
	    r += this.parents[i].toString(indent+2);
	}
	return r;
    }

    // I'll kill you, kill your children and if your parents have no other children, they're dead too
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
	this.remove_svg();
	var id = this.id;      this.id = -1;
	var p  = this.parents; this.parents = [];
	for (var i=0; i<p.length; i++) {
	    delete p[i].children[id];
	    if (Object.keys(p[i].children) == 0 && !p[i].is_a("ControlPoint")) {
		p[i].destroy_upstream();
	    }
	}
    }
}

var Point = Gizmo.extend("Point", function() {

    this.distance = function(x1,y1,x2,y2) { 
	var dx = x1-x2, dy = y1-y2;
	return Math.sqrt(dx*dx+dy*dy);
    }

    this.distance_to_point = function(other) {
	return Point.distance(this.x, this.y, other.x, other.y);
    }

    this.distance_to_coords = function(x, y) {
	return Point.distance(this.x, this.y, x, y);
    }

    this.recalculate_graphics = function() {
	Graphics.svg_attrib(this.svg, { "cx": this.x, "cy": this.y });
    }
});

var ControlPoint = Point.extend("ControlPoint", function() {

    this.valid = true;

    this.init = function() {
	this.svg_create(Graphics.G_POINTS, "circle", "controlpoint");
	this.svg_attrib({"r": "10"});
	this.show();
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
    this.init = function() {
	this.svg_create(Graphics.G_POINTS, "circle", "toolcontrolpoint");
	this.svg_attrib({"r": "10"});
	this.show();
    }
});

var Line = Gizmo.extend("Line", function() {

    this.init = function() {
	this.svg_create(Graphics.G_LINES, "line", "line");
    }

    this.compute_intersection_coords = function(x1,y1,x2,y2,x3,y3,x4,y4) {
	var x12 = x1-x2, x34=x3-x4, y12=y1-y2, y34=y3-y4;
	var N = x12*y34 - y12*x34;
	if (Math.abs(N)<SMALL) return null;
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

    this.distance_to_coords = function(x,y) {
	var p = this.project_coords(x,y);
	return p ? Point.distance(p[0], p[1], x, y) : Infinity;
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

var IntersectionPoint = Point.extend("IntersectionPoint", function() {

    this.find_duplicates = function() {
	// find number of control points and back up their coordinates
	var cp = [];
	for (var i=0; i<Gizmo.INSTANCE_LIST.length; i++) {
	    var obj = Gizmo.INSTANCE_LIST[i];
	    if (!obj.set_position) break; // TODO check if it has ControlPoint class
	    cp.push([obj.x, obj.y]);
	}

	// find all points that might match me. Note control points may also match!
	var candidates = [];
	for (var i=0; i<Gizmo.INSTANCE_LIST.length; i++) {
	    var obj = Gizmo.INSTANCE_LIST[i];
	    if (obj===this) continue; // obviously I match myself
	    if (this.valid != obj.valid) continue;
	    if (this.distance_to_point(obj) < SMALL) candidates.push(obj);
	}

	for (var test=0; test<5 && candidates.length>0; test++) {
	    // randomize control points
	    for (var i=0; i<cp.length; i++) {
		var cpo = Gizmo.INSTANCE_LIST[i];
		var dx = Math.random()*100-50, dy = Math.random()*100-50;
		cpo.set_position(cp[i][0]+dx, cp[i][1]+dy);
	    }
	    Gizmo.update();

	    // filter candidates
	    var new_candidates = [];
	    for (var i=0; i<candidates.length; i++) {
		var obj = candidates[i];
		if (this.valid==obj.valid && this.distance_to_point(obj)<SMALL) {
		    new_candidates.push(obj);
		}
	    }
	    candidates = new_candidates;
	}

	// repair control points
	for (var i=0; i<cp.length; i++) {
	    Gizmo.INSTANCE_LIST[i].set_position(cp[i][0], cp[i][1]);
	}
	Gizmo.update();
	return candidates;
    }


});


var LineLineIntersection = IntersectionPoint.extend("LineLineIntersection", function() {

    this.init = function() { 
	this.svg_create(Graphics.G_POINTS, "circle", "intersectionpoint");
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

    this.init = function() {
	this.svg_create(Graphics.G_LINES, "circle", "circle");
    }

    this.centre = function() { return this.parents[0]; }
    this.radius2 = function() { 
	var c = this.parents[0], b = this.parents[1];
	var dx = c.x-b.x, dy = c.y-b.y;
	return dx*dx+dy*dy;
    }
    this.radius = function() {
	return this.parents[0].distance_to_point(this.parents[1]); 
    }

    this.distance_to_coords = function(x,y) {
	var d = this.parents[0].distance_to_coords(x,y);
	return Math.abs(this.radius() - d);
    }

    this.recalculate_graphics = function() {
	var cx = this.parents[0].x, cy = this.parents[0].y;
	var bx = this.parents[1].x, by = this.parents[1].y;
	var r = Math.sqrt((cx-bx)*(cx-bx)+(cy-by)*(cy-by));
	Graphics.svg_attrib(this.svg, {"cx": cx, "cy": cy, "r": r});
    }
});

var CircleLineIntersections = Gizmo.extend("CircleLineIntersections", function() {

    this.init = function() {}

    this.recalculate = function() {
	var circle = this.parents[0], line = this.parents[1];
	var cx = circle.centre().x, cy = circle.centre().y, 
	    r2 = circle.radius2();
	var x1 = line.parents[0].x - cx, y1 = line.parents[0].y - cy;
	var x2 = line.parents[1].x - cx, y2 = line.parents[1].y - cy;
	var dx = x2-x1, dy = y2-y1;
	var dr2 = dx*dx+dy*dy;
	var D = x1*y2-x2*y1;
	var R = r2*dr2 - D*D;
	if (R<=SMALL || dr2<=SMALL) { this.valid = false; return; }
	var sqrtR = Math.sqrt(R)/dr2;
	D = D/dr2;
	this.x = [cx+D*dy+dx*sqrtR, cx+D*dy-dx*sqrtR];
	this.y = [cy-D*dx+dy*sqrtR, cy-D*dx-dy*sqrtR];
	if (!(isFinite(this.x[0]) && isFinite(this.y[0]) &&
	      isFinite(this.x[1]) && isFinite(this.y[1]))) this.valid = false;
    }
});

var CircleCircleIntersections = Gizmo.extend("CircleCircleIntersections", function() {

    this.init = function() {}

    this.recalculate = function() {
	var centre1 = this.parents[0].centre(), centre2 = this.parents[1].centre();
	var b1 = this.parents[0].parents[1];
	var x1 = centre1.x, y1 = centre1.y;
	var x2 = centre2.x, y2 = centre2.y;
	var r1 = this.parents[0].radius(), r2 = this.parents[1].radius();
	var dx = x2-x1, dy = y2-y1;
	var d2 = dx*dx+dy*dy;
	var D = ((r1+r2)*(r1+r2)/d2-1) * (1-(r1-r2)*(r1-r2)/d2);
	if (D<=0) { this.valid = false; return; }
	var K = 0.25*Math.sqrt(D);
	var dr2 = 0.5*(r1*r1-r2*r2)/d2;
	var xs = 0.5*(x1+x2)+dx*dr2, xt =  2*dy*K;
	var ys = 0.5*(y1+y2)+dy*dr2, yt = -2*dx*K;

	// get a consistent ordering of the two intersection points
	if (xt*(b1.x-x1) + yt*(b1.y-y1) > SMALL) {
	    xt = -xt; yt = -yt;
	}

	this.x = [xs+xt, xs-xt];
	this.y = [ys+yt, ys-yt];
	if (!(isFinite(xs) && isFinite(xt) && isFinite(ys) && isFinite(yt))) 
	    this.valid = false;
    }
});


var SingleCircleIntersection = IntersectionPoint.extend("SingleCircleIntersection", function() {

    this.init = function() { 
	this.svg_create(Graphics.G_POINTS, "circle", "intersectionpoint");
	this.svg_attrib({"r": "5"});
    }

    this.recalculate = function() {
	this.valid = this.parents[0].valid && "which" in this;
	if (this.valid) {
	    this.x = this.parents[0].x[this.which];
	    this.y = this.parents[0].y[this.which];
	}
    }

});
