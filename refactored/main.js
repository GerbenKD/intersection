"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS = []; // tool outputs that should be highlighted
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE;                  // [x,y]

    var CP = ControlPointTool.create(); CP.add_graphics(1);
    var CT = CompoundTool.create();     CT.add_graphics(2);
   
    State.change("create_controlpoint", [3,4]);

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
	var i_best, d_best = Infinity;
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    var gizmo = HIGHLIGHT_TARGETS[i][2];
	    if (gizmo.valid) {
		var affinity = gizmo.type != "point" ? 5 : gizmo.controlpoint ? 15 : 10;
		var d = gizmo.distance_to_c(MOUSE) - affinity;
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

	var cpl = Tool.get_listeners(HIGHLIGHTED[0], HIGHLIGHTED[1], dep_tools);

	// first find all point outputs connected to the same tool as the one being dragged...
	var disqualified_outputs = {};
	for (var i=0; i<cpl.length; i++) {
	    var t = cpl[i][2]; // this tool is attached to the control point, via a tie or an input
	    var connections = t.incoming_connections();
	    for (var j=0; j<connections.length; j++) {
		var conn = connections[j];
		var id = conn[0].id;
		if (!disqualified_outputs[id]) disqualified_outputs[id] = {};
		disqualified_outputs[id][conn[1]] = true;
	    }
	}

	indep_tools.push(CP);
	HIGHLIGHT_TARGETS = select_outputs(indep_tools, function(tool,socket,gizmo,sprite) { 
	    if (gizmo.type != "point" || tool.get_tie(socket)) return false;
	    return !((tool.id in disqualified_outputs) && disqualified_outputs[tool.id][socket]);
	});

	var cp = HIGHLIGHTED[0].get_output(HIGHLIGHTED[1]);
	DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1], num_indep, cpl];
	apply_outputs(HIGHLIGHT_TARGETS, function(tool,socket,gizmo,sprite) { sprite.add_class("sparkly"); });
	highlight();
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
	    CT.recalculate(); 
	    CT.update_graphics();
	}
	DRAGGING = null;
	HIGHLIGHT_TARGETS = select_outputs([CP], function() { return true; }); // all controlpoints
	highlight();
    }


    /* cpl is list of connections from the controlpoint being snapped.
     * Each of them has to be rewired.
     *
     * target is the snap target [tool, output_socket]
     */
    function snap(cpl, target) {
	if (cpl.length==0) return;

	// rewire
	for (var i=0; i<cpl.length; i++) {
	    var conn = cpl[i]; // contains dst_tool and dst_socket
	    // conn = [CP, out_socket, tool, in_socket | out_socket, tie?]
	    if (conn[4]) {
		conn[2].untie(conn[3]);
		conn[2].tie(target[0], target[1], conn[3]);
	    } else {
		conn[2].disconnect(conn[3]);
		conn[2].connect(target[0], target[1], conn[3]);
	    }
	}

	// figure out the controlpointtool and relevant output socket
	var cp = cpl[0]; // get any connection from CP and the right output socket

	// destroy controlpoint
	cp[0].delete_output(cp[1]);

	CT.recalculate();
	// CT.find_duplicates(CP)
	tie_em_up(CT.find_duplicates(CP));
    }


    // map[left_tool_id + ":" + left_out_socket][right_tool_id] = info
    // info = [left_tool, right_tool, left_out_socket, left_index, right_index]
    function tie_em_up(map) {

	var entries = [];
	for (var left_key in map) {
	    var right_hash = map[left_key];
	    for (var right_key in right_hash) {
		var info = right_hash[right_key];
		entries.push(info);
	    }
	}
	entries.sort(function(a,b) { return (a[3]-b[3]) || (a[4]-b[4]); });

	var tied = 0;
	for (var i=0; i!=entries.length; i++) {
	    var info = entries[i]; 
	    var right_out_sockets = info[1].get_matching_outputs(info[0].get_output(info[2]));
	    if (right_out_sockets.length<1) console.error("Somehow a duplicate has disappeared?!");
	    for (var j=0; j<right_out_sockets.length; j++) {
		var right_out_socket = right_out_sockets[j];
		if (!info[1].get_tie(right_out_socket)) {
		    info[1].tie(info[0], info[2], right_out_socket);
		    tied++;
		}
	    }
	}
	console.log("Tied "+tied+" points together");
    }


}


function get_controlpoint_listeners(tools, out_connection) {
    var res = [];
    for (var i=0; i<tools.length; i++) {
	var t = tools[i];
	for (var j=0; j<t.max_input_socket(); j++) {
	    var connection=t.get_input(j);
	    if (connection && connection[0]===out_connection[0] && connection[1]==out_connection[1]) {
		res.push([t, j]);
	    }
	}
    }
    return res;
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
	    var sprite = t.has_graphics() && !t.get_tie(j) ? t.get_sprite(j) : undefined;
	    if (func(t,j,gizmo,sprite)) res.push([t, j, gizmo, sprite]);
	}
    }
    return res;
}
