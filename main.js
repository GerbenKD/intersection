"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS;
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var MOUSE = [0,0];          // [x,y]
    var STATE = "normal";       // one of normal, dragging, selecting_outputs or animating

    Graphics.BODY.oncontextmenu = function() { return false; } // disable right click menu

    State.restore_state(post_animation);

    // Assume the user is not currently dragging. Keypresses during a drag are allowed to go wrong
    window.onkeypress = function(e) {
	var key = e.keyCode || e.charCode;

	if (STATE == "normal") {
	    switch (key) {
	    case 48: switch_file("file_0"); break;
	    case 49: switch_file("file_1"); break;
	    case 50: switch_file("file_2"); break;
	    case 51: switch_file("file_3"); break;
	    case 52: switch_file("file_4"); break;
	    case 53: switch_file("file_5"); break;
	    case 54: switch_file("file_6"); break;
	    case 55: switch_file("file_7"); break;
	    case 56: switch_file("file_8"); break;
	    case 57: switch_file("file_9"); break;
	    case 41: clone_file("file_0"); break;
	    case 33: clone_file("file_1"); break;
	    case 64: clone_file("file_2"); break;
	    case 35: clone_file("file_3"); break;
	    case 36: clone_file("file_4"); break;
	    case 37: clone_file("file_5"); break;
	    case 94: clone_file("file_6"); break;
	    case 38: clone_file("file_7"); break;
	    case 42: clone_file("file_8"); break;
	    case 40: clone_file("file_9"); break;
	    case 186: embed_file("file_0"); break;
	    case 161: embed_file("file_1"); break;
	    case 8482:embed_file("file_2"); break;
	    case 163: embed_file("file_3"); break;
	    case 162: embed_file("file_4"); break;
	    case 8734:embed_file("file_5"); break;
	    case 167: embed_file("file_6"); break;
	    case 182: embed_file("file_7"); break;
	    case 8226:embed_file("file_8"); break;
	    case 170: embed_file("file_9"); break;
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
    }

    function switch_file(filename) {
	console.log("switching to "+filename);
	var current = localStorage.current_file;
	var file2tool = JSON.parse(localStorage.file2tool);
	if (filename==current) return;
	State.save(current);
	if (!(filename in file2tool)) { 
	    State.clear(post_animation);
	} else {
	    State.load(filename, post_animation);
	}
	localStorage.current_file = filename;
    }

    function clone_file(filename) {
	var current = localStorage.current_file;
	if (filename == current) return;
	console.log("Cloning into '"+filename+"'");
	State.save(current);
	State.save(filename);
	localStorage.current_file = filename;
    }

    function embed_file(filename) {
	console.log("Embedding '"+filename+"'");
	var ct = CompoundTool.create();
	CT.add(ct);
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
	if (HIGHLIGHTED && (!item || changed))        HIGHLIGHTED[3].remove_class("highlighted");
	if (item        && (!HIGHLIGHTED || changed)) item[3].add_class("highlighted");
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

