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

    make_buttons();

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
	case 49: switch_stamp(0); break;
	case 50: switch_stamp(1); break;
	case 51: switch_stamp(2); break;
	case 52: switch_stamp(3); break;
	case 53: switch_stamp(4); break;
	case 54: switch_stamp(5); break;
	case 122: undo(); break;
	case 120: // X, redo
	    STATE = "animating";
	    State.redo(undo_continuation);
	    break;
	default:
	    console.log("Pressed unknown key with keycode "+key);
	}
    }

    function nil() {}

    function undo() { STATE = "animating"; State.undo(undo_continuation); }
    function redo() { STATE = "animating"; State.redo(undo_continuation); }

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
	if (STATE != "normal" || stamp_id==CURRENT_STAMP || stamp_id >= STAMPS.length-2) return;
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
	    move_ruler(stamp_id);
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
	var old_state = STATE;
	STATE = "normal";
	if (old_state == "embedding") {
	    switch (EMBEDDING[3]) {
	    case 0: switch_stamp(id); break;
	    case 1: drop_stamp(); break;
	    }
	    EMBEDDING = undefined;
	} else if (old_state == "dragging") {
	    drag_release();
	    DRAGGING = undefined;
	}
	HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	highlight();
    }

    function drop_stamp() {
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
	State.create_undo_frame(); // make sure these controlpoint move events are not combined with the ones to follow
	State.redraw();
    }

    function drag_release() {
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

    function move_ruler(stamp_id) {
	var stamp_height = Graphics.YS / STAMPS.length;
	var stamp_width = stamp_height * 3/2;
	var ytop = stamp_height * stamp_id;
	Graphics.topruler([0, 0, stamp_width, ytop]);
	Graphics.bottomruler([0, ytop+stamp_height, stamp_width, Graphics.YS-(ytop+stamp_height)]);
    }

    function make_buttons() {
	var pi = Math.PI;

	// converts an array of [x,y] coordinates to a string for use in a svg polygon
	function to_str(size, r, points) {
	    var res = "";
	    for (var i=0; i<points.length; i++) {
		if (i>0) res = res + " ";
		res = res + (0.5*size*(1+r*points[i][0])).toFixed(1) + ","
		          + (0.5*size*(1-r*points[i][1])).toFixed(1);
	    }
	    return res;
	}

	function polygon(svg_ns, size, r, points) {
	    var poly = document.createElementNS(svg_ns, "polygon");
	    poly.setAttribute("points", to_str(size, r, points));
	    return poly;
	}



	function cos(a) { return Math.cos(a); }
	function sin(a) { return Math.sin(a); }

	Graphics.create_button(0, nil, function(svg_elt, svg_ns, size) {
	    var p1 = [-1, 0], p2 = [cos(5/3*pi),sin(5/3*pi)], p3 = [cos(1/3*pi),sin(1/3*pi)];
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[p1[0]+0.9,p1[1]],
							    [p2[0]+0.9,p2[1]],
							    [p3[0]+0.9,p3[1]]])); 
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[p1[0]-0.3,p1[1]],
							    [p2[0]-0.3,p2[1]],
							    [p3[0]-0.3,p3[1]]])); 
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[-1.5,-1],[-1.5,1],[-1.1,1],[-1.1,-1]]));
	});

	Graphics.create_button(1, undo, function(svg_elt, svg_ns, size) {
	    var p1 = [-1, 0], p2 = [cos(5/3*pi),sin(5/3*pi)], p3 = [cos(1/3*pi),sin(1/3*pi)];
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[p1[0],p1[1]],
							    [p2[0],p2[1]],
							    [p3[0],p3[1]]])); 
	});

	Graphics.create_button(2, redo, function(svg_elt, svg_ns, size) {
	    var p1 = [1, 0], p2 = [cos(2/3*pi),sin(2/3*pi)], p3 = [cos(-2/3*pi),sin(-2/3*pi)];
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[p1[0],p1[1]],
							    [p2[0],p2[1]],
							    [p3[0],p3[1]]])); 
	});

	Graphics.create_button(3, nil, function(svg_elt, svg_ns, size) {
	    var p1 = [1, 0], p2 = [cos(2/3*pi),sin(2/3*pi)], p3 = [cos(-2/3*pi),sin(-2/3*pi)];
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[p1[0]-0.9,p1[1]],
							    [p2[0]-0.9,p2[1]],
							    [p3[0]-0.9,p3[1]]])); 
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[p1[0]+0.3,p1[1]],
							    [p2[0]+0.3,p2[1]],
							    [p3[0]+0.3,p3[1]]])); 
	    svg_elt.appendChild(polygon(svg_ns, size, 0.6, [[1.5,-1],[1.5,1],[1.1,1],[1.1,-1]]));
	});

	Graphics.create_button(4, nil,function(svg_elt, svg_ns, size) {
	    svg_elt.appendChild(polygon(svg_ns, size, 0.8, [[0.1,0.1],[0.3,0.1],
							    [0.8,0.6], [0.8,0.1], [1,0.1],
							    [1,1], [0.1,1], [0.1,0.8],
							    [0.6,0.8], [0.1,0.3]]));
	    svg_elt.appendChild(polygon(svg_ns, size, 0.8, [[-0.1,-0.1],[-0.3,-0.1],
							    [-0.8,-0.6], [-0.8,-0.1], [-1,-0.1],
							    [-1,-1], [-0.1,-1], [-0.1,-0.8],
							    [-0.6,-0.8], [-0.1,-0.3]]));

	});
    }

}
