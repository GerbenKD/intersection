"use strict";


function main() {
    var MOUSE, MOUSE_STAMP, STATE, STAMPS, CURRENT_STAMP, BUTTONBAR;


    function switch_state(new_state) {
	if (STATE && STATE.leave) STATE.leave();
	STATE = new_state;
	if (STATE.enter) STATE.enter.apply(STATE, Array.prototype.slice.call(arguments, 1));
    }


    ///////////////////////////////////////// normal ///////////////////////////////////////////////////
    var normal = new function() {

	var HIGHLIGHT_TARGETS, HIGHLIGHTED;

	function reset_highlight_targets() {
	    HIGHLIGHT_TARGETS = State.get_all_highlight_targets();
	    highlight();
	}


	function highlight() {
	    var item = find_closest(HIGHLIGHT_TARGETS, MOUSE);
	    if (HIGHLIGHTED && item  ? !(item[0]==HIGHLIGHTED[0] && item[1]==HIGHLIGHTED[1]) : (HIGHLIGHTED || item)) {
		// change in highlighted item
		if (HIGHLIGHTED)  {
		    HIGHLIGHTED[2].set_class("highlighted", false); 
		    Graphics.cursor("default");
		} 
		if (item)         {
		    item[2].set_class("highlighted", true); 
		    Graphics.cursor(item[0]==0 ? "grab" : "pointer");
		} 

	    }
	    HIGHLIGHTED = item;
	}

	this.wheel = function(e) {
	    switch_state(zooming, {
		mouse:                 [MOUSE[0], MOUSE[1]],
		magnification_target:  0,
		magnification_current: 0,
		opos:                  State.get_cp_positions()
	    });
	    zooming.wheel(e);
	}

	this.mouseover = function(who, e) {
	    if (who.type=="stamp" && who!=CURRENT_STAMP) {
		switch_state(onstamp, who);
	    }
	}

	/* cursor during normal state:
	if (HIGHLIGHTED) {
		type = HIGHLIGHTED[0]==0 ? "grab" : "pointer";
	    }
	*/

	this.mousemove = function(who, e) {
	    if (who!==CURRENT_STAMP) return;
	    highlight();
	}

	this.mousedown = function(who, e) {
	    if      (!HIGHLIGHTED)      { switch_state(translate);                                }
	    else if (HIGHLIGHTED[0]==0) { switch_state(dragging, HIGHLIGHTED[1], HIGHLIGHTED[2]); }
	    else                        {
		// toggle output status of the highlighted gizmo
		State.create_undo_frame();
		State.toggle_output(HIGHLIGHTED[0], HIGHLIGHTED[1]);
		State.redraw();
	    }
	}

	this.enter = function() {
	    if (MOUSE_STAMP!==CURRENT_STAMP) { switch_state(onstamp, MOUSE_STAMP); return; }
	    BUTTONBAR.rehighlight(); // perhaps move some of that logic here
	    Graphics.cursor("default");
	    reset_highlight_targets(); 
	}

	this.leave = function() {
	    HIGHLIGHT_TARGETS = [];
	    highlight();
	}

    }();

    ///////////////////////////////////////// embedding ///////////////////////////////////////////////////
    var embedding = new function() {

	var EMBEDDING, STATE, HIGHLIGHT_TARGETS;
	// cursor type = "grabbing";

	function retreat_stamp() {
	    var stamp = EMBEDDING.stamp;
	    var anim = stamp.get_animation({ 
		positions: [EMBEDDING.current_positions.pos, stamp.small_positions.pos],
		bbox:      [stamp.graphics_state.bbox,   stamp.small_bbox],
		scale:     [EMBEDDING.f,                 stamp.STAMP_SCALE]});
	    var anim2 = Animation.add_callbacks(anim, undefined, function() {
		stamp.change_layer("top");
	    });
	    switch_state(animating, anim2, normal);
	}

	function embed_stamp(stamp) {
	    State.create_undo_frame();
	    var bbox = stamp.small_bbox;
	    var id;
	    if (!stamp.readonly) {
		id = State.embed_file(stamp.filename, bbox);
	    } else {
		// create line or circle
		var cx = bbox[0]+0.5*bbox[2], cy = bbox[1]+0.5*bbox[3];
		if (stamp.is_line) {
		    id = State.create_line([bbox[0]+0.35*bbox[2], cy], [bbox[0]+0.65*bbox[2], cy]);
		} else {
		    id = State.create_circle([cx, cy], [bbox[0]+0.8*bbox[2], cy]);
		}
	    }
	    return id;
	}


	function drop_stamp() {
	    var stamp = EMBEDDING.stamp;
	    stamp.change_layer("top");
	    stamp.small_positions.move();
	    stamp.move(stamp.small_bbox, stamp.STAMP_SCALE);
	    var id = embed_stamp(EMBEDDING.stamp);
	    var npos = EMBEDDING.current_positions;
	    for (var i=0; i<npos.pos.length; i++) {
		if (!npos.pos[i]) continue;
		var inp = State.get_input(id, i);
		State.move_controlpoint(inp[1], npos.pos[i]);
	    }
	    State.create_undo_frame();
	    State.redraw();
	    switch_state(normal);
	}

	this.mouseup = function(who, e) {
	    if (STATE == "insecure") retreat_stamp(); else drop_stamp();
	}

	this.mousemove = function(who, e) {
	    var d0 = Graphics.SCALE * 0.005, d1 = Graphics.SCALE * 0.1;
	    var dx = MOUSE[0]-EMBEDDING.last_mouse[0], dy = MOUSE[1]-EMBEDDING.last_mouse[1];
	    var dist = EMBEDDING.travelled + Math.sqrt(dx*dx+dy*dy);
	    EMBEDDING.last_mouse = [MOUSE[0], MOUSE[1]];
	    EMBEDDING.travelled = dist;

	    var f = (dist - d0) / (d1 - d0); f = f<0 ? 0 : f > 1 ? 1 : f;
	    EMBEDDING.f = f;
	    if (STATE=="insecure" && dist >= d1) STATE = "confident"; // it will be dropped
	    
	    // first calculate point_bbox (where the controlpoints should be in screen coords)
	    var small_bbox = EMBEDDING.stamp.small_bbox;
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

	    var curpos = EMBEDDING.stamp.small_positions.scale([0, 0, small_bbox[2], small_bbox[3]], 
						     [point_bbox[0]-screen_bbox[0], 
						      point_bbox[1]-screen_bbox[1],
						      point_bbox[2],
						      point_bbox[3]]);
	    EMBEDDING.current_positions = curpos;
	    curpos.move();
	    EMBEDDING.stamp.move(screen_bbox, EMBEDDING.stamp.STAMP_SCALE*(1-f) + f);
	}


	this.enter = function(emb) {
	    emb.f = 0;
	    EMBEDDING = emb;
	    BUTTONBAR.rehighlight(false);
	    STATE = "insecure";
	    emb.stamp.change_layer("middle");
	    HIGHLIGHT_TARGETS = State.get_all_snap_targets();
	    sparkle(HIGHLIGHT_TARGETS, true);
	    // highlight();
	}

	this.leave = function() {
	    sparkle(HIGHLIGHT_TARGETS, false);
	    HIGHLIGHT_TARGETS = undefined;
	    MOUSE_STAMP = CURRENT_STAMP; // TODO: UGLY HACK! To fix mouse pointer
	}

    }();

    ///////////////////////////////////////// onstamp ///////////////////////////////////////////////////
    var onstamp = new function() {

	var HIGHLIGHTED, EMBEDDING;

	this.mouseover = function(who, e) {
	    if (who.type=="stamp") {
		dehighlight();
		if (who===CURRENT_STAMP) {
		    switch_state(normal); 
		} else {
		    highlight(who);
		}
	    }
	}
	

	function click_stamp(stamp) { 
	    if (stamp.readonly) return;
	    var anim = switch_stamp(stamp);
	    switch_state(animating, anim, normal);
	}



	this.mousedown = function(who, e) {
	    if (who.graphics_state.state == "workstamp") {
		click_stamp(who);
		// cannot embed, so switch to it
	    } else {
		EMBEDDING = {
		    stamp: who,
		    mouse: [MOUSE[0], MOUSE[1]],
		    last_mouse: [MOUSE[0], MOUSE[1]],
		    travelled: 0
		};
		Graphics.cursor("grabbing");
	    }
	}

	this.mouseup = function(who, e) {
	    EMBEDDING = undefined;
	    click_stamp(who);
	}

	this.mousemove = function(who, e) {
	    if (!EMBEDDING) return;
	    var dx = MOUSE[0]-EMBEDDING.last_mouse[0], dy = MOUSE[1]-EMBEDDING.last_mouse[1];
	    var dist = EMBEDDING.travelled + Math.sqrt(dx*dx+dy*dy);
	    EMBEDDING.last_mouse = [MOUSE[0], MOUSE[1]];
	    EMBEDDING.travelled = dist;
	    if (dist > Graphics.SCALE * 0.005) {
		switch_state(embedding, EMBEDDING);
	    }
	}

	function highlight(stamp) {
	    if (stamp) { 
		stamp.div_object.add_class("highlighted"); HIGHLIGHTED = stamp; 
		Graphics.cursor(stamp.graphics_state.state=="toolstamp" ? "grab" : "pointer");
	    }

	}
	
	function dehighlight() {
	    if (HIGHLIGHTED) { HIGHLIGHTED.div_object.remove_class("highlighted"); HIGHLIGHTED = undefined; } 
	}

	this.enter = function(who) { highlight(who); }
	this.leave = function()    { EMBEDDING = undefined; dehighlight(); }

    }();

    ///////////////////////////////////////// translate ///////////////////////////////////////////////////
    var translate = new function() {

	var STARTPOS, CP_POS;

	this.mousemove = function(who, e) {
	    CP_POS.translate([MOUSE[0]-STARTPOS[0], MOUSE[1]-STARTPOS[1]]).move();
	    State.redraw();
	}

	this.mouseup = function(who, e) {
	    register_cp_moves(CP_POS, CP_POS.translate([MOUSE[0]-STARTPOS[0], MOUSE[1]-STARTPOS[1]]));
	    switch_state(normal);
	}

	this.enter = function() {
	    Graphics.cursor("move");
	    BUTTONBAR.rehighlight(false); 
	    STARTPOS = [MOUSE[0], MOUSE[1]];
	    CP_POS = State.get_cp_positions();
	}


	this.leave = function() {
	    STARTPOS = undefined; 
	    CP_POS = undefined;
	}
	
    }();

    ///////////////////////////////////////// zooming ///////////////////////////////////////////////////
    var zooming = new function() {
	var ZOOMING;
	
	this.wheel = function(e) {
	    ZOOMING.frames_left = 10;
	    ZOOMING.magnification_target += e.deltaY < 0 ? 1 : -1;
	}

	this.enter = function(zooming) {
	    BUTTONBAR.rehighlight(false);
	    ZOOMING = zooming;
	    Animation.run(Animation.add_callbacks(zoom_animation, undefined, function() {
		register_cp_moves(ZOOMING.opos, ZOOMING.npos);
		switch_state(normal);
	    }));

	    function zoom_animation(frame) {
		ZOOMING.magnification_current += (ZOOMING.magnification_target - ZOOMING.magnification_current)/ZOOMING.frames_left;
		ZOOMING.frames_left--;
		var f = Math.exp(0.1*ZOOMING.magnification_current);
		ZOOMING.npos = ZOOMING.opos.scale_from_point(ZOOMING.mouse, f);
		ZOOMING.npos.move();
		State.redraw();
		return ZOOMING.frames_left > 0;
	    }
	}

	this.leave = function() { ZOOMING = undefined; }
    }();

    ///////////////////////////////////////// dragging ///////////////////////////////////////////////////
    var dragging = new function() {

	// cursor type = "grabbing";

	var HIGHLIGHT_TARGETS, HIGHLIGHTED;
	var CP_SOCKET, DX, DY;
	
	function highlight() {
	    var item = find_closest(HIGHLIGHT_TARGETS, [MOUSE[0]+DX, MOUSE[1]+DY]);
	    if (!HIGHLIGHTED && item) { State.get_controlpoint(CP_SOCKET).set_class("snappy", true); }
	    if (HIGHLIGHTED && !item) { State.get_controlpoint(CP_SOCKET).set_class("snappy", false); }
	    HIGHLIGHTED = item;
	}

	this.mouseup = function(who, e) {
	    if (HIGHLIGHTED) {
		State.create_undo_frame();
		// State.release_controlpoint(CP_SOCKET, [MOUSE[0]+DRAGGING[2], MOUSE[1]+DRAGGING[3]]);
		console.log("snapping socket "+CP_SOCKET+" to tool="+HIGHLIGHTED[0]+", socket="+HIGHLIGHTED[1]);
		State.snap(CP_SOCKET, HIGHLIGHTED[0], HIGHLIGHTED[1]);
		HIGHLIGHTED = undefined;
		State.redraw();
	    } else {
		if (!State.last_change_was_a_move()) State.create_undo_frame();
		State.release_controlpoint(CP_SOCKET, [MOUSE[0]+DX, MOUSE[1]+DY]);
	    }
	    switch_state(normal);
	}

	this.mousemove = function(who, e) {
	    if (who!=CURRENT_STAMP) return;
	    State.drag_controlpoint([MOUSE[0]+DX, MOUSE[1]+DY]);
	    highlight();
	    State.redraw();
	}

	this.enter = function(cp_socket, cp_gizmo) {
	    CP_SOCKET = cp_socket;
	    DX = cp_gizmo.pos[0].re - MOUSE[0];
	    DY = cp_gizmo.pos[1].re - MOUSE[1];
	    HIGHLIGHT_TARGETS = State.pick_up_controlpoint(CP_SOCKET);
	    sparkle(HIGHLIGHT_TARGETS, true);	
	    Graphics.cursor("grabbing");
	    highlight();
	}

	this.leave = function() {
	    sparkle(HIGHLIGHT_TARGETS, false);
	    HIGHLIGHT_TARGETS = [];
	    highlight();
	}

    }();

    ///////////////////////////////////////// animating ///////////////////////////////////////////////////
    var animating = new function() {

	this.enter = function(anim, nextstate) {
	    BUTTONBAR.rehighlight(false); 
	    Animation.run(Animation.add_callbacks(anim, undefined, function() { switch_state(nextstate); }));
	}
    }();


    ///////////////////////////////////////// event handlers ///////////////////////////////////////////////////


    window.onwheel = function(e) { if (STATE.wheel) STATE.wheel(e); }
   
    window.onresize = function() { 
	Graphics.reposition();
	BUTTONBAR.reposition();
	for (var i=0; i<STAMPS.length; i++) {
	    STAMPS[i].reposition(STAMPS.length);
	    STAMPS[i].redraw();
	}
    }
      
    window.onkeypress = function(e) {
	var key = e.keyCode || e.charCode;
	switch (key) {
	case  49: switch_stamp(STAMPS[0]); break;
	case  50: switch_stamp(STAMPS[1]); break;
	case  51: switch_stamp(STAMPS[2]); break;
	case  52: switch_stamp(STAMPS[3]); break;
	case  53: switch_stamp(STAMPS[4]); break;
	case  54: switch_stamp(STAMPS[5]); break;
	case 122: undo(); break;
	case 120: redo(); break;
	default:
	    console.log("Pressed unknown key with keycode "+key);
	}
    }

    ///////////////////////////////////////// helpers ///////////////////////////////////////////////////



    function switch_stamp(stamp) {
	var gs = {};
	var anims = [];
	if (CURRENT_STAMP) {
	    var seq_anim = [];
	    // Move contents of main view to old stamp and unhide it
	    CURRENT_STAMP.update_large_positions();
	    CURRENT_STAMP.update_small_positions();
	    State.save();
	    anims.push(Animation.add_callbacks(CURRENT_STAMP.animate_shrink(gs), undefined, function() {
		CURRENT_STAMP.unfocus(); CURRENT_STAMP.redraw(); 
	    }));
	}

	var zoom_in = Animation.add_callbacks(stamp.animate_enlarge(gs), function() { stamp.focus(); });
	anims.push(CURRENT_STAMP ? Animation.delay(zoom_in, 20) : zoom_in);

	var animate = Animation.parallel(anims);

	var finalize = function() {
	    State.initialize(stamp);
	    CURRENT_STAMP = stamp;                   // in final continuation
	    Storage.setstr("current_stamp", stamp.id);
	}

	return Animation.add_callbacks(animate, undefined, finalize);
    }

    function undo() { switch_state(animating, State.undo(), normal ); }

    function redo() { switch_state(animating, State.redo(), normal ); }

    function rewind() { 
	switch_state(animating, rewind_rec(30), normal ); 
	function rewind_rec(speed) {
	    if (!State.can_undo()) return function() { return false; }
	    return Animation.continuation(State.undo(speed), function() {
		return rewind_rec(speed+30);
	    });
	}
    }

    function fforward() { 
	switch_state(animating, fforward_rec(30), normal); 
	function fforward_rec(speed) {
	    if (!State.can_redo()) return function() { return false; }
	    return Animation.continuation(State.redo(speed), function() {
		return fforward_rec(speed+30);
	    });
	}
    }


    function find_closest(targets, pos) {
	var cpos = [Cplx.create(pos[0],0), Cplx.create(pos[1],0)];
	var i_best, d_best = Infinity;
	for (var i=0; i<targets.length; i++) {
	    var gizmo = targets[i][2];
	    if (gizmo.is_visible()) {
		var affinity = gizmo.type != "point" ? 8 : targets[i][0]==0 ? 25 : 20;
		var d2c = gizmo.distance_to_c(cpos);
		var d = d2c ? d2c.abs()-affinity : Infinity;
		if (d < d_best) {
		    d_best = d;
		    i_best = i;
		}
	    }
	}
	return d_best<=0 ? targets[i_best] : undefined;
    }

    function sparkle(targets, onoff) {
	for (var i=0; i<targets.length; i++) {
	    targets[i][2].set_class("sparkly", onoff);
	}
    }
    

    function register_cp_moves(opos, npos) {
	for (var i=0; i<opos.pos.length; i++) {
	    if (!opos.pos[i]) continue;
	    State.register_change(["move_controlpoint", i, npos.pos[i]], ["move_controlpoint", i, opos.pos[i]]);
	}
    }

    ///////////////////////////////////////// main ///////////////////////////////////////////////////
    Graphics.reposition();

    MOUSE = [0,0];          // [x,y]
    STAMPS = create_stamps(9);
    CURRENT_STAMP = undefined;
    BUTTONBAR = make_buttonbar();

    var stamp_id = Storage.getstr("current_stamp");
    var anim = switch_stamp(STAMPS[stamp_id ? (stamp_id|0) : 0]);
    switch_state(animating, anim, normal);
    
    function create_stamps(nstamps) {
	var stamps = [];
	
	for (var i = 0; i < nstamps; i++) {
	    console.log("\nCreating stamp #"+(i+1));
	    var clz = i==nstamps-2 ? LineStamp : i==nstamps-1 ? CircleStamp : ConstructionStamp;
	    var stamp = clz.create(i); // , bbox);

	    (function (who) {
		function handle(event, handler) { 
		    MOUSE = Graphics.e2coord(event); 
		    MOUSE_STAMP = who; 
		    if (STATE[handler]) STATE[handler].call(STATE, who, event);
		}
		var elt = stamp.svg_object.elt;
		elt.onmouseover = function(event) { handle(event, "mouseover"); }
		elt.onmousedown = function(event) { handle(event, "mousedown"); }
		elt.onmousemove = function(event) { handle(event, "mousemove"); }
		elt.onmouseup   = function(event) { handle(event, "mouseup");   }
	    })(stamp);

	    stamp.unfocus();
	    stamp.reposition(nstamps);
	    stamp.redraw();
	    stamps.push(stamp);
	}

	return stamps;
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

		var o = Graphics.is_fullscreen() ? 0.5+s : 0;

		// top-right
		draw_polygon(p1, [[0.5+s-o,0.5+s-o], [0.5+s+t-o,0.5+s-o], [1-t-o, 1-2*t-o], [1-t-o, 0.5+s-o], [1-o,0.5+s-o],
				       [1-o,1-o], [0.5+s-o,1-o], [0.5+s-o,1-t-o], [1-2*t-o,1-t-o], [0.5+s-o,0.5+s+t-o]]);

		// bottom-left
		draw_polygon(p2, [[0.5-s+o,0.5-s+o], [0.5-s-t+o, 0.5-s+o], [t+o, 2*t+o], [t+o,0.5-s+o], [o,0.5-s+o],
				       [0+o,0+o], [0.5-s+o,0+o], [0.5-s+o,t+o], [2*t+o,t+o], [0.5-s+o,0.5-s-t+o]]);
		
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
