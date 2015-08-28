"use strict";


function main() {

    var HIGHLIGHTED;            // [tool, output #]
    var HIGHLIGHT_TARGETS;
    var DRAGGING;               // [tool, output #, dx(mouse-origin), dy(mouse-origin)]. Tool should be ControlPointTool
    var EMBEDDING;              // [stamp, mousex, mousey, stage]
    var DISPLACING;
    var ZOOMING;
    var MOUSE = [0,0];          // [x,y]
    var STATE = "normal";       // one of normal, dragging, selecting_outputs or animating

    Graphics.reposition();


    var STAMPS = create_stamps(8);
    var CURRENT_STAMP = undefined;

    var BUTTONBAR = make_buttonbar();

    var stamp = Storage.getstr("current_stamp");
    switch_stamp(stamp ? (stamp|0) : 0);
    
    window.onwheel = function(e) {
	if (STATE != "normal" && STATE != "zooming") return;
	if (STATE != "zooming") {
	    ZOOMING = {
		mouse:                 [MOUSE[0], MOUSE[1]],
		magnification_target:  0,
		magnification_current: 0,
		opos:                  State.get_cp_positions()
	    };
	}
	ZOOMING.frames_left = 10;
	ZOOMING.magnification_target += e.deltaY < 0 ? 1 : -1;
	if (STATE != "zooming") {
	    switch_state("zooming");
	    Animation.run(Animation.sequential([zoom_animation, function() {
		register_cp_moves(ZOOMING.opos, ZOOMING.npos);
		ZOOMING = undefined;
		switch_state("normal");
		return false;
	    }]));
	}
    }

    function zoom_animation(frame) {
	ZOOMING.magnification_current += (ZOOMING.magnification_target - ZOOMING.magnification_current)/ZOOMING.frames_left;
	ZOOMING.frames_left--;
	var f = Math.exp(0.1*ZOOMING.magnification_current);
	ZOOMING.npos = ZOOMING.opos.scale_from_point(ZOOMING.mouse, f);
	ZOOMING.npos.move();
	State.redraw();
	return ZOOMING.frames_left > 0;
    }


    window.onresize = function() {
	Graphics.reposition();
	move_ruler(CURRENT_STAMP);
	BUTTONBAR.reposition();
	for (var i=0; i<STAMPS.length; i++) {
	    STAMPS[i].reposition(STAMPS.length);
	    STAMPS[i].redraw();
	}
	var body = document.getElementById("body");
	body.style["background-color"] = "white";
    }

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
    
    function mouseover(id) {
	if (STATE == "normal" && id!=CURRENT_STAMP) { Graphics.cursor("pointer"); }
    }

    function set_cursor() {
	var type = "default";
	if (STATE=="normal") {
	    if (HIGHLIGHTED) {
		type = HIGHLIGHTED[0]==0 ? "grab" : "pointer";
	    }
	} else if (STATE=="dragging" || STATE == "embedding") {
	    type = "grabbing";
	} else if (STATE == "displacing") {
	    type = "move";
	}
	Graphics.cursor(type);
    }

    function switch_state(new_state) {
	if (STATE==new_state) return;
	if (new_state=="normal") {
	    BUTTONBAR.rehighlight();
	    HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	} else if (new_state == "animating" || new_state == "zooming") {
	    BUTTONBAR.rehighlight(false);
	    HIGHLIGHT_TARGETS = [];
	} else if (new_state == "dragging") {
	    HIGHLIGHT_TARGETS = State.pick_up_controlpoint(HIGHLIGHTED[1]);
	    sparkle();
	} else if (new_state=="embedding") {
	    BUTTONBAR.rehighlight(false);
	    HIGHLIGHT_TARGETS = [];
	} else if (new_state=="displacing") {
	    HIGHLIGHT_TARGETS = [];
	}
	STATE = new_state;
	highlight();
	set_cursor();
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
	    }, 4);
	}
	rewind_rec();
    }

    function fforward() {
	if (STATE!="normal") return;
	switch_state("animating");
	function fforward_rec() {
	    State.redo(function() {
		if (State.can_redo()) fforward_rec(); else switch_state("normal");
	    }, 4);
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
	var bbox = stamp.small_bbox;
	var id;
	if (stamp_id < STAMPS.length-2) {
	    id = State.embed_file(stamp.filename, bbox);
	} else {
	    // create line or circle
	    var cx = bbox[0]+0.5*bbox[2], cy = bbox[1]+0.5*bbox[3];
	    if (stamp_id == STAMPS.length-2) {
		id = State.create_line([bbox[0]+0.35*bbox[2], cy], [bbox[0]+0.65*bbox[2], cy]);
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
	    cur_stamp.update_large_positions();
	    cur_stamp.update_small_positions();
	    State.save();
	    var step1 = cur_stamp.animate_shrink(gs);
	    var step2 = function() { 
		// WHEN: old focus has animated back into the toolbar
		cur_stamp.unfocus(); 
	    }
	    anims.push(Animation.sequential([step1, step2]));
	}

	var new_stamp = STAMPS[stamp_id];

	var pre_zoom_in = function() {
	    // WHEN: new stamp starts to grow from toolbar to main screen
 	    new_stamp.focus();
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
	var curs = false;
	if (HIGHLIGHTED && (!item || changed)) {
	    HIGHLIGHTED[2].set_class("highlighted", false);
	    curs = true;
	}
	if (item && (!HIGHLIGHTED || changed)) {
	    item[2].set_class("highlighted", true);
	    curs = true;
	}
	HIGHLIGHTED = item;
	if (curs) set_cursor();
    }

    function mousemove(id, e) {
	MOUSE = Graphics.e2coord(e);
	if (STATE == "embedding") {
	    mousemove_embed();
	} else if (STATE == "dragging") {
	    mousemove_drag();
	} else if (STATE == "normal") {
	    highlight();
	} else if (STATE == "displacing") {
	    displace();
	} 
    }

    function displace() {
	DISPLACING[2].translate([MOUSE[0]-DISPLACING[0], MOUSE[1]-DISPLACING[1]]).move();
	State.redraw();
    }

    function mousemove_embed() {
	var d0 = Graphics.SCALE * 0.005, d1 = Graphics.SCALE * 0.1;
	var dist = EMBEDDING.travelled + Point.distance_cc(MOUSE, EMBEDDING.last_mouse);
	EMBEDDING.last_mouse = [MOUSE[0], MOUSE[1]];
	EMBEDDING.travelled = dist;
	var stamp = STAMPS[EMBEDDING.stamp_id];
	if (EMBEDDING.state==0 && dist>=d0) EMBEDDING.state = 1;
	if (EMBEDDING.state>=1) {
	    var f = (dist - d0) / (d1 - d0); f = f<0 ? 0 : f > 1 ? 1 : f;
	    EMBEDDING.f = f;
	    if (EMBEDDING.state==1 && dist >= d1) EMBEDDING.state = 2; // it will be dropped
	    
	    // first calculate point_bbox (where the controlpoints should be in screen coords)
	    var small_bbox = stamp.small_bbox;
	    var magnx = 0.5*Graphics.XS / small_bbox[2];
	    var magny = 0.5*Graphics.YS / small_bbox[3];
	    var magn = f*Math.min(magnx, magny) + 1-f;
	    var point_bbox = [(small_bbox[0]-EMBEDDING.mouse[0])*magn+MOUSE[0],
			      (small_bbox[1]-EMBEDDING.mouse[1])*magn+MOUSE[1],
			      small_bbox[2]*magn,
			      small_bbox[3]*magn];

	    // now calculate the elt_bbox (the viewport, it grows faster and does not preserve aspect ratio)
	    var translated = [small_bbox[0]+MOUSE[0]-EMBEDDING.mouse[0],
			      small_bbox[1]+MOUSE[1]-EMBEDDING.mouse[1],
			      small_bbox[2], small_bbox[3]];
	    var screen_bbox = [small_bbox[0]*(1-f), 
			       small_bbox[1]*(1-f),
			       (1-f)*small_bbox[2]+f*Graphics.XS,
			       (1-f)*small_bbox[3]+f*Graphics.YS];

	    var curpos = stamp.small_positions.scale([0, 0, small_bbox[2], small_bbox[3]], 
						     [point_bbox[0]-screen_bbox[0], 
						      point_bbox[1]-screen_bbox[1],
						      point_bbox[2],
						      point_bbox[3]]);
	    EMBEDDING.current_positions = curpos;
	    curpos.move();

	    stamp.move(screen_bbox, stamp.STAMP_SCALE*(1-f) + f);
	}
    }

    function mousemove_drag(id) {
	State.drag_controlpoint([MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
	State.redraw();
	highlight();
    }

    function mouseup(id, e) {
	if (STATE == "embedding") {
	    switch (EMBEDDING.state) {
	    case 0: 
		EMBEDDING = undefined;
		switch_state("normal");
		switch_stamp(id);
		break;
	    case 1: // move stamp back to its home base
		switch_state("animating");
		var stamp = STAMPS[EMBEDDING.stamp_id];
		var anim = stamp.get_animation(stamp.graphics_state.bbox,   stamp.small_bbox,
					       EMBEDDING.current_positions, stamp.small_positions, 
					       EMBEDDING.f,                 stamp.STAMP_SCALE);
		Animation.run(Animation.sequential([anim, function() {
		    EMBEDDING = undefined;
		    switch_state("normal");
		    return false;
		}]));
		break;
	    case 2: 
		drop_stamp(); 
		EMBEDDING = undefined;
		switch_state("normal");
		break;
	    }
	} else if (STATE == "dragging") {
	    drag_release();
	    DRAGGING = undefined;
	    switch_state("normal");
	} else if (STATE=="displacing") {
	    drop_displacement();
	    DISPLACING = undefined;
	    switch_state("normal");
	}
    }

    function register_cp_moves(opos, npos) {
	for (var i=0; i<opos.pos.length; i++) {
	    if (!opos.pos[i]) continue;
	    State.register_change(["move_controlpoint", i, npos.pos[i]], ["move_controlpoint", i, opos.pos[i]]);
	}
    }

    function drop_displacement() {
	register_cp_moves(DISPLACING[2], DISPLACING[2].translate([MOUSE[0]-DISPLACING[0], MOUSE[1]-DISPLACING[1]]));
    }

    function drop_stamp() {
	var stamp = STAMPS[EMBEDDING.stamp_id];
	stamp.small_positions.move();
	stamp.move(stamp.small_bbox, stamp.STAMP_SCALE);
	var id = embed_stamp(EMBEDDING.stamp_id);
	var npos = EMBEDDING.current_positions;
	for (var i=0; i<npos.pos.length; i++) {
	    if (!npos.pos[i]) continue;
	    var inp = State.get_input(id, i);
	    State.move_controlpoint(inp[1], npos.pos[i]);
	}
	State.create_undo_frame();
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
	    var bbox = STAMPS[id].small_bbox;
	    EMBEDDING = {
		state: 0,
		stamp_id: id,
		mouse: [MOUSE[0], MOUSE[1]],
		last_mouse: [MOUSE[0], MOUSE[1]],
		travelled: 0
	    };
	    switch_state("embedding");
	    return;
	}

	if (!HIGHLIGHTED) {
	    // may initiate a displacement
	    DISPLACING = [MOUSE[0], MOUSE[1], State.get_cp_positions()];
	    switch_state("displacing");
	    return;
	}

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
	
	for (var i = 0; i < nstamps; i++) {
	    console.log("\nCreating stamp #"+(i+1));
	    var clz = i==nstamps-2 ? LineStamp : i==nstamps-1 ? CircleStamp : ConstructionStamp;
	    var stamp = clz.create(i); // , bbox);

	    (function (id) {
		var elt = stamp.get_svg_elt();
		elt.onmouseover = function(event) { mouseover(id, event); }
		elt.onmousedown = function(event) { mousedown(id, event); }
		elt.onmousemove = function(event) { mousemove(id, event); }
		elt.onmouseup   = function(event) { mouseup(id, event);   }
	    })(i);

	    stamp.unfocus(true);
	    stamp.reposition(nstamps);
	    stamp.redraw();
	    stamps.push(stamp);
	}

	return stamps;
    }

    function move_ruler(stamp_id) {
	var stamp_height = Graphics.YS / STAMPS.length;
	var stamp_width = stamp_height * 3/2;
	var ytop = stamp_height * stamp_id;
	var rulers = Graphics.get_rulers();
	Graphics.set_elt_bbox(rulers[0], [0,0,stamp_width,ytop]);
	Graphics.set_elt_bbox(rulers[1], [0, ytop+stamp_height, stamp_width, Graphics.YS-(ytop+stamp_height)]);
    }

    function make_buttonbar() {
	var cos = Math.cos, sin = Math.sin, pi = Math.PI, sqrt = Math.sqrt;
	var screenheight, margin, padding;

	var svg_elt = Graphics.create_svg();

	// points are a list of points in the bbox[0,0,this.width,1], y=0 at bottom
	function draw_polygon(poly, points) {
	    var res = "";
	    for (var i=0; i<points.length; i++) {
		if (i>0) res = res + " ";
		res = res + (screenheight*points[i][0]+padding).toFixed(1) + ","
		    + (screenheight*(1-points[i][1])+padding).toFixed(1);
	    }
	    poly.setAttribute("points", res);
	}


	var Button = new function() {
	    this.create = function(constr) {
		function hack() {
		    var me = this;
		    this.svg_elt = Graphics.create_button();
		    this.svg_elt.onclick = function() { me.action(); }
		    constr.call(this);
		}
		hack.prototype = this;
		return new hack();
	    }

	    this.make_polygon = function() {
		var poly = Graphics.create_polygon();
		this.svg_elt.appendChild(poly);
		return poly;
	    }

	    this.reposition = function() {
		screenheight = Graphics.YS * 0.03;
		margin = screenheight * 0.5;
		padding = margin*0.2;

		var y = Graphics.YS - screenheight - margin;
		var x = Graphics.XS - margin;

		for (var i=this.list.length-1; i>=0; i--) {
		    var screenwidth = this.list[i].width * screenheight;
		    var bbox = [x-screenwidth-padding, y-padding, 
				screenwidth +2*padding, screenheight+2*padding];
		    Graphics.set_elt_bbox(this.list[i].svg_elt, bbox);
		    this.list[i].draw();
		    x -= screenwidth + margin;
		}
	    }
	
	    this.rehighlight = function(state) {
		for (var i=0; i<this.list.length; i++) {
		    var hl = state==undefined ? this.list[i].is_highlighted() : state;
		    this.list[i].update_highlight(hl);
		}
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

	var Rewind = Button.create(function() {
	    this.width = 1.6;

	    var p1 = this.make_polygon();
	    var p2 = this.make_polygon();
	    var p3 = this.make_polygon();

	    this.draw = function() {
		var w = this.width;
		var x1 = 0.1;           // left of leftmost triangle
		var x2 = 0.2;           // right of left rectangle
		var x3 = w-0.5*sqrt(3); // left of rightmost triangle
		var x4 = x1+0.5*sqrt(3) // right of leftmost triangle
		draw_polygon(p1, [[x3,0.5],[w,1],[w,0]]);
		draw_polygon(p2, [[x1,0.5],[x4,1],[x4,0]]);
		draw_polygon(p3, [[0,0],[0,1],[x2,1],[x2,0]]);
	    }


	    this.action = function() { rewind(); }

	    this.is_highlighted = function() { return State.can_undo(); }


	});

	var Undo = Button.create(function() {
	    this.width = 0.5*sqrt(3);
	    
	    var p1 = this.make_polygon();

	    this.draw = function() {
		var w = this.width;
		draw_polygon(p1, [[0,0.5], [w, 0], [w, 1]]);
	    }

	    this.action = function() {
		undo();
		this.update_highlight(this.is_highlighted());
	    }

	    this.is_highlighted = function() { return State.can_undo(); }

	});

	var Redo = Button.create(function() {
	    this.width = 0.5*sqrt(3);
	     
	    var p1 = this.make_polygon();

	    this.draw = function() {
		var w = this.width;
		draw_polygon(p1, [[0,0], [0, 1], [w, 0.5]]);
	    }

	    this.action = function() {
		redo();
		this.update_highlight(this.is_highlighted());
	    }

	    this.is_highlighted = function() { return State.can_redo(); }


	});

	var FForward = Button.create(function() {
	    this.width = 1.6;

	    var p1 = this.make_polygon();
	    var p2 = this.make_polygon();
	    var p3 = this.make_polygon();

	    this.draw = function() {
		var w = this.width;
		var x1 = w-0.1-0.5*sqrt(3);
		var x2 = 0.5*sqrt(3);
		var x3 = w-0.2;
		var x4 = x1+0.5*sqrt(3);
		draw_polygon(p1, [[0,0],[0,1],[x2,0.5]]);
		draw_polygon(p2, [[x1,0],[x1,1],[x4,0.5]]);
		draw_polygon(p3, [[x3,0],[x3,1],[w,1],[w,0]]);
	    }


	    this.action = function() { fforward(); }
	    
	    this.is_highlighted = function() { return State.can_redo(); }
	});

	var FullScreen = Button.create(function() {
	    this.width = 1;

	    var p1 = this.make_polygon();
	    var p2 = this.make_polygon();

	    this.draw = function() {
		var s = 0.05; // spacing between center and arrow
		var t = 0.15;  // line thickness

		// top-right
		draw_polygon(p1, [[0.5+s,0.5+s], [0.5+s+t,0.5+s], [1-t, 1-2*t], [1-t, 0.5+s], [1,0.5+s],
				       [1,1], [0.5+s,1], [0.5+s,1-t], [1-2*t,1-t], [0.5+s,0.5+s+t]]);

		// bottom-left
		draw_polygon(p2, [[0.5-s,0.5-s], [0.5-s-t, 0.5-s], [t, 2*t], [t,0.5-s], [0,0.5-s],
				       [0,0], [0.5-s,0], [0.5-s,t], [2*t,t], [0.5-s,0.5-s-t]]);

	    }


	    this.action = function() {
		Graphics.toggle_fullscreen();
	    }

	    this.is_highlighted = function() { return true; }
	    
	});

	Button.list = [ Rewind, Undo, Redo, FForward, FullScreen ];
	Button.reposition();

	return Button;
    }
}
