"use strict";

function main() {

    var HIGHLIGHTED; // [tool, output #]
    var DRAGGING;    // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE;       // [x,y]

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
	    redraw();
	    break;
	case 50:
	    var circle = CircleTool.create();
	    CT.add_tool(circle);
	    circle.connect(CP, CP.add([mx, my]), 0);
	    circle.connect(CP, CP.add([mx+100, my]), 1);
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
	var res, have_target, tool;
	if (!DRAGGING) {
	    tool = CP;
	    res = tool.find_closest(MOUSE);
	    have_target = res[1]<=20;
	}
	if (HIGHLIGHTED && (!have_target || tool!=HIGHLIGHTED[0] || res[0]!=HIGHLIGHTED[1])) {
	    HIGHLIGHTED[0].highlight(HIGHLIGHTED[1], false);
	}
	if (have_target) {
	    HIGHLIGHTED = [tool, res[0]];
	    HIGHLIGHTED[0].highlight(HIGHLIGHTED[1], true);
	} else {
	    HIGHLIGHTED = null;
	}
    }

    window.onmousedown = function(e) {
	if (!HIGHLIGHTED) return;
	var num_indep = CT.separate(HIGHLIGHTED[0], HIGHLIGHTED[1]);
	console.log("I found "+num_indep+"/"+CT.tools.length+" independent tools whose outputs are snap targets");
	var cp = HIGHLIGHTED[0].get_output(HIGHLIGHTED[1]);
	DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1]];
	highlight();
    }

    window.onmousemove = function(e) {
	MOUSE = Graphics.e2coord(e);
	if (DRAGGING) {
	    var gizmo = DRAGGING[0].outputs[DRAGGING[1]];
	    gizmo.pos = [MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]];
	    redraw();
	} else {
	    highlight();
	}
    }

    window.onmouseup = function(e) {
	if (DRAGGING) DRAGGING = null;
	highlight();
    }
}
