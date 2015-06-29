"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS;
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE = [0,0];          // [x,y]
    var STATE = "normal";       // one of normal, dragging, selecting_outputs or animating
    var BUSY = false;
    Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu

    State.restore_state(post_animation);

    // Assume the user is not currently dragging. Keypresses during a drag are allowed to go wrong
    window.onkeypress = function(e) {
	var key = e.keyCode || e.charCode;

	if (BUSY) console.error("Attempted reentry in onkeypress while busy");

	BUSY = true;

	if (STATE == "normal") {
	    switch (key) {
	    case 48: State.switch_file("file_0", post_animation); break;
	    case 49: State.switch_file("file_1", post_animation); break;
	    case 50: State.switch_file("file_2", post_animation); break;
	    case 51: State.switch_file("file_3", post_animation); break;
	    case 52: State.switch_file("file_4", post_animation); break;
	    case 53: State.switch_file("file_5", post_animation); break;
	    case 54: State.switch_file("file_6", post_animation); break;
	    case 55: State.switch_file("file_7", post_animation); break;
	    case 56: State.switch_file("file_8", post_animation); break;
	    case 57: State.switch_file("file_9", post_animation); break;
	    case 41: State.clone_file("file_0", post_animation); break;
	    case 33: State.clone_file("file_1", post_animation); break;
	    case 64: State.clone_file("file_2", post_animation); break;
	    case 35: State.clone_file("file_3", post_animation); break;
	    case 36: State.clone_file("file_4", post_animation); break;
	    case 37: State.clone_file("file_5", post_animation); break;
	    case 94: State.clone_file("file_6", post_animation); break;
	    case 38: State.clone_file("file_7", post_animation); break;
	    case 42: State.clone_file("file_8", post_animation); break;
	    case 40: State.clone_file("file_9", post_animation); break;
	    case 186: State.create_undo_frame(); State.embed_file("file_0"); post_animation(); break;
	    case 161: State.create_undo_frame(); State.embed_file("file_1"); post_animation(); break;
	    case 8482: State.create_undo_frame();State.embed_file("file_2"); post_animation(); break;
	    case 163: State.create_undo_frame(); State.embed_file("file_3"); post_animation(); break;
	    case 162: State.create_undo_frame(); State.embed_file("file_4"); post_animation(); break;
	    case 8734: State.create_undo_frame();State.embed_file("file_5"); post_animation(); break;
	    case 167: State.create_undo_frame(); State.embed_file("file_6"); post_animation(); break;
	    case 182: State.create_undo_frame(); State.embed_file("file_7"); post_animation(); break;
	    case 8226: State.create_undo_frame();State.embed_file("file_8"); post_animation(); break;
	    case 170: State.create_undo_frame(); State.embed_file("file_9"); post_animation(); break;
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
		STATE = "animating";
		State.undo(post_animation);
		break;
	    case 120: // X, redo
		STATE = "animating";
		State.redo(post_animation);
		break;
	    default:
		console.log("Pressed unknown key with keycode "+key);
	    }
	}
	BUSY = false;
    }

    function post_animation() {
	State.redraw(); 
	HIGHLIGHT_TARGETS = State.get_controlpoints(); 
	highlight(); 
	STATE = "normal";
    }

    // A highlight target is [tool, socket, gizmo, sprite]. But we should not use that too much as it
    // should be private to State!

    /* set_highlight_targets unsparkles the old targets and resparkles the new highlight targets
       global variables:
       HIGHLIGHT_TARGETS
    */
    function sparkle() {
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    HIGHLIGHT_TARGETS[i][2].set_class("sparkly", true);
	}
    }
    
    function unsparkle() {
	for (var i=0; i<HIGHLIGHT_TARGETS.length; i++) {
	    HIGHLIGHT_TARGETS[i][2].set_class("sparkly", false);
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
		var affinity = gizmo.type != "point" ? 8 : gizmo.controlpoint ? 25 : 20;
		var d = gizmo.distance_to_c(MOUSE) - affinity;
		if (d < d_best) {
		    d_best = d;
		    i_best = i;
		}
	    }
	}
	if (d_best<=0) item = HIGHLIGHT_TARGETS[i_best];

	var changed = HIGHLIGHTED && item && !(item[0]===HIGHLIGHTED[0] && item[1]==HIGHLIGHTED[1]);
	if (HIGHLIGHTED && (!item || changed))        HIGHLIGHTED[2].set_class("highlighted", false);
	if (item        && (!HIGHLIGHTED || changed)) item[2].set_class("highlighted", true);
	HIGHLIGHTED = item;
    }

    window.onmousemove = function(e) {
	MOUSE = Graphics.e2coord(e);


	if (STATE == "dragging") {
	    State.drag_controlpoint([MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	    State.redraw();
	}

	else if (STATE=="normal" && e.ctrlKey) {
	    STATE = "selecting_outputs";
	    Graphics.add_class(Graphics.BODY, "select_outputs");
	    HIGHLIGHT_TARGETS = State.get_cool_outputs();
	}

	else if (STATE == "selecting_outputs" && !e.ctrlKey) {
	    STATE = "normal";
	    Graphics.remove_class(Graphics.BODY, "select_outputs");
	    HIGHLIGHT_TARGETS = State.get_controlpoints();
	}

	highlight();
    }

    window.onmouseup = function(e) {
	if (STATE != "dragging") return;
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
	DRAGGING = undefined;
	STATE = "normal";
	HIGHLIGHT_TARGETS = State.get_controlpoints();
	highlight();
    }


    window.onmousedown = function(e) {
	if (!HIGHLIGHTED) return;
	
	if (STATE == "normal") {
	    HIGHLIGHT_TARGETS = State.pick_up_controlpoint(HIGHLIGHTED[1]);
	    sparkle();
	    var cp = HIGHLIGHTED[2];
	    DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1]];
	    STATE = "dragging";
	}

	else if (STATE == "selecting_outputs") {
	    State.create_undo_frame();
	    State.toggle_output(HIGHLIGHTED[0], HIGHLIGHTED[1]);
	}
	highlight();
    }
}

