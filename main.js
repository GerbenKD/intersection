"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS;
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var EMBEDDING;              // [stamp, mousex, mousey, stage]
    var MOUSE = [0,0];          // [x,y]
    var STATE = "normal";       // one of normal, dragging, selecting_outputs or animating

    var STAMPS = create_stamps(8);
    var CURRENT_STAMP = undefined;

    var stamp = Storage.getstr("current_stamp");
    switch_stamp(stamp ? (stamp|0) : 0);
        


    /*

      drag een stamp:
      1. doe een embed
      2. vogel uit welke nieuwe controlpoints er bij de embedded tool horen (dwz, sockets van het main ii)
         C_change("embed") geeft het id terug van de embedded compoundtool,
	 die zn inputs zitten aan het input interface van de main construction, met dus de sockets waar we aan moeten schuiven.
      3. hou bij: de small_bbox van de stamp, de mouse position in small_bbox waar de drag begon
      4. op basis van de huidige muispositie, bepaal nieuwe bbox, en schaal de posities van de controlpoints van stap 2

      embed krijgt een bounding box als parameter, omdat dit in de undo informatie moet. 
     */

    window.onkeypress = function(e) {
	var key = e.keyCode || e.charCode;

	if (STATE != "normal") return;

	switch (key) {
	case 49: embed_stamp(0); break;
	case 50: embed_stamp(1); break;
	case 51: embed_stamp(2); break;
	case 52: embed_stamp(3); break;
	case 53: embed_stamp(4); break;
	case 54: embed_stamp(5); break;
	case 55: embed_stamp(6); break;
	case 56: embed_stamp(7); break;
	case 122: // Z, undo
	    STATE = "animating";
	    State.undo(undo_continuation);
	    break;
	case 120: // X, redo
	    STATE = "animating";
	    State.redo(undo_continuation);
	    break;
	case 116: // T, test
	    var stamp = STAMPS[0];
	    var test_bbox;
	    if (stamp.graphics_state.bbox[0] == stamp.small_bbox[0]) {
		test_bbox = [150,300,500,300];
	    } else {
		test_bbox = stamp.small_bbox;
	    }
	    stamp.set_bbox(test_bbox);
	    stamp.svg_object.svg_elt.style.opacity = 1;
	    break;
	default:
	    console.log("Pressed unknown key with keycode "+key);
	}
    }

    function undo_continuation() {
	STATE = "normal";
	HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	highlight();
    }

    /*
      stamp: manages construction, and links to the correct file but not savestate
      state: maps files to savestates, contains stamp and undobuffer
      main: talks to state and to stamp

      problem: load new construction, embed in the active stamp, animate to correct position.


      EMBEDDING:
      - change "move_controlpoint" event to "move_controlpoints". Event gets:
          [socket, old pos, newpos], ...

     */


    function embed_stamp(stamp_id) {
	State.create_undo_frame();
	var stamp = STAMPS[stamp_id];
	console.log("embed_stamp: stamp_id="+stamp_id+", stamp="+stamp);
	var bbox = stamp.small_bbox;
	var id;
	if (stamp_id < STAMPS.length-2) {
	    id = State.embed_file(stamp.filename, bbox);
	} else {
	    // create line or circle
	    var cx = bbox[0]+0.5*bbox[2], cy = bbox[1]+0.5*bbox[3];
	    if (stamp_id == STAMPS.length-2) {
		id = State.create_line([bbox[0]+0.1*bbox[2], cy], [bbox[0]+0.9*bbox[2], cy]);
	    } else {
		id = State.create_circle([cx, cy], [bbox[0]+0.8*bbox[2], cy]);
	    }
	}
	return id;
    }

    function switch_stamp(stamp_id) {
	if (STATE != "normal" || stamp_id==CURRENT_STAMP) return;
	console.log("switching from stamp "+CURRENT_STAMP+" to "+stamp_id);
	STATE = "animating";
	var gs = {};
	var anims = [];
	if (CURRENT_STAMP != undefined) {
	    var seq_anim = [];
	    // Move contents of main view to old stamp and unhide it
	    var cur_stamp = STAMPS[CURRENT_STAMP];
	    cur_stamp.update_cp_positions();
	    State.save();
	    var step1 = cur_stamp.animate_shrink(gs);
	    var step2 = function() { 
		// WHEN: old focus has animated back into the toolbar
		cur_stamp.svg_object.unfocus(); 
	    }
	    anims.push(Animation.sequential([step1, step2]));
	}

	var new_stamp = STAMPS[stamp_id];

	var pre_zoom_in = function() {
	    // WHEN: new stamp starts to grow from toolbar to main screen
 	    new_stamp.svg_object.focus();
	    if (stamp_id > 0              ) STAMPS[stamp_id-1].svg_object.add_class("bottomborder");
	    if (stamp_id < STAMPS.length-1) STAMPS[stamp_id+1].svg_object.add_class("topborder");
	};
	var do_zoom_in = new_stamp.animate_enlarge(gs);

	var zoom_in = Animation.sequential([pre_zoom_in, do_zoom_in]);
	anims.push(CURRENT_STAMP ? Animation.delay(zoom_in, 20) : zoom_in);

	var animate = Animation.parallel(anims);

	var finalize = function() {
	    // WHEN: all animations have completed
	    State.initialize(new_stamp);
	    CURRENT_STAMP = stamp_id;                   // in final continuation
	    Storage.setstr("current_stamp", stamp_id);
	    STATE = "normal";
	    HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	}

	Animation.run(Animation.sequential([animate, finalize]));
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
		var affinity = gizmo.type != "point" ? 8 : HIGHLIGHT_TARGETS[i][0]==0 ? 25 : 20;
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

    function mousemove(id, e) {
	MOUSE = Graphics.e2coord(e);
	if (STATE == "embedding") {
	    mousemove_embed(id);
	} else if (STATE == "dragging") {
	    mousemove_drag(id);
	} else if (STATE == "normal") {
	    highlight();
	}
    }

    function mousemove_embed(id) {
	if (EMBEDDING[3]==0) {
	    var dx = MOUSE[0] - EMBEDDING[1], dy = MOUSE[1] - EMBEDDING[2];
	    if (dx*dx+dy*dy>10*10) {
		EMBEDDING[3] = 1;
		console.log("Switching to stage 1");
		var stamp_id = EMBEDDING[0];
		var tool_id = embed_stamp(stamp_id);
		EMBEDDING[4] = tool_id;
		EMBEDDING[5] = State.get_cp_positions(tool_id);
		console.log("tool id = "+tool_id+", cp positions = "+JSON.stringify(EMBEDDING[5]));
		EMBEDDING[6] = STAMPS[stamp_id].small_bbox;
		State.redraw();
	    }
	} else if (EMBEDDING[3]==1) {
	    var stamp = STAMPS[EMBEDDING[0]];

	    // calculate the current bbox
	    var bbox = stamp.small_bbox;
	    var stampbarwidth = bbox[0]+bbox[2];
	    var fx = (EMBEDDING[1]-bbox[0])/bbox[2], fy = (EMBEDDING[2]-bbox[1])/bbox[3];
	    var width = (MOUSE[0]-stampbarwidth) / fx;
	    if (width < stampbarwidth) width = bbox[2]; else if (width > 0.5*Graphics.XS) width = 0.5*Graphics.XS;
	    var height = width / bbox[2] * bbox[3];
	    bbox = [MOUSE[0]-fx*width, MOUSE[1]-fy*height, width, height];

	    // TODO calculate dragging bbox here and everything will be awesome!
	    State.set_scaled_cp_positions(EMBEDDING[5], EMBEDDING[6], bbox);
	    State.redraw();
	}
    }

    function mousemove_drag(id) {
	State.drag_controlpoint([MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	State.redraw();
	highlight();
    }

    function mouseup(id, e) {
	if (STATE == "embedding") { 
	    STATE = "normal";
	    HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	    highlight();
	    if (EMBEDDING[3]==0) {
		console.log("This was actually a click!");
		EMBEDDING = undefined;
		if (id != CURRENT_STAMP) {
		    if (id < STAMPS.length-2) switch_stamp(id);
		    return;
		} 
	    } else if (EMBEDDING[3]==1) {
		console.log("dropping embedded construction");
		var opos = EMBEDDING[5];
		var cpos = State.get_cp_positions(EMBEDDING[4]);
		var changes = {};
		for (var i=0; i<opos.length; i++) {
		    var socket = opos[i][0], pos0=opos[i][1];
		    if (!changes[socket]) changes[socket] = [undefined, pos0]; else changes[socket][1] = pos0;
		}
		for (var i=0; i<cpos.length; i++) {
		    var socket = cpos[i][0], pos1=cpos[i][1];
		    if (!changes[socket]) changes[socket] = [pos1, undefined]; else changes[socket][0] = pos1;
		}
		for (var socket in changes) {
		    var pos0 = changes[socket][0], pos1 = changes[socket][1];
		    assert(pos0!=undefined && pos1!=undefined, "Inconsistent controlpoint change during embedding");
		    State.register_change(["move_controlpoint", socket, pos0], ["move_controlpoint", socket, pos1]);
		}
		State.redraw();
		EMBEDDING = undefined;
		HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
		console.log("dropped, highlight_targets = "+HIGHLIGHT_TARGETS.length+", state="+STATE);
		highlight();
	    }
	    return;
	}
	
	if (id != CURRENT_STAMP) return;
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
	HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	highlight();
    }

    function mousedown(id, e) {
	if (STATE != "normal") return;

	if (id != CURRENT_STAMP) {
	    // may initiate an embed, but it will only really start when the mouse has moved a sufficient distance
	    var stamp = STAMPS[id];
	    EMBEDDING = [id, MOUSE[0], MOUSE[1], 0];
	    STATE = "embedding";
	    HIGHLIGHT_TARGETS = [];
	    highlight();
	    console.log("Attempt to embed stamp "+(id+1));
	    return;
	}

	if (!HIGHLIGHTED) return;

	if (HIGHLIGHTED[0]==0) { 
	    // selected point is a control point, start dragging
	    HIGHLIGHT_TARGETS = State.pick_up_controlpoint(HIGHLIGHTED[1]);
	    sparkle();
	    var cp = HIGHLIGHTED[2];
	    DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1]];
	    STATE = "dragging";
	} else {
	    // toggle output status of the highlighted gizmo
	    State.create_undo_frame();
	    State.toggle_output(HIGHLIGHTED[0], HIGHLIGHTED[1]);
	}
	highlight();
    }

    function create_stamps(nstamps) {
	var stamps = [];
	var stamp_height  = Graphics.YS / nstamps;
	var stamp_width = stamp_height * 3/2;

	for (var i = 0; i < nstamps; i++) {
	    console.log("\nCreating stamp #"+(i+1));
	    var clz = i==nstamps-2 ? LineStamp : i==nstamps-1 ? CircleStamp : ConstructionStamp;
	    var bbox = [0, stamp_height*i, stamp_width, stamp_height];
	    var stamp = clz.create(i, bbox);

	    (function (id) {
		var elt = stamp.get_svg_elt();
		elt.onmousedown = function(event) { mousedown(id, event); }
		elt.onmousemove = function(event) { mousemove(id, event); }
		elt.onmouseup   = function(event) { mouseup(id, event);   }
	    })(i);

	    stamp.redraw();
	    stamps.push(stamp);
	}

	return stamps;
    }

}
