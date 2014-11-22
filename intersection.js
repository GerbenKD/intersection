"use strict";

//globals
var XS = window.innerWidth, YS = window.innerHeight;
var UNUSED_ID = 0;

//create svg element
var body = document.getElementById("body");
var svg_namespace = "http://www.w3.org/2000/svg";
var svg = document.createElementNS(svg_namespace, "svg");
body.appendChild(svg);
svg.setAttribute("width", XS);
svg.setAttribute("height", YS);

var SMALL = 0.00001;


var g_lines         = document.createElementNS(svg_namespace, "g");
var g_points        = document.createElementNS(svg_namespace, "g");
var g_highlighted   = document.createElementNS(svg_namespace, "g");
var g_controlpoints = document.createElementNS(svg_namespace, "g");
svg.appendChild(g_lines);
svg.appendChild(g_points);
svg.appendChild(g_highlighted);
svg.appendChild(g_controlpoints);

//converts a mouse event to screen coords
function e2coord(e) {
	e = e || window.event;
	var docEl = document.documentElement;
	var scrollLeft = docEl.scrollLeft || document.body.scrollLeft;
	var scrollTop  = docEl.scrollTop || document.body.scrollTop;
	var x = e.pageX || (e.clientX  + scrollLeft);
	var y = e.pageY || (e.clientY  + scrollTop);
	return [x,y];
}


//------------------------------- Constructions ---------------------------------------

var Construction = new function() {

	this.empty = function() { return this.gizmos.length==0; }

	this.create = function() {
		function constructor() { this.gizmos = []; }
		constructor.prototype = this;
		return new constructor();
	}

	this.add = function() {
		for (var i=0; i<arguments.length; i++) {
			this.gizmos.push(arguments[i]);
		}
	}

	this.update = function() {
		for (var i=0; i<this.gizmos.length; i++) {
			var gizmo = this.gizmos[i];
			gizmo.recalculate_check_valid();
		}
	}

	this.find_closest_point = function(point) {
		return this.find_closest_object(point.x, point.y, 
				{"ControlPoint": 0, "ToolControlPoint": 0, "LineLineIntersection": 0, "SingleCircleIntersection": 0});
	}

	/* The classes object can be null, in which case all objects are checked.
	 * Otherwise, only the objects are considered whose type equals a key in the classes object.
	 * The associated value determines the slack, which is subtracted from the distance to get control over
	 * the priority.
	 */
	this.find_closest_object = function(mx, my, classes) {
		var closest_obj = null, closest_dist=Infinity;
		for (var i=0; i<this.gizmos.length; i++) {
			var gizmo = this.gizmos[i];
			if (!gizmo.valid || !gizmo.svg) continue; // this guy is not on the screen
			var slack = 0;
			if (classes) {
				if (!(gizmo.type in classes)) continue;
				slack = classes[gizmo.type];
			}
			var d = gizmo.distance_to_coords(mx, my)-slack;
			if (d<closest_dist) {
				closest_dist = d;
				closest_obj = gizmo;
			}
		}
		return [closest_obj, closest_dist];
	}

	this.trash = function(gizmo) {
	    for (var i=0; i<this.gizmos.length; i++) {
		if (gizmo === this.gizmos[i]) { this.gizmos.splice(i,1); break; }
	    }
	    gizmo.remove_svg();
	}

	this.remove_deleted_gizmos = function() {
	    var j=0;
	    for (var i=0; i<this.gizmos.length; i++) {
		var gizmo = this.gizmos[i];
		if (gizmo.id != -1) this.gizmos[j++] = gizmo;
	    }
	    while (this.gizmos.length > j) this.gizmos.pop();
	}
    
        // all objects with src as parent are redirected to dst
        this.redirect = function(src, dst) {
	    for (var i=0; i<this.gizmos.length; i++) {
		if (src === this.gizmos[i]) { this.gizmos.splice(i,1); break; }
	    }
	    src.remove_svg();
	    for (var id in src.children) {
		var child = src.children[id];
		dst.children[id] = child;
		for (var j=0; j<child.parents.length; j++) {
		    if (child.parents[j]===src) child.parents[j] = dst;
		}
	    }
	}

	this.num_control_points = function() {
		var n = 0;
		for (var i=0; i<this.gizmos.length; i++) {
			if (this.gizmos[i].set_position) n++;
		}
		return n;
	}

	this.find_all_duplicates = function(dst) {
		return;
		console.log("Searching for duplicates");

		var res = scan_points(this.gizmos);
		var points = res[0], targets = res[1], controls = res[2];
		var candidates = initialize_candidates(points, targets);
		test_candidates(controls, candidates, dst, this);
		for (var id in candidates) {
			var targets = candidates[id][1];
			if (targets.length>1) console.error("It appears there are duplicate points in dst");
			candidates[id][1] = candidates[id][1][0];
		}
		return candidates;

		// initialize points, targets and controls arrays
		function scan_points(gizmos) {
			var points = [], targets = [], controls = [];
			for (var i=0; i<gizmos.length; i++) {
				var gizmo = gizmos[i];
				if (gizmo.is_point && gizmo.valid) points.push(gizmo);
			}

			for (var i=0; i<dst.gizmos.length; i++) {
				var gizmo = dst.gizmos[i];
				if (gizmo.is_point && gizmo.valid) targets.push(gizmo);
				if (gizmo.set_position) controls.push(gizmo);
			}
			console.log("There are "+targets.length+" targets and "+controls.length+" control points");
			return [points, targets, controls];
		}

		// reorders the points and targets arrays
		// returns a mapping src_id -> [src, [dst...]]
		function initialize_candidates(points, targets) {
			console.log("initializing candidates");
			function by_coord(p1, p2) { return p1.x-p2.x; }
			points.sort(by_coord);
			targets.sort(by_coord);
			var candidates = {};
			var j=0;
			for (var i=0; i<points.length; i++) {
				var pt_i = points[i];
				for (; j<targets.length; j++) {
					if (pt_i.x-targets[j].x < SMALL) break;
				}
				for (var k=j; k<targets.length; k++) {
					var pt_k = targets[k];
					if (pt_k.x - pt_i.x >= SMALL) break;
					if (pt_i.distance_to_point(pt_k) < SMALL) {
						var id = pt_i.id;
						if (!candidates[id]) candidates[id] = [pt_i, []];
						candidates[id].push(pt_k);
					}
				}
			}
			// report results for debugging, TODO disable this
			for (var id in candidates) {
				var src = candidates[id][0];
				console.log("There is a "+src.toString()+"(id="+id+") with "+candidates[id][1].length+" candidates.");
			}
			return candidates;
		}

		function test_candidates(controls, candidates, constr1, constr2) {
			var op = []; // original positions of the control points

			for (var i=0; i<controls.length; i++) {
				op.push([controls[i].x, controls[i].y]);
			}

			for (var test=0; test<5; test++) {

				// randomize control points and recalculate structure
				for (var i=0; i<op.length; i++) {
					var dx = Math.random()*100-50, dy = Math.random()*100-50;
					controls[i].set_position(op[i][0]+dx, op[i][1]+dy);
				}
				constr1.update(); constr2.update();

				// filter candidates
				for (var id in candidates) {
					var src = candidates[id][0], targets = candidates[id][1];
					var new_targets = [];
					for (var i=0; i<targets.length; i++) {
						var tgt = targets[i];
						if (tgt.valid && tgt.distance_to_point(src)<SMALL) {
							new_targets.push(tgt);
						}
					}
					if (new_targets.length>0) {
						candidates[id][1] = new_targets;
					} else {
						delete candidates[id];
					}
				}
			}

			// restore original positions
			for (var i=0; i<op.length; i++) {
				controls[i].set_position(op[i][0], op[i][1]);
			}
			constr1.update(); constr2.update();
		}
	}

	this.inject = function(dst) {
		// For the time being, just copies stuff
		this.find_all_duplicates(dst); // for testing
		dst.add.apply(dst, this.gizmos);
	}

	this.create_intersections = function(other) {
		var lines = [], circles = [];
		for (var i=0; i<other.gizmos.length; i++) {
			var gizmo = other.gizmos[i];
			if      (gizmo.is_line)   lines.push(gizmo);
			else if (gizmo.is_circle) circles.push(gizmo);
		}

		function addci(construction, ci) { 
			construction.add(ci,
					SingleCircleIntersection.create(ci, 0), 
					SingleCircleIntersection.create(ci, 1)); 
		}

		for (var i=0; i<this.gizmos.length; i++) {
			var gizmo = this.gizmos[i];

			// create all intersections with lines in other
			if (gizmo.is_line) {
				for (var j=0; j<lines.length; j++) {
					this.add(LineLineIntersection.create(gizmo,lines[j]));
				}
				for (var j=0; j<circles.length; j++) {
					addci(this, CircleLineIntersections.create(circles[j], gizmo));
				}
			} else if (gizmo.is_circle) {
				for (var j=0; j<lines.length; j++) {
					addci(this, CircleLineIntersections.create(gizmo, lines[j]));
				}
				for (var j=0; j<circles.length; j++) {
					var cci = CircleCircleIntersections.create(circles[j], gizmo);
					this.add(cci, 
							SingleCircleIntersectionH.create(cci,0),
							SingleCircleIntersectionH.create(cci,1));
				}
			}
		}
	}

	this.report = function() { 
		for (var i=0; i<this.gizmos.length; i++) {
			var gizmo = this.gizmos[i];
			console.log("\n\n"+gizmo.toString());
		}
	}

}

/*
  tool injection design:

   - tool control points are redirected to points in C by the user
   - create all intersections and add them to the tool
   - find equivalent point sets between C and tool. Points in both C and 
     tool are assumed unique, but depending on how the tool's control points are attached
     multiple tool points can now become equivalent. The equivalent point sets can 
     be represented as a mapping Tool point => C point
   - redirect all points in the mapping
   - the tool now contains remaining unique points and all lines and circles, and
     circleinteractions objects. The non-points might be in C already. 
   - When non-points are redirected, unify them with existing children
     of their new parents.
 */

//----------------------------------- Gizmos ---------------------------------------

var Gizmo = new function() {

	this.valid = false;

	// Conveniently construct a subclass. All members are given an id.
	this.extend = function() {
		var id = 0;
		return function(constr) {
			constr.prototype = this;
			var instance = new constr();
			instance.id = id++;
			return instance;
		}
	}();

	/* Instiantiates a class object, registers parents,
       assigns an ID and stores it in the objects list.
	 */
	this.create = function() {
		var instance = this.extend(this.init);
		instance.children = {};
		instance.parents = Array.prototype.slice.call(arguments);
		for (var i=0; i<arguments.length; i++) {
			var parent = arguments[i];
			parent.children[instance.id]=instance;
		}
		instance.recalculate_check_valid();
		return instance;
	}

	this.remove_svg = function() {
	    if (this.svg) { 
		this.hide();
		delete this.svg;
	    }
	}

	this.highlight = function(state) {
		if (this.svg) {
		    if (state) this.svg.classList.add("highlighted");
		    else       this.svg.classList.remove("highlighted");		
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
		this.svg = document.createElementNS(svg_namespace, name);
		if (clazz) {
			this.svg.classList.add(clazz);
		}
	}

	this.svg_attrib = function(attrib) {
		for (var key in attrib) {
			this.svg.setAttribute(key, attrib[key]);
		}
	}

	this.hide = function() { this.group.removeChild(this.svg); }
	this.show = function() { this.group.appendChild(this.svg); }

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
	    for (var i=0; i<c.length; i++) {
		c[i].destroy();
	    }
	    this.children = {};
	    this.destroy_upstream();
	}

	// destroy me if I have no remaining children, 
        // and if I'm destroyed, check if my parents have more children
	this.destroy_upstream = function() {
	    if (this.id!=-1 && Object.keys(this.children) == 0) {	
		this.remove_svg();
		var p = this.parents;
		this.id = -1;
		delete this.parents;
		for (var i=0; i<p.length; i++) {
		    delete p[i].children[this.id];
		    if (p[i].type != "ControlPoint") p[i].destroy_upstream();
		}
	    }
	}
}

var Point = Gizmo.extend(function() {

	this.is_point = true;

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
		this.svg.setAttribute("cx", this.x);
		this.svg.setAttribute("cy", this.y);
	}
});

var ControlPoint = Point.extend(function() {

	this.type = "ControlPoint";
	this.valid = true;

	this.at = function(x, y) {
		var cp = this.extend(this.init);
		cp.children = {};
		cp.parents = [];
		cp.set_position(x, y);
		cp.recalculate_graphics();
		return cp;
	}

	this.init = function() {
		this.svg_create(g_controlpoints, "circle", "controlpoint");
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

var ToolControlPoint = ControlPoint.extend(function() {
	this.type = "ToolControlPoint";
	this.init = function() {
		this.svg_create(g_controlpoints, "circle", "toolcontrolpoint");
		this.svg_attrib({"r": "10"});
		this.show();
	}
});

var Line = Gizmo.extend(function() {

	this.type = "Line";
	this.is_line = true;

	this.init = function() {
		this.svg_create(g_lines, "line", "line");
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
			this.svg.setAttribute("x1", exit1[0]);
			this.svg.setAttribute("y1", exit1[1]);
			this.svg.setAttribute("x2", exit2[0]);
			this.svg.setAttribute("y2", exit2[1]);
		}

		// If the exits are undefined we can only hope that the old line runs
		// more or less in the right direction, or that the defining points are
		// moved to another position quickly! Also, avoid lines with 
		// parents[0]=parents[1].

		// extends the vector v1 -> v2 to the edge of the screen
		function extend(v1, v2, v) {
			var x = v1.x, dx = v2.x-v1.x, y = v1.y, dy = v2.y-v1.y;
			if (dx!=0) {
				var ix = dx>0 ? XS : 0;
				var iy = y + (ix-x)/dx * dy;
				if (iy>=0 && iy<=YS) return [ix, iy];
			}
			if (dy!=0) {
				var iy = dy>0 ? YS : 0;
				var ix = x+(iy-y)/dy * dx
				if (ix>=0 && ix<=XS) return [ix, iy];
			}
			return null;
		}

	}
});

var IntersectionPoint = Point.extend(function() {

	this.type = "IntersectionPoint";

	this.find_duplicates = function() {
		// find number of control points and back up their coordinates
		var cp = [];
		for (var i=0; i<Gizmo.INSTANCE_LIST.length; i++) {
			var obj = Gizmo.INSTANCE_LIST[i];
			if (!obj.at) break;
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


var LineLineIntersection = IntersectionPoint.extend(function() {

	this.type = "LineLineIntersection";

	this.init = function() { 
		this.svg_create(g_points, "circle", "intersectionpoint");
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


var Circle = Gizmo.extend(function() {

	this.type = "Circle";
	this.is_circle = true;

	this.init = function() {
		this.svg_create(g_lines, "circle", "circle");
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
		this.svg.setAttribute("cx", cx);
		this.svg.setAttribute("cy", cy);
		this.svg.setAttribute("r", r);
	}
});

var CircleLineIntersections = Gizmo.extend(function() {

	this.type = "CircleLineIntersections";

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

var CircleCircleIntersections = Gizmo.extend(function() {

	this.type = "CircleCircleIntersections";

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


var SingleCircleIntersection = IntersectionPoint.extend(function() {

	this.type = "SingleCircleIntersection";

	this.init = function() { 
		this.svg_create(g_points, "circle", "intersectionpoint");
		this.svg_attrib({"r": "5"});
	}

	this.create = function(point_collection, which) {
		var instance = this.extend(this.init);
		instance.children = {};
		instance.parents = [point_collection];
		instance.which = which;
	    point_collection.children[instance.id] = instance;
		instance.recalculate_check_valid();
		return instance;
	}

	this.recalculate = function() {
		this.valid = this.parents[0].valid;
		if (this.valid) {
			this.x = this.parents[0].x[this.which];
			this.y = this.parents[0].y[this.which];
		}
	}

});

var SingleCircleIntersectionH = SingleCircleIntersection.extend(function() {
	this.init = function() { 
		this.svg_create(g_highlighted, "circle", "intersectionpoint");
		this.svg_attrib({"r": "5"});
	}
});


//------------------------------------ Main program -----------------------------------

function sandbox() {

	var C = Construction.create();
	var Tools = [];
	var MOUSE = null, DRAGGING = null, HIGHLIGHTED = null, MODE = 0;

	function update_all() {
		C.update();
		for (var i=0; i<Tools.length; i++) {
			Tools[i].update();
		}
	}


	function find_closest_object(mx, my, classes) {
		var best_obj = C.find_closest_object(mx, my, classes);
		best_obj[2] = C;

		for (var i = 0; i < Tools.length; i++) {
			var res = Tools[i].find_closest_object(mx, my, classes);
			if (res[1] < best_obj[1]) {
				best_obj = res;
				best_obj[2] = Tools[i];
			}
		}

		return best_obj;
	}

	function delete_object(mx,  my) {
		console.log("Deleting object");

		var best_obj = C.find_closest_object(mx, my);

		for (var i = 0; i < Tools.length; i++) {
			var res = Tools[i].find_closest_object(mx, my);
			if (res[1] < best_obj[1]) {
				best_obj = res;
			}
		}
		console.log(best_obj[0].toString());
	}

	window.onkeypress = function(e) {
		var mx = MOUSE[0], my = MOUSE[1];
		var key = e.keyCode || e.charCode;

		switch (key) {
		case 8: case 46:
			if (DRAGGING) break;
			var body = document.getElementById("body");
		        if (MODE==1) body.classList.remove("delete_mode");
		        if (MODE==2) body.classList.remove("inspect_mode");
		        MODE = (MODE+1)%3;
			if (MODE==1) body.classList.add("delete_mode");
		        if (MODE==2) body.classList.add("inspect_mode");
			break;
		case 48: 
			if (MODE!=0) break;
			var p = ControlPoint.at(mx, my); 
			C.add(p); 
			break;
		case 49:
			if (MODE!=0) break;
			var c_tmp = Construction.create();
			var p1 = ToolControlPoint.at(Math.max(50,mx-0.1*XS),     my);
			var p2 = ToolControlPoint.at(Math.min(XS-50, mx+0.1*XS), my);
			var l  = Line.create(p1, p2);
			p1.svg_attrib({"fill": "cyan"});
			p2.svg_attrib({"fill": "cyan"});
			c_tmp.add(p1, p2, l);
			Tools.push(c_tmp);
			break;
		case 50:
			if (MODE!=0) break;
			var c_tmp = Construction.create();
			var p1 = ToolControlPoint.at(mx, my);
			var p2 = ToolControlPoint.at(mx, my>YS/2 ? my - 0.1*YS : my + 0.1*YS);
			var c = Circle.create(p1, p2);
			p1.svg_attrib({"fill": "cyan"});
			p2.svg_attrib({"fill": "cyan"});
			c_tmp.add(p1, p2, c);
			Tools.push(c_tmp);
			break;
		default:
			console.log("Unrecognised keycode: "+key);
		break;
		}
	}

	window.onmousedown = function(e) {
		if (!HIGHLIGHTED) return;
		var xy = e2coord(e);
		var gizmo = HIGHLIGHTED.gizmo, tool = HIGHLIGHTED.tool;
	        switch(MODE) {
		case 0:
		    // gizmo must be a ControlPoint or a ToolControlPoint
		    gizmo.highlight(false);
		    HIGHLIGHTED = null;
		    DRAGGING = [gizmo, gizmo.x - xy[0], gizmo.y - xy[1], tool];
		    break;
		case 1:
		    gizmo.destroy();
		    C.remove_deleted_gizmos();
		    var j=0;
		    for (var i=0; i<Tools.length; i++) {
			var tl = Tools[i];
			tl.remove_deleted_gizmos();
			if (!tl.empty()) Tools[j++] = Tools[i]; 
		    }
		    while (Tools.length > j) { Tools.pop(); }
		    break;
		case 2:
		    console.log(gizmo.toString());
		    break;
		}
	}


	window.onmousemove = function(e) {
		MOUSE = e2coord(e);

		var classes = null;
		if (!DRAGGING) {
		    switch (MODE) {
		    case 0:
			classes = {
			    "ControlPoint": 20,
			    "ToolControlPoint": 20 
			};
			break;
		    case 1:
			classes = { 
			    "ControlPoint": 20,
			    "ToolControlPoint": 20,
			    "Line": 10,
			    "Circle": 10
			};
			break;
		    case 2:
			classes = {
			    "ControlPoint": 20,
			    "ToolControlPoint": 20,
			    "IntersectionPoint": 20,
			    "LineLineIntersection": 20,
			    "SingleCircleIntersection": 20,
			    "Line": 10,
			    "Circle": 10
			};
		    }
		} else if (DRAGGING[3]) {
			// We're dragging a ToolControlPoint, highlight snap targets
			classes = { "ControlPoint": 20,	
					"LineLineIntersection": 20,
					"SingleCircleIntersection": 20
			};
		}

		if (classes) {
		    var best_obj = find_closest_object(MOUSE[0], MOUSE[1], classes);
			if (best_obj[0]) {
				var hl = best_obj[1]<=0, sw = HIGHLIGHTED !== best_obj[0];
				if (HIGHLIGHTED) {
					// check if old highlight should be removed
					if (!hl || sw) HIGHLIGHTED.gizmo.highlight(false);
				}
				if (hl && sw) best_obj[0].highlight(true);
				HIGHLIGHTED = hl ? { "gizmo" : best_obj[0], "tool" : best_obj[2] } : null;
			}
		}

		if (DRAGGING) {
			var obj = DRAGGING[0], x0 = DRAGGING[1], y0 = DRAGGING[2];
			obj.set_position(x0+MOUSE[0], y0+MOUSE[1]);
			var tool = DRAGGING[3];
			if (tool === C) {
				update_all();
			} else {
				tool.update();
			}
		}
	}

	/* Bugs and things to think about:
       - currently, can only snap to points that are not built on top of a snappable.
         however, the difference with normal points is not visible in the UI
       - two points of a line/circle can be snapped to the same point
	 */
	window.onmouseup = function(e) {
		if (DRAGGING) {
			var obj = DRAGGING[0], tool = DRAGGING[3];
			DRAGGING = null;
			if (tool!==C && HIGHLIGHTED) {
				// Snap this ToolControlPoint to HIGHLIGHTED.gizmo
				tool.redirect(obj, HIGHLIGHTED.gizmo);
				if (tool.num_control_points()==0) {
					tool.create_intersections(C);
					tool.inject(C);
					for (var i=0; i<Tools.length; i++) {
						if (Tools[i]===tool) { Tools.splice(i, 1); break; }
					}
					C.update();
				} else {
					tool.update(); // redraw after snapping
				}
			}
		}
	}
}

console.log("Hello World!");
sandbox();

//demo2();
