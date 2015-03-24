"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS;
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE = [0,0];          // [x,y]
    var ANIMATING = false;

    Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu

    State.restore_state(post_animation);

    // Assume the user is not currently dragging. Keypresses during a drag are allowed to go wrong
    window.onkeypress = function(e) {
	var key = e.keyCode || e.charCode;

	if (!ANIMATING) {
	    switch (key) {
	    case 48: load(0); break;
	    case 49: load(1); break;
	    case 50: load(2); break;
	    case 51: load(3); break;
	    case 52: load(4); break;
	    case 53: load(5); break;
	    case 54: load(6); break;
	    case 55: load(7); break;
	    case 56: load(8); break;
	    case 57: load(9); break;
	    case 41: save(0); break;
	    case 33: save(1); break;
	    case 64: save(2); break;
	    case 35: save(3); break;
	    case 36: save(4); break;
	    case 37: save(5); break;
	    case 94: save(6); break;
	    case 38: save(7); break;
	    case 42: save(8); break;
	    case 40: save(9); break;
	    case 108: // 'l', line
		State.create_undo_frame();
		State.create_line([MOUSE[0]-100, MOUSE[1]], [MOUSE[0]+100,MOUSE[1]]);
		post_animation();
		break;
	    case 99: // 'c', circle
		State.create_undo_frame();
		State.create_circle([MOUSE[0], MOUSE[1]], [MOUSE[0]+100,MOUSE[1]]);
		post_animation();
		break;
	    case 122: // Z, undo
		ANIMATING = true;
		State.undo(post_animation);
		break;
	    case 120: // X, redo
		ANIMATING = true;
		State.redo(post_animation);
		break;
	    default:
		if (key >=48 && key<=57) {
		    console.log("loading!");
		    State.load("file_"+(key-48))
		    post_animation();
		} else {
		    console.log("Pressed unknown key with keycode "+key);
		}
	    }
	}
    }

    function load(slot) {
	console.log("Loading slot "+slot);
	State.load("file_"+slot, post_animation);
    }

    function save(slot) {
	console.log("Saving slot "+slot);
	State.save("file_"+slot);
    }


    function post_animation() {
	State.redraw(); 
	HIGHLIGHT_TARGETS = State.get_controlpoints(); 
	highlight(); 
	ANIMATING = false; 
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
	    State.create_undo_frame();
	    // State.release_controlpoint(DRAGGING[1], [MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	    State.snap(DRAGGING[1], HIGHLIGHTED[0], HIGHLIGHTED[1]);
	    State.redraw();
	} else {
	    if (!State.last_change_was_a_move()) State.create_undo_frame();
	    State.release_controlpoint(DRAGGING[1], [MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	}
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

