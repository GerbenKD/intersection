"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS;
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE;                  // [x,y]

    Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu

    // Assume the user is not currently dragging. Keypresses during a drag are allowed to go wrong
    window.onkeypress = function(e) {
	var key = e.keyCode || e.charCode;

	switch (key) {
	case 49: // 1, line
	    State.create_line([MOUSE[0]-100, MOUSE[1]], [MOUSE[0]+100,MOUSE[1]]);
	    State.create_undo_frame();
	    State.redraw();
	    HIGHLIGHT_TARGETS = State.get_controlpoints();
	    highlight();
	    break;
	case 50: // 2, circle
	    State.create_circle([MOUSE[0], MOUSE[1]], [MOUSE[0]+100,MOUSE[1]]);
	    State.create_undo_frame();
	    State.redraw();
	    HIGHLIGHT_TARGETS = State.get_controlpoints();
	    highlight();
	    break;
	case 122: // Z, undo
	    State.undo();
	    State.redraw();
	    HIGHLIGHT_TARGETS = State.get_controlpoints();
	    highlight();
	    break;
	case 120: // X, redo
	    State.redo();
	    State.redraw();
	    HIGHLIGHT_TARGETS = State.get_controlpoints();
	    highlight();
	    break;
	default:
	    console.log("Pressed unknown key with keycode "+key);
	}
	
    }

    // A highlight target is [tool, socket, gizmo, sprite]. But we should not use that too much as it
    // should be private to State!

    /* set_highlight_targets unsparkles the old targets and resparkles the new highlight targets
       global variables:
       HIGHLIGHT_TARGETS
    */
    function sparkle() {
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    HIGHLIGHT_TARGETS[i][3].add_class("sparkly");
	}
    }
    
    function unsparkle() {
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    HIGHLIGHT_TARGETS[i][3].remove_class("sparkly");
	}
    }
        
    function highlight() {
	if (!HIGHLIGHT_TARGETS) return;

	// determine what highlight target we're pointing at
	var item = null;
	var i_best, d_best = Infinity;
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    var gizmo = HIGHLIGHT_TARGETS[i][2];
	    if (gizmo.valid) {
		var affinity = gizmo.type != "point" ? 8 : gizmo.controlpoint ? 15 : 10;
		var d = gizmo.distance_to_c(MOUSE) - affinity;
		if (d < d_best) {
		    d_best = d;
		    i_best = i;
		}
	    }
	}
	if (d_best<=0) item = HIGHLIGHT_TARGETS[i_best];

	var changed = HIGHLIGHTED && item && !(item[0]===HIGHLIGHTED[0] && item[1]==HIGHLIGHTED[1]);
	if (HIGHLIGHTED && (!item || changed))        HIGHLIGHTED[3].remove_class("highlighted");
	if (item        && (!HIGHLIGHTED || changed)) item[3].add_class("highlighted");
	HIGHLIGHTED = item;
    }

    window.onmousemove = function(e) {
	MOUSE = Graphics.e2coord(e);
	if (DRAGGING) {
	    State.drag_controlpoint([MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	    State.redraw();
	}
	highlight();
    }

    window.onmouseup = function(e) {
	if (!DRAGGING) return;
	unsparkle();
	if (HIGHLIGHTED) {
	    State.snap(DRAGGING[1], HIGHLIGHTED[0], HIGHLIGHTED[1]);
	    State.redraw();
	} else {
	    State.release_controlpoint(DRAGGING[1], [MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	    // TODO could consider not creating an undo frame in this case!
	}
	State.create_undo_frame();
	DRAGGING = null;
	HIGHLIGHT_TARGETS = State.get_controlpoints();
	highlight();
    }


    window.onmousedown = function(e) {
	if (!HIGHLIGHTED) return;
	HIGHLIGHT_TARGETS = State.pick_up_controlpoint(HIGHLIGHTED[1]);
	sparkle();
	var cp = HIGHLIGHTED[2];
	DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1]];
	highlight();
    }
}

