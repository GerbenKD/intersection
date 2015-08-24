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

    var BUTTONS;

    BUTTONS = make_buttons();

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

/*
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
	case 120: redo(); break;
	default:
	    console.log("Pressed unknown key with keycode "+key);
	}
    }
*/

    function switch_state(new_state) {
	if (STATE==new_state) return;
	if (new_state=="normal") {
	    for (var b in BUTTONS) { BUTTONS[b].highlight(); }
	    HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	} else if (new_state == "animating") {
	    for (var b in BUTTONS) { BUTTONS[b].update_highlight(false); }
	    HIGHLIGHT_TARGETS = [];
	} else if (new_state == "dragging") {
	    HIGHLIGHT_TARGETS = State.pick_up_controlpoint(HIGHLIGHTED[1]);
	    sparkle();
	}
	STATE = new_state;
	highlight();
    }


    function undo() { 
	if (STATE!="normal") return; 
	switch_state("animating");
	State.undo(function() { switch_state("normal"); });
    }

    function redo() { 
	if (STATE!="normal") return; 
	switch_state("animating");
	State.redo(function() { switch_state("normal"); });
    }

    function rewind() {
	if (STATE!="normal") return;
	switch_state("animating");
	function rewind_rec() {
	    State.undo(function() { 
		if (State.can_undo()) rewind_rec(); else switch_state("normal"); 
	    });
	}
	rewind_rec();
    }

    function fforward() {
	if (STATE!="normal") return;
	switch_state("animating");
	function fforward_rec() {
	    State.redo(function() {
		if (State.can_redo()) fforward_rec(); else switch_state("normal");
	    });
	}
	fforward_rec();
    }

    function undo_continuation() { switch_state("normal"); }

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
	switch_state("animating");
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
	    switch_state("normal");
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
	} else if (EMBEDDING[3]==1 || EMBEDDING[3]==2) {
	    var stamp = STAMPS[EMBEDDING[0]];

	    // calculate the current bbox
	    var bbox = stamp.small_bbox;
	    var stampbarwidth = bbox[0]+bbox[2];
	    var fx = (EMBEDDING[1]-bbox[0])/bbox[2], fy = (EMBEDDING[2]-bbox[1])/bbox[3];
	    var width = (MOUSE[0]-stampbarwidth) / fx;
	    if (width < stampbarwidth) { 
		EMBEDDING[3]=1; // releasing the thing now will make it jump back
		width = bbox[2];
	    } else {
		EMBEDDING[3]=2; // releasing now will actually embed
		if (width > 0.5*Graphics.XS) width = 0.5*Graphics.XS;
	    }
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
	    var state = EMBEDDING[3];
	    if (state==1) {	
		State.remove_tool_and_cp(EMBEDDING[4]);
		State.redraw();
	    } else if (state==2) {
		drop_stamp();
	    }
	    EMBEDDING = undefined;
	    switch_state("normal");
	    if (state==0) switch_stamp(id);
	} else if (STATE == "dragging") {
	    drag_release();
	    DRAGGING = undefined;
	    switch_state("normal");
	}
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
	    switch_state("embedding");
	    return;
	}

	if (!HIGHLIGHTED) return;

	if (HIGHLIGHTED[0]==0) { 
	    // selected point is a control point, start dragging
	    var cp = HIGHLIGHTED[2];
	    DRAGGING = [HIGHLIGHTED[0], HIGHLIGHTED[1], cp.pos[0] - MOUSE[0], cp.pos[1] - MOUSE[1]];
	    switch_state("dragging");
	} else {
	    // toggle output status of the highlighted gizmo
	    State.create_undo_frame();
	    State.toggle_output(HIGHLIGHTED[0], HIGHLIGHTED[1]);
	}
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
	
	var screenheight = Graphics.YS * 0.03;
	var margin = screenheight * 0.5, padding = margin*0.2;

	var cos = Math.cos, sin = Math.sin, pi = Math.PI, sqrt = Math.sqrt;

	var svg_elt = Graphics.create_svg();

	var Button = new function() {
	    this.extend = function(constr) { constr.prototype = this; return new constr(); }

	    this.initialize = function(y0,x1) {
		var screenwidth = this.width * screenheight;
		this.svg_elt = Graphics.create_button([x1-screenwidth-padding, y0-padding, 
						       screenwidth +2*padding, screenheight+2*padding]);
		this.draw();
		var me = this;
		this.svg_elt.onclick = function() { me.action(); }
		return x1-screenwidth-margin;
	    }

	    // points are a list of points in the bbox[0,0,this.width,1], y=0 at bottom
	    this.draw_polygon = function(points) {
		var poly = Graphics.create_polygon();

		var res = "";
		for (var i=0; i<points.length; i++) {
		    if (i>0) res = res + " ";
		    res = res + (screenheight*points[i][0]+padding).toFixed(1) + ","
		        + (screenheight*(1-points[i][1])+padding).toFixed(1);
		}

		poly.setAttribute("points", res);
		this.svg_elt.appendChild(poly);
	    }


	    this.update_highlight = function(active) {
		if (!this.active && active) {
		    this.active = active;
		    this.svg_elt.classList.add("active");
		} else if (this.active && !active) {
		    this.active = active;
		    this.svg_elt.classList.remove("active");
		}
	    }

	}

	var Rewind = Button.extend(function() {
	    this.width = 1.6;

	    this.draw = function() {
		var w = this.width;
		var x1 = 0.1;           // left of leftmost triangle
		var x2 = 0.2;           // right of left rectangle
		var x3 = w-0.5*sqrt(3); // left of rightmost triangle
		var x4 = x1+0.5*sqrt(3) // right of leftmost triangle
		this.draw_polygon([[x3,0.5],[w,1],[w,0]]);
		this.draw_polygon([[x1,0.5],[x4,1],[x4,0]]);
		this.draw_polygon([[0,0],[0,1],[x2,1],[x2,0]]);
	    }


	    this.action = function() { rewind(); }

	    this.highlight = function() { this.update_highlight(State.can_undo()); }


	});

	var Undo = Button.extend(function() {
	    this.width = 0.5*sqrt(3);
	    
	    this.draw = function() {
		var w = this.width;
		this.draw_polygon([[0,0.5], [w, 0], [w, 1]]);
	    }

	    this.action = function() {
		undo();
		this.update_highlight();
	    }

	    this.highlight = function() { this.update_highlight(State.can_undo()); }

	});

	var Redo = Button.extend(function() {
	    this.width = 0.5*sqrt(3);
	    
	    this.draw = function() {
		var w = this.width;
		this.draw_polygon([[0,0], [0, 1], [w, 0.5]]);
	    }

	    this.action = function() {
		redo();
		this.highlight();
	    }

	    this.highlight = function() { this.update_highlight(State.can_redo()); }


	});

	var FForward = Button.extend(function() {
	    this.width = 1.6;

	    this.draw = function() {
		var w = this.width;
		var x1 = w-0.1-0.5*sqrt(3);
		var x2 = 0.5*sqrt(3);
		var x3 = w-0.2;
		var x4 = x1+0.5*sqrt(3);
		this.draw_polygon([[0,0],[0,1],[x2,0.5]]);
		this.draw_polygon([[x1,0],[x1,1],[x4,0.5]]);
		this.draw_polygon([[x3,0],[x3,1],[w,1],[w,0]]);
	    }


	    this.action = function() { fforward(); }
	    
	    this.highlight = function() { this.update_highlight(State.can_redo()); }

	});

	var FullScreen = Button.extend(function() {
	    this.width = 1;

	    this.draw = function() {
		var s = 0.05; // spacing between center and arrow
		var t = 0.15;  // line thickness

		// top-right
		this.draw_polygon([[0.5+s,0.5+s], [0.5+s+t,0.5+s], [1-t, 1-2*t], [1-t, 0.5+s], [1,0.5+s],
				   [1,1], [0.5+s,1], [0.5+s,1-t], [1-2*t,1-t], [0.5+s,0.5+s+t]]);

		// bottom-left
		this.draw_polygon([[0.5-s,0.5-s], [0.5-s-t, 0.5-s], [t, 2*t], [t,0.5-s], [0,0.5-s],
				   [0,0], [0.5-s,0], [0.5-s,t], [2*t,t], [0.5-s,0.5-s-t]]);

	    }


	    this.action = function() {
		console.log("Fullscreen clicked");
	    }

	    this.highlight = function() { this.update_highlight(true); }
	    
	});

	var y = Graphics.YS - screenheight - margin;
	var x = Graphics.XS - margin;


	var buttons = {
	    fullscreen: FullScreen,
	    fforward: FForward,
	    redo: Redo,
	    undo: Undo,
	    rewind: Rewind
	};
	for (var b in buttons) {
	    x = buttons[b].initialize(y, x);
	}

	return buttons;
    }
}
