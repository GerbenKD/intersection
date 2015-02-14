"use strict";

function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS = []; // tool outputs that should be highlighted
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE;                  // [x,y]

    var CP = ControlPointTool.create(); CP.add_graphics();
    var CT = CompoundTool.create();     CT.add_graphics(2);
   
    Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu

    window.onkeypress = function(e) {
	var mx = MOUSE[0], my = MOUSE[1];
	var key = e.keyCode || e.charCode;

	switch (key) {
	case 49:
	    var line = LineTool.create();
	    CT.add_tool(line);
	    line.connect(CP, CP.add([mx-100, my]), 0);
	    line.connect(CP, CP.add([mx+100, my]), 1);
	    if (!DRAGGING) HIGHLIGHT_TARGETS = select_outputs([CP], function() { return true; }); // all controlpoints
	    redraw();
	    break;
	case 50:
	    var circle = CircleTool.create();
	    CT.add_tool(circle);
	    circle.connect(CP, CP.add([mx, my]), 0);
	    circle.connect(CP, CP.add([mx+100, my]), 1);
	    if (!DRAGGING) HIGHLIGHT_TARGETS = select_outputs([CP], function() { return true; }); // all controlpoints
	    redraw();
	    break;
	}
    }

    function redraw() {
	CP.update_graphics();
	CT.recalculate();
	CT.update_graphics();
	highlight();
    }

    function highlight() {
	var old = HIGHLIGHTED;
	var affinity = {
	    circle: 5,
	    line: 5,
	    point: 10 // TODO make controlpoints even more affine somehow
	};
	var i_best, d_best = Infinity;
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    var gizmo = HIGHLIGHT_TARGETS[i][2];
	    if (gizmo.valid) {
		var d = gizmo.distance_to_c(MOUSE) - affinity[gizmo.type];
		if (d < d_best) {
		    d_best = d;
		    i_best = i;
		}
	    }
	}
	if (d_best <= 0) {
	    HIGHLIGHTED = HIGHLIGHT_TARGETS[i_best];
	} else {
	    HIGHLIGHTED=null;
	}

	if (old && (!HIGHLIGHTED || (old[0]!==HIGHLIGHTED[0] || old[1]!=HIGHLIGHTED[1]))) {
	    old[0].highlight(old[1], false);
	}
	if (HIGHLIGHTED) HIGHLIGHTED[0].highlight(HIGHLIGHTED[1], true);
    }

    window.onmousedown = function(e) {
	if (!HIGHLIGHTED) return;
	var num_indep = CT.separate(HIGHLIGHTED[0], HIGHLIGHTED[1]);
	// console.log("I found "+num_indep+"/"+CT.tools.length+" independent tools whose outputs are snap targets");

	var T = CT.get_tools(num_indep);
	var indep_tools = T[0], dep_tools = T[1];

	var cpl = get_controlpoint_listeners(dep_tools);

	// first find all CP sockets connected to the same tool as the one being dragged
	var disqualified_cp_sockets = {};
	for (var i=0; i<cpl.length; i++) {
	    for (var j=0; j<dep_tools[i].max_input_socket(); j++) {
		var connection = dep_tools[i].get_input(j);
		if (connection) disqualified_cp_sockets[connection[1]] = true;
	    }
	}

	indep_tools.push(CP);
	HIGHLIGHT_TARGETS = select_outputs(indep_tools, function(tool,socket,gizmo,sprite) { 
	    return gizmo.type == "point" && !(tool===CP && disqualified_cp_sockets[socket]);
	});

	var cp = HIGHLIGHTED[0].get_output(HIGHLIGHTED[1]);
	DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1], num_indep, cpl];
	apply_outputs(HIGHLIGHT_TARGETS, function(tool,socket,gizmo,sprite) { sprite.add_class("sparkly"); });
	highlight();
    }

    function get_controlpoint_listeners(tools) {
	var res = [];
	for (var i=0; i<tools.length; i++) {
	    var t = tools[i];
	    for (var j=0; j<t.max_input_socket(); j++) {
		var connection=t.get_input(j);
		if (connection && connection[0]===HIGHLIGHTED[0] && connection[1]==HIGHLIGHTED[1]) {
		    res.push([t, j]);
		}
	    }
	}
	return res;
    }

    window.onmousemove = function(e) {
	MOUSE = Graphics.e2coord(e);
	if (DRAGGING) {
	    var gizmo = DRAGGING[0].get_output(DRAGGING[1]);
	    gizmo.pos = [MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]];
	    CP.update_graphics();
	    CT.recalculate(DRAGGING[4]);
	    CT.update_graphics(DRAGGING[4]);
	} 
	highlight();
    }

    window.onmouseup = function(e) {
	if (!DRAGGING) return;
	apply_outputs(HIGHLIGHT_TARGETS, function(tool, socket,gizmo,sprite) { sprite.remove_class("sparkly"); });
	if (HIGHLIGHTED) {
	    snap(DRAGGING[5], HIGHLIGHTED);
	    // TODO also snap all points that depend on the snapped controlpoint!
	    CT.recalculate(DRAGGING[4]);
	    CT.update_graphics(DRAGGING[4]);
	}
	DRAGGING = null;
	HIGHLIGHT_TARGETS = select_outputs([CP], function() { return true; }); // all controlpoints
	highlight();
    }
}



function snap(cpl, target) {
    // figure out the controlpointtool and relevant output socket
    if (!cpl || cpl.length==0) return;
    var cp = cpl[0][0].get_input(cpl[0][1]);

    // rewire
    for (var i=0; i<cpl.length; i++) {
	var inp = cpl[i]; // contains dst_tool and dst_socket
	inp[0].disconnect(inp[1]);
	inp[0].connect(target[0], target[1], inp[1]);
    }

    // destroy controlpoint
    cp[0].remove_output(cp[1]);
}

function apply_outputs(outputs, func) {
    for (var i=0; i<outputs.length; i++) {
	func.apply(null, outputs[i]);
    }
}

function select_outputs(tools, func) {
    var res = [];
    for (var i=0; i<tools.length; i++) {
	var t = tools[i];
	for (var j=0; j<t.max_output_socket(); j++) {
	    var gizmo = t.get_output(j);
	    if (!gizmo) continue;
	    var sprite = t.has_graphics() ? t.get_sprite(j) : null;
	    if (func(t,j,gizmo,sprite)) res.push([t, j, gizmo, sprite]);
	}
    }
    return res;
}
