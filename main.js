"use strict";

function main() {

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
	    var p = ControlPoint.create({"x": mx, "y": my}); 
	    C.add(p); 
	    break;
	case 49:
	    if (MODE!=0) break;
	    var c_tmp = Construction.create();
	    var p1 = ToolControlPoint.create({"x": Math.max(50,mx-0.1*Graphics.XS), "y": my});
	    var p2 = ToolControlPoint.create({"x": Math.min(Graphics.XS-50, mx+0.1*Graphics.XS), "y": my});
	    var l  = Line.create({"parents": [p1, p2]});
	    c_tmp.add(p1, p2, l);
	    Tools.push(c_tmp);
	    break;
	case 50:
	    if (MODE!=0) break;
	    var c_tmp = Construction.create();
	    var p1 = ToolControlPoint.create({"x": mx, "y": my});
	    var p2 = ToolControlPoint.create({"x": mx,
					      "y": my>Graphics.YS/2 ? my - 0.1*Graphics.YS : my + 0.1*Graphics.YS});
	    var c = Circle.create({"parents": [p1, p2]});
	    c_tmp.add(p1, p2, c);
	    Tools.push(c_tmp);
	    break;
	case 97:
	    if (MODE==0) undo(true);
	    break;
	case 100:
	    if (MODE==0) undo(false);
	    break;
	default:
	    console.log("Unrecognised keycode: "+key);
	    break;
	}
    }

    window.onmousedown = function(e) {
	if (!HIGHLIGHTED) return;
	var xy = Graphics.e2coord(e);
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
	MOUSE = Graphics.e2coord(e);

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
