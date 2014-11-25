"use strict";

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
	    this.gizmos[i].recalculate_check_valid();
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
    this.find_closest_object = function(mx, my, class_map) {
	var closest_obj = null, closest_dist=Infinity;
	for (var i=0; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];
	    if (!gizmo.valid || !gizmo.svg) continue;
	    var slack = 0;
	    if (class_map) {
		if (!(gizmo.type in class_map)) continue;
		slack = class_map[gizmo.type];
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
	    if      (gizmo.is_a("Line"))   lines.push(gizmo);
	    else if (gizmo.is_a("Circle")) circles.push(gizmo);
	}

	function addci(construction, ci) { 
	    construction.add(ci, 
			     SingleCircleIntersection.create({"parents": [ci], "which": 0}),
			     SingleCircleIntersection.create({"parents": [ci], "which": 1}));
	}
	
	for (var i=0; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];

	    // create all intersections with lines in other
	    if (gizmo.is_a("Line")) {
		for (var j=0; j<lines.length; j++) {
		    this.add(LineLineIntersection.create({"parents": [gizmo,lines[j]]}));
		}
		for (var j=0; j<circles.length; j++) {
		    addci(this, CircleLineIntersections.create({"parents": [circles[j], gizmo]}));
		}
	    } else if (gizmo.is_a("Circle")) {
		for (var j=0; j<lines.length; j++) {
		    addci(this, CircleLineIntersections.create({"parents": [gizmo, lines[j]]}));
		}
		for (var j=0; j<circles.length; j++) {
		    var cci = CircleCircleIntersections.create({"parents": [circles[j], gizmo]});
		    this.add(cci, 
			     SingleCircleIntersection.create({"parents": [cci], "which": 0}),
			     SingleCircleIntersection.create({"parents": [cci], "which": 1}));
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

    /* This function modifies all gizmos in this construction so they can be JSON.stringified appropriately.
       The following fields are changed to allow this:
       - parents: replaced by an array of parent ids
       - children: replaced by an array of children ids
       - svg: removed (reconstructed upon unpacking if the gizmo has a group field)
       - valid: removed (recalculated upon unpacking)
       - type: lifted to instance in order to be able to reconstruct prototype
    */
    this.stringify = function() {
	// indirectify all gizmos
	var held_back = { "children": true, "parents": true, "svg": true, "valid": true };
	var a = [];
	for (var i=0; i<this.gizmos.length; i++) {
	    // replace all parents/children by id arrays
	    var gizmo = this.gizmos[i];
	    var igizmo = {};
	    for (var key in gizmo) {
		if ((key=="type" || gizmo.hasOwnProperty(key)) && !held_back[key]) igizmo[key] = gizmo[key]; 
	    }
	    var p = [];
	    for (var j=0; j<gizmo.parents.length; j++) {
		p.push(gizmo.parents[j].id);
	    }
	    igizmo.parents = p;
	    igizmo.children = Object.keys(gizmo.children).map(function(s){return s|0;});
	    a.push(igizmo);
	}
	return JSON.stringify(a);
    }

    // Unpack the json string and add to this construction.
    this.unpack = function(json) {
	var a = JSON.parse(json);
	var first_new = this.gizmos.length;
	// create old_id -> object map for all gizmos
	var map = {}; // map old id to new gizmo
	var held_back = { "type": true, "id": true }; 
	for (var i=0; i<a.length; i++) {
	    var igizmo = a[i];
	    var gizmo = window[igizmo.type].instantiate({}); // note gizmo has a new id
	    for (var key in igizmo) {
		if (igizmo.hasOwnProperty(key) && !held_back[key]) gizmo[key] = igizmo[key]; 
	    }
	    map[igizmo.id] = gizmo;
	    this.gizmos.push(gizmo);
	}
	// deref child/parent links for all new gizmos
	for (var i=first_new; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];
	    for (var j=0; j<gizmo.parents.length; j++) {
		gizmo.parents[j] = map[gizmo.parents[j]];
	    }
	    var children = {};
	    for (var j=0; j<gizmo.children.length; j++) {
		var ch = map[gizmo.children[j]];
		children[ch.id] = ch;
	    }
	    gizmo.children = children;
	}

	this.update();
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
