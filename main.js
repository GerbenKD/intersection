"use strict";

function main() {
    var C = Construction.create();
    var Tools = [];
    var MOUSE = null, DRAGGING = null, HIGHLIGHTED = null;

    Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu
    
    function update_all() {
	C.update();
	for (var i=0; i<Tools.length; i++) {
	    Tools[i].update();
	}
    }

    // convenience class that extracts the edit mode from an event
    var mode = function() {
	var prev_mode = null;
	return function(e) {
	    var m = e.ctrlKey
		? (e.shiftKey ? "inspect" : "delete") 
		: (e.shiftKey ? "hide"    : "normal");
	    if (m!=prev_mode) {
		if (prev_mode!=null) {
		    if (prev_mode!="normal") Graphics.remove_class(Graphics.BODY, prev_mode+"_mode");
		}
		Graphics.add_class(Graphics.BODY, m+"_mode");
		if (m=="hide")              { C.hint_hidden(true); }
		else if (prev_mode=="hide") { C.hint_hidden(false); }
		prev_mode = m;
	    }
	    return m;
	}
    }();

    function find_closest_object(mx, my, classes, include_hidden) {
	var best_obj = C.find_closest_object(mx, my, classes, include_hidden);
	best_obj[2] = C;

	for (var i = 0; i < Tools.length; i++) {
	    var res = Tools[i].find_closest_object(mx, my, classes, include_hidden);
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

    function load(load_buffer) {
	console.log("Loading buffer "+load_buffer);
	C.unpack(localStorage["buffer_"+load_buffer]);
    }

    function save(save_buffer) {
	console.log("Saving to buffer "+save_buffer);
	localStorage["buffer_"+save_buffer] = C.stringify();
    }

    window.onkeypress = function(e) {
	var mx = MOUSE[0], my = MOUSE[1];
	var key = e.keyCode || e.charCode;

	var chr = String.fromCharCode(key);
	var load_buffer = "qwertyuiop".indexOf(chr);
	if (load_buffer>=0) { load(load_buffer); return; }
	var save_buffer = "QWERTYUIOP".indexOf(chr);
	if (save_buffer>=0) { save(save_buffer); return; }

	switch (key) {
	case 48: 
	    var p = ControlPoint.create({"x": mx, "y": my}); 
	    C.add(p); 
	    break;
	case 49:
	    var c_tmp = Construction.create();
	    var p1 = ToolControlPoint.create({"x": Math.max(50,mx-0.1*Graphics.XS), "y": my});
	    var p2 = ToolControlPoint.create({"x": Math.min(Graphics.XS-50, mx+0.1*Graphics.XS), "y": my});
	    var l  = Line.create({"parents": [p1, p2]});
	    c_tmp.add(p1, p2, l);
	    Tools.push(c_tmp);
	    break;
	case 50:
	    var c_tmp = Construction.create();
	    var p1 = ToolControlPoint.create({"x": mx, "y": my});
	    var p2 = ToolControlPoint.create({"x": mx,
					      "y": my>Graphics.YS/2 ? my - 0.1*Graphics.YS : my + 0.1*Graphics.YS});
	    var c = Circle.create({"parents": [p1, p2]});
	    c_tmp.add(p1, p2, c);
	    Tools.push(c_tmp);
	    break;
	case 97: undo(true); break;
	case 100: undo(false); break;
	case 118: console.log(C.gizmos[135].toString());break;
	default:
	    console.log("Unrecognised keycode: "+key);
	    break;
	}
	highlight(e);
    }

    window.onmousedown = function(e) {
	if (!HIGHLIGHTED) return;
	var xy = Graphics.e2coord(e);
	var gizmo = HIGHLIGHTED.gizmo, tool = HIGHLIGHTED.tool, m = mode(e);
	if (m == "normal") {
	    // gizmo must be a ControlPoint or a ToolControlPoint
	    gizmo.highlight(false);
	    HIGHLIGHTED = null;
	    DRAGGING = [gizmo, gizmo.x - xy[0], gizmo.y - xy[1], tool];
	} else if (m == "delete") {
	    gizmo.destroy();
	    C.remove_deleted_gizmos();
	    var j=0;
	    for (var i=0; i<Tools.length; i++) {
		var tl = Tools[i];
		tl.remove_deleted_gizmos();
		if (!tl.empty()) Tools[j++] = Tools[i]; 
	    }
	    while (Tools.length > j) { Tools.pop(); }
	} else if (m == "hide") {
	    gizmo.hide(!gizmo.hidden);
	    HIGHLIGHTED = null;
	} else if (m == "inspect") {
	    console.log(gizmo.toString());
	}
	highlight(m);
    }

    function highlight(m) {
	var classes = null;
	if (!DRAGGING) {
	    if (m == "normal") {
		classes = {
		    "ControlPoint": 20,
		    "ToolControlPoint": 20 
		};
	    } else if (m == "delete") {
		classes = { 
		    "ControlPoint": 20,
		    "ToolControlPoint": 20,
		    "Line": 10,
		    "Circle": 10
		};
	    } else if (m == "hide") {
		classes = {
		    "LineLineIntersection": 20,
		    "SingleCircleIntersection": 20,
		    "Line": 10,
		    "Circle": 10
		};
	    } else if (m == "inspect") {
		classes = {
		    "ControlPoint": 20,
		    "ToolControlPoint": 20,
		    "LineLineIntersection": 20,
		    "SingleCircleIntersection": 20,
		    "Line": 10,
		    "Circle": 10
		};
	    }
	} else if (DRAGGING[0].is_a("ToolControlPoint")) {
	    // We're dragging a ToolControlPoint, highlight snap targets
	    classes = { "ControlPoint": 20,	
			"LineLineIntersection": 20,
			"SingleCircleIntersection": 20
		      };
	}
	if (classes) {
	    var best_obj = find_closest_object(MOUSE[0], MOUSE[1], classes, m=="inspect" || m=="hide");
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
    }

    window.onmousemove = function(e) {
	MOUSE = Graphics.e2coord(e);
	highlight(mode(e));
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
	    highlight(mode(e));
	}
    }
}
