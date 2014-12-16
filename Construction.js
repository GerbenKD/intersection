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
    this.find_closest_object = function(mx, my, class_map, include_hidden) {
	var closest_obj = null, closest_dist=Infinity;
	for (var i=0; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];
	    if (!gizmo.valid || !gizmo.svg || (gizmo.hidden && !include_hidden)) continue;
	    var slack = 0;
	    if (class_map) {
		if (!(gizmo.type in class_map)) continue;
		slack = class_map[gizmo.type];
	    }
	    var d = gizmo.distance_c(mx, my)-slack;
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
    
    /* If map[src_id]=[*,src,dst], then all references to src are replaced by references to dst.

       TODO!!!
       Since we've now figured out that src===dst, we should find all children of dst that have
       more than one parent equal to dst. Such children are invalid and should be killed, and now
       is the first time that we can detect that they're invalid.
    */
    this.redirect = function(map) {
	// first attach all src's children to dst and destruct the src gizmo
	for (var src_id in map) {
	    var src = map[src_id][1], dst = map[src_id][2];

	    // unhide dst if src is visible
	    if (dst.hidden && !src.hidden) delete dst.hidden;

	    // relink my children
	    for (var id in src.children) {
		var child = src.children[id];
		dst.children[id] = child;
		for (var j=0; j<child.parents.length; j++) {
		    if (child.parents[j]===src) child.parents[j] = dst;
		}
	    }

	    // unlink my parents
	    for (var i=0; i<src.parents.length; i++) {
		var par = src.parents[i];
		delete par.children[src_id];
	    }

	    src.destruct();

	    /* kill all children of dst with more than one parent equal to dst.
	       These should be intersection points defined by a gizmo in tool and a gizmo in C,
	       constructed a short while ago by create_intersections.
	       Therefore they should be LineLineIntersections or Circle(Line|Circle)intersections with one
	       level of children.
	    */
	    var kill_set = {};
	    for (var id in dst.children) {
		var c = 0;
		var ch = dst.children[id];
		for (var i=0; i<ch.parents.length; i++) {
		    if (ch.parents[i]===dst) c++;
		}
		if (c==0) console.error("Inconsistent parent/child links");
		if (c>1) kill_set[id] = true;
	    }
	    for (var id in kill_set) {
		var ch = dst.children[id];
		for (var i=0; i<ch.parents.length; i++) {
		    var par = ch.parents[i];
		    delete par.children[id];
		}
		for (var ch_id in ch.children) {
		    ch.children[ch_id].destruct();
		}
		ch.destruct();
	    }

	}

	this.remove_deleted_gizmos();
    }
    
    this.num_control_points = function() {
	var n = 0;
	for (var i=0; i<this.gizmos.length; i++) {
	    if (this.gizmos[i].set_position) n++;
	}
	return n;
    }


    // map of duplicate candidates: src_id -> [type, src, dst]
    this.find_all_duplicates = function(src, dst) {
	console.log("Searching for duplicates");

	var src_f = filter(src.gizmos);
	var dst_f = filter(dst.gizmos);

	if (src_f[3].length!=0) {
	    console.error("find_all_duplicates: src should not contain control points");
	}
	var controls = dst_f[3];

	var map = {}; // maps src_id -> [type, src, [dst...]]
	initialize_candidates(map, Point,  src_f[0], dst_f[0]);
	initialize_candidates(map, Line,   src_f[1], dst_f[1]);
	initialize_candidates(map, Circle, src_f[2], dst_f[2]);

	var op = []; // original positions of the control points
	for (var i=0; i<controls.length; i++) {
	    op.push([controls[i].x, controls[i].y]);
	}

	// test stuff
	for (var i=0; i<5; i++) {
	    test_candidates();
	}

	move_control_points(0); // move them back to original positions


	var num = [0,0,0];
	for (var id in map) {
	    if (map[id][2].length > 1) console.error("There are duplicate points in dst!");
	    map[id][2] = map[id][2][0];
	    var type = map[id][0];
	    if      (type === Point)  num[0]++;
	    else if (type === Line)   num[1]++;
	    else if (type === Circle) num[2]++;
	}
	console.log("I found "+num[0]+" duplicate points, "+num[1]+" duplicate lines, "+num[2]+" duplicate circles.");
	return map;

	/* Filter valid gizmos into three types: points, lines and circles.
	   Also returns a list of control points: a subset of the points.
	*/
	function filter(gizmos) {
	    var res = [[], [], [], []];
	    for (var i=0; i<gizmos.length; i++) {
		var gizmo = gizmos[i];
		if (gizmo.valid) {
		    if      (gizmo.is_a("ControlPoint")) res[3].push(gizmo);
		    if      (gizmo.is_a("Point"))        res[0].push(gizmo);
		    else if (gizmo.is_a("Line"))         res[1].push(gizmo);
		    else if (gizmo.is_a("Circle"))       res[2].push(gizmo);
		}
	    }
	    return res;
	}

	// Augments the map with new candidates of the given type (Point, Line or Circle)
	function initialize_candidates(map, type, sources, targets) {
	    function by_coord(p1, p2) { return p1.x-p2.x; }
	    sources.sort(type.comparator);
	    targets.sort(type.comparator);
	    var j=0;
	    for (var i=0; i<sources.length; i++) {
		var src_i = sources[i];
		for (; j<targets.length; j++) {
		    if (type.comparator(src_i, targets[j]) < SMALL) break;
		}
		for (var k=j; k<targets.length; k++) {
		    var tgt_k = targets[k];
		    if (type.comparator(tgt_k, src_i) >= SMALL) break;
		    if (type.distance(src_i, tgt_k) < SMALL) {
			var id = src_i.id;
			console.log("Adding candidate for "+src_i.toString());
			if (!map[id]) map[id] = [type, src_i, []];
			map[id][2].push(tgt_k);
		    }
		}
	    }
	}

	// Moves control points by a random value in [-dev,dev] and recalculates the structure.
	// Uses closure variables "op", "controls", "src" and "dst"
	function move_control_points(dev) {
	    for (var i=0; i<controls.length; i++) {
		var dx = dev ? Math.random()*2*dev-dev : 0;
		var dy = dev ? Math.random()*2*dev-dev : 0;
		controls[i].set_position(op[i][0]+dx, op[i][1]+dy);
	    }
	    src.update();
	    dst.update();
	}

	// Tests candidates the given map, removing targets that turn out to be different.
	function test_candidates(map) {
	    move_control_points(50);

	    for (var id in map) {
		var type = map[id][0], src = map[id][1], targets = map[id][2];
		var new_targets = [];
		for (var i=0; i<targets.length; i++) {
		    var tgt_i = targets[i];
		    if (tgt_i.valid && type.distance(src, tgt_i)<SMALL) {
			new_targets.push(tgt_i);
		    }
		}
		if (new_targets.length>0) {
		    map[id][1] = new_targets;
		} else {
		    delete map[id];
		}
	    }
	}
    }

    this.inject = function(dst) {
	console.log("Pre-inject: src contains "+this.gizmos.length+" gizmos, dst has "+dst.gizmos.length);
	this.redirect(Construction.find_all_duplicates(this, dst));
	dst.add.apply(dst, this.gizmos);
	console.log("Post-inject: src has "+this.gizmos.length+" gizmos, dst has "+dst.gizmos.length+" gizmos.");
    }



    // creates all intersections between lines/circles in c1 and lines/circles in c2, and returns the
    // resulting mess as a new Construction
    // usage: var intersection_points = Construction.create_intersections(main, tool);
    this.create_intersections = function(c1, c2) {

	var dst = this.create();

	var lines2 = [], circles2 = [];
	for (var i=0; i<c2.gizmos.length; i++) {
	    var gizmo = c2.gizmos[i];
	    if      (gizmo.is_a("Line"))   lines2.push(gizmo);
	    else if (gizmo.is_a("Circle")) circles2.push(gizmo);
	}

	function addci(ci) { 
	    dst.add(ci, 
		    SingleCircleIntersection.create({"parents": [ci], "which": 0}),
		    SingleCircleIntersection.create({"parents": [ci], "which": 1}));
	}
	
	for (var i=0; i<c1.gizmos.length; i++) {
	    var gizmo = c1.gizmos[i];

	    // create all intersections with lines in other
	    if (gizmo.is_a("Line")) {
		for (var j=0; j<lines2.length; j++) {
		    dst.add(LineLineIntersection.create({"parents": [gizmo,lines2[j]]}));
		}
		for (var j=0; j<circles2.length; j++) {
		    addci(CircleLineIntersections.create({"parents": [circles2[j], gizmo]}));
		}
	    } else if (gizmo.is_a("Circle")) {
		for (var j=0; j<lines2.length; j++) {
		    addci(CircleLineIntersections.create({"parents": [gizmo, lines2[j]]}));
		}
		for (var j=0; j<circles2.length; j++) {
		    var cci = CircleCircleIntersections.create({"parents": [circles2[j], gizmo]});
		    dst.add(cci, 
			    SingleCircleIntersection.create({"parents": [cci], "which": 0}),
			    SingleCircleIntersection.create({"parents": [cci], "which": 1}));
		}
	    }
	}
	
	return dst;
    }

    this.report = function() { 
	for (var i=0; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];
	    console.log("\n\n"+gizmo.toString());
	}
    }

    this.hint_hidden = function(state) {
	for (var i=0; i<this.gizmos.length; i++) {
	    var gizmo = this.gizmos[i];
	    if (gizmo.svg && gizmo.hidden) {
		gizmo.svg.style.visibility = state ? "visible" : "hidden";
	    }
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
		if (gizmo.hasOwnProperty(key) && !held_back[key]) igizmo[key] = gizmo[key]; 
	    }
	    igizmo.type = gizmo.type == "ControlPoint" ? "ToolControlPoint" : gizmo.type;
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
		if (!ch) {
		    console.error("gizmo with new_id "+gizmo.id+" and type "+gizmo.type+" cannot find child with old_id="+gizmo.children[j]);
		}
		children[ch.id] = ch;
	    }
	    gizmo.children = children;
	    if (gizmo.hidden) gizmo.hide(true);
	}
	this.update();
	this.hint_hidden(false);
    }
}
