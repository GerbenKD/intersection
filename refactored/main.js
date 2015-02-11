"use strict";

function main() {

	var HIGHLIGHTED; // [tool, output #]
	var DRAGGING;    // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
	var MOUSE;       // [x,y]

	var CP = ControlPointTool.create({visible: true});
	var TCP = ControlPointTool.create({visible: true, is_tool: true});


	var tools = [CP, TCP];

	Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu

	window.onkeypress = function(e) {
		var mx = MOUSE[0], my = MOUSE[1];
		var key = e.keyCode || e.charCode;

		switch (key) {
		case 48: 
			CP.add(mx, my);
			redraw();
			break;
		case 49:
			if (TCP.connected()) { console.log("First connect the previous tool"); break; }
			var socket1 = TCP.add(mx-100, my);
			var socket2 = TCP.add(mx+100, my);
			var line = LineTool.create({visible: true});
			tools.push(line);
			line.connect(TCP, socket1, 0);
			line.connect(TCP, socket2, 1);
			redraw();
			break;
		case 50:
			if (TCP.connected()) { console.log("First connect the previous tool"); break; }
			var socket1 = TCP.add(mx, my);
			var socket2 = TCP.add(mx+100, my);
			var circle = CircleTool.create({visible: true});
			tools.push(circle);
			circle.connect(TCP, socket1, 0);
			circle.connect(TCP, socket2, 1);
			redraw();

			break;
		}
	}

	function redraw() {
		for (var i=0; i<tools.length; i++) {
			if (tools[i].recalculate) tools[i].recalculate();
			if (tools[i].visible)     tools[i].update_graphics();
		}
		highlight();
	}

	function highlight() {
		var res, have_target, tool;
		if (!DRAGGING) {
			tool = CP;
			res = tool.find_closest(MOUSE[0], MOUSE[1]);
			have_target = res[1]<=20;
			if (!have_target) {
				tool = TCP;
				res = tool.find_closest(MOUSE[0], MOUSE[1]);
				have_target = res[1]<=20;
			}
		}
		if (HIGHLIGHTED && (!have_target || tool!=HIGHLIGHTED[0] || res[0]!=HIGHLIGHTED[1])) {
			HIGHLIGHTED[0].outputs[HIGHLIGHTED[1]].remove_class("highlighted");
		}
		if (have_target) {
			HIGHLIGHTED = [tool, res[0]];
			HIGHLIGHTED[0].outputs[HIGHLIGHTED[1]].add_class("highlighted");
		} else {
			HIGHLIGHTED = null;
		}
	}

	window.onmousedown = function(e) {
		if (!HIGHLIGHTED) return;
		var cp = HIGHLIGHTED[0].outputs[HIGHLIGHTED[1]];
		DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.x - MOUSE[0], cp.y - MOUSE[1]];
		highlight();
	}

	window.onmousemove = function(e) {
		MOUSE = Graphics.e2coord(e);
		if (DRAGGING) {
			var gizmo = DRAGGING[0].outputs[DRAGGING[1]];
			gizmo.x = MOUSE[0]+DRAGGING[2];
			gizmo.y = MOUSE[1]+DRAGGING[3];
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
