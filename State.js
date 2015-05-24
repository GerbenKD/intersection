"use strict";



function Reset() {
    for (var key in localStorage) {
	if (key == "current_file" || key == "file2savestate" || key.lastIndexOf("savestate_",0)==0) {
	    delete localStorage[key];
	}
    }
}

var State = new function() {

    var UNDO;

    /* --------------------------------------- Load/save --------------------------------------- */ 

    /* localState has the following structure:

       current_file         : name of the currently edited file
       savestate_<n>       : saved savestate
       savestate_<n>_ref   : reference count of savestate_<n>
       file2savestate      : { filename: savestatename }
    */

 

    this.restore_state = function(continuation) {
	if (!Storage.haskey("file2savestate")) Storage.setobj("file2savestate", {});
	if (!Storage.haskey("current_file")) Storage.setstr("current_file", "file_0");
	var filename = Storage.getstr("current_file");
	var savestate = Storage.get_file(filename);
	if (savestate) {
	    initialize.call(this, savestate);
	    continuation();
	} else {
	    this.clear(continuation);
	}
    }

    this.clear = function(continuation) {
	console.log("Creating new construction");
	var savestate = [[], { buffer:  [],
			       current: [],
			       current_stored: [],
			       index: 0
			     }];
	initialize.call(this, savestate);
	continuation();
    }
    
    this.load = function(filename, continuation) {
	var savestate = Storage.get_file(filename);
	if (!savestate) return false;
	initialize.call(this, savestate);
	continuation();
	return true;
    }

    function new_savestate_name() {
	var i = 0;
	var name;
	while (true) {
	    name = "savestate_"+i;
	    if (!(name in localStorage)) return name;
	    i++;
	}
    }

    // returns a list of savestates that are referenced by the given savestate
    function get_references(savestate) {
	var undobuffer = savestate[1];
	var refs = {};
	for (var i=0; i<undobuffer.buffer.length; i++) {
	    add_refs(undobuffer.buffer[i]);
	}
	add_refs(undobuffer.current);
	add_refs(undobuffer.current_stored);

	return Object.keys(refs);

	function add_refs(frame) {
	    for (var i=0; i<frame.length; i++) {
		var change = frame[i][0];
		if (change[0]=="embed") refs[change[1]] = true;
	    }
	}
    }

    function remove_reference(savestatename) {
	var refname = savestatename+"_ref";
	var nref = Storage.getstr(refname);
	if (nref>1) { Storage.setstr(refname, nref-1); return; }
	var savestate = Storage.getobj(savestatename);
	if (savestate) {
	    var refs = get_references(savestate);
	    for (var i=0; i<refs.length; i++) {
		remove_reference(refs[i]);
	    }
	    Storage.remove(savestatename);
	}
	Storage.remove(refname);
    }

    function add_reference(savestatename) {
	var refname = savestatename+"_ref";
	var nref = Storage.getstr(refname);
	if (nref != null) { Storage.setstr(refname, nref+1); return; }
	Storage.setstr(refname, 1);
	var refs = get_references(Storage.getobj(savestatename));
	for (var i=0; i<refs.length; i++) {
	    add_reference(refs[i]);
	}
    }

    function save(filename) {
	var file2savestate = Storage.getobj("file2savestate");
	var old_savestatename = file2savestate[filename];
	var savestatename = new_savestate_name();
	file2savestate[filename] = savestatename;
	Storage.setobj("file2savestate", file2savestate);
	console.log("saving buffer as '"+savestatename+"'");
	Storage.setobj(savestatename, [0, UNDO]);//CP.get_socket_list(), UNDO]);
	add_reference(savestatename);
	remove_reference(old_savestatename);
    }

    this.switch_file = function(filename, continuation) {
	var current = Storage.getstr("current_file");
	if (filename==current) return;
	console.log("Switching to "+filename);
	save(current);
	var savestate = Storage.get_file(filename);
	if (savestate) {
	    initialize.call(this,savestate);
	    continuation();
	} else {
	    this.clear(continuation);
	}
	Storage.setstr("current_file", filename);
    }

    this.clone_file = function(filename) {
	var current = Storage.getstr("current_file");
	if (filename == current) return;
	console.log("Cloning into '"+filename+"'");
	save(current);
	save(filename);
	Storage.setstr("current_file", filename);
    }

    /* --------------------------------------- Constructor ------------------------------------- */ 

    var CT_II, CT, DRAG_START;

    this.create_undo_frame = function() {
	if (UNDO.current.length>0) {
	    UNDO.buffer.splice(UNDO.index, UNDO.buffer.length - UNDO.index, UNDO.current);
	    UNDO.current = [];
	    UNDO.index++;
	    UNDO.current_stored = [];
	}
    }

    // alternative sigmoid function
    // function bounded_sigmoid(x, a) { return 1 / (1+Math.pow((1-x)/x, a)); }

    /* t: current time, T: total time for moving that controlpoint,
       X: total distance, f: fraction of total distance covered
       Points are subject to acceleration 2a, so that x = a t^2.
       From halfway, they decelerate with the same speed.
       They reach halfway point when t = sqrt(0.5 X/a), so the transition takes twice that number of 
       frames in total.


     */
    function animate_controlpoints(displacements, continuation) {
	var t = 0;
	requestAnimationFrame(animate);
	var a = 0.5;

	function animate() {
	    t++;
	    var moving = 0;
	    for (var cp_out_socket in displacements) {
		var d = displacements[cp_out_socket];
		var X = Point.distance_cc(d[0], d[1]);
		var T = 2*Math.sqrt(0.5*X/a);
		if (t > T) continue;
		moving++; // this point is still moving
		var f = 2*t > T ? 1 - a*(T-t)*(T-t)/X : (a * t * t)/X;
		var pos = [ d[0][0]*(1-f) + d[1][0]*f,
			    d[0][1]*(1-f) + d[1][1]*f ];
		CT.change(["move_controlpoint", cp_out_socket, pos], true);
		State.redraw();
	    }
	    if (moving > 0) requestAnimationFrame(animate); else continuation();
	}
    }

    function animate_frame(frame, direction, continuation) {
	if (frame.length==0) { continuation(); return; }
	var num_moves = 0;
	while (num_moves < frame.length && frame[num_moves][direction][0] == "move_controlpoint") {
	    num_moves++;
	}
	if (num_moves==0) {
	    CT.change(frame[0][direction]);
	    animate_frame(frame.slice(1), direction, continuation);
	} else {
	    var displacements = {};
	    for (var i=0; i<num_moves; i++) {
		var fw = frame[i][direction], bw = frame[i][1-direction];
		var cp_out_socket = bw[1];
		if (!(cp_out_socket in displacements)) {
		    displacements[cp_out_socket] = [bw[2], fw[2]];
		} else {
		    displacements[cp_out_socket][1] = fw[2];
		}
	    }
	    console.log("Animating controlpoints:");
	    for (var key in displacements) {
		console.log(key+": "+JSON.stringify(displacements[key][0])+" -> "+JSON.stringify(displacements[key][1]));
	    }
	    animate_controlpoints(displacements, 
				  function() { animate_frame(frame.slice(num_moves), direction, continuation); });
	}
    }

    // continuation is executed once undo animation has completed
    this.undo = function(continuation) {
	// figure out what undo frame we're dealing with and handle administration
	var frame;
	if (UNDO.index == UNDO.buffer.length && UNDO.current.length > 0) {
	    UNDO.current_stored = UNDO.current;
	    frame = UNDO.current;
	    UNDO.current = [];
	    console.log("Undoing current frame");
	} else {
	    if (UNDO.index>0) {
		console.log("Undoing frame "+(UNDO.index-1));
		frame = UNDO.buffer[UNDO.index-1];
		UNDO.index--;
	    }
	}

	// actually undo all the changes
	if (frame) animate_frame(frame.slice().reverse(), 1, continuation); else continuation();
    }

    // continuation is executed once redo animation has completed
    this.redo = function(continuation) {
	// figure out what undo frame we're dealing with and handle administration
	var frame;
	if (UNDO.index == UNDO.buffer.length && UNDO.current_stored.length > 0) {
	    UNDO.current = UNDO.current_stored;
	    console.log("Redoing current frame");
	    frame = UNDO.current_stored;
	    UNDO.current_stored = [];
	} else {
	    if (UNDO.index < UNDO.buffer.length) {
		console.log("Redoing frame "+(UNDO.index));
		frame = UNDO.buffer[UNDO.index];
		UNDO.index++;
	    }
	}

	// actually undo all the changes
	if (frame) animate_frame(frame, 0, continuation); else continuation();
    }
    
    function initialize(savestate) {
	
	var undobuffer = savestate[1];

	if (CT) CT.destroy();
	CT = CompoundTool.create();
	CT_II = CT.get_input_interface();

	// override "connect" and "disconnect" methods in the Interface tool to add/remove the
	// "output" class from the connected gizmo.
	var OI = CT.get_output_interface();
	OI.connect = function(left_tool, left_output_socket, right_in_socket) {
	    InterfaceTool.connect.call(this, left_tool, left_output_socket, right_in_socket);
	    left_tool.get_output(left_output_socket).set_class("output", true);
	}
	OI.disconnect = function(right_in_socket) {
	    this.get_output(right_in_socket).set_class("output", false);
	    InterfaceTool.disconnect.call(this, right_in_socket);
	}
	
	CT.initialize(undobuffer);
	UNDO = undobuffer;
    }


    this.redraw = function() {
	CT.recalculate();
	var set = {};
	CompoundTool.ControlPoints.build_draw_set(set);
	CT.build_draw_set_with_internals(set);
	Graphics.redraw(set);
    }

    // This creates an action (by putting all arguments in an array) and performs it

    function register_change(change_forward, change_backward) {
	if (UNDO.index < UNDO.buffer.length || UNDO.current_stored.length > 0) {
	    if (UNDO.index < UNDO.buffer.length) console.log("Killing frames "+UNDO.index+"-"+(UNDO.buffer.length-1));
	    if (UNDO.current_stored.length>0) console.log("Killing current frame");
	    UNDO.buffer.splice(UNDO.index);
	    UNDO.current_stored = [];
	}
	UNDO.current.push([change_forward, change_backward]);
    }


    this.last_change_was_a_move = function() {
	if (UNDO.current.length == 0) return false;
	var change = UNDO.current[UNDO.current.length-1];
	return change[0][0] == "move_controlpoint";
    }

    this.create_line = function(pos1, pos2) {
	var cp1 = CT_II.first_free_output();
	var cf1 = ["create_controlpoint", cp1, pos1];
	CT.change(cf1);
	register_change(cf1, ["remove_controlpoint", cp1]);

	var cp2 = CT_II.first_free_output();
	var cf2 = ["create_controlpoint", cp2, pos2];
	CT.change(cf2);
	register_change(cf2, ["remove_controlpoint", cp2]);

	var cf3 = ["create_line", cp1, cp2];
	var id = CT.change(cf3);
	register_change(cf3, ["remove_tool", id]);
    }


    this.embed_file = function(filename, pos) {
	var savestatename = Storage.filename2savestatename(filename);
	var embed_action = ["embed", savestatename];
	var compound_id = CT.change(embed_action);
	console.log("embedded '"+filename+"' as tool with id="+compound_id);
	register_change(embed_action, ["remove_tool", compound_id]);
    }

    this.create_circle = function(pos_centre, pos_border) {
	var cp_centre = CT_II.first_free_output();
	var cf_centre = ["create_controlpoint", cp_centre, pos_centre];
	CT.change(cf_centre);
	register_change(cf_centre, ["remove_controlpoint", cp_centre]);

	var cp_border = CT_II.first_free_output();
	var cf_border = ["create_controlpoint", cp_border, pos_border];
	CT.change(cf_border);
	register_change(cf_border, ["remove_controlpoint", cp_border]);

	var cf_circle = ["create_circle", cp_centre, cp_border];
	var id = CT.change(cf_circle);
	register_change(cf_circle, ["remove_tool", id]);
    }

    this.pick_up_controlpoint = function(cp_out_socket) {
	DRAG_START = [cp_out_socket, CT_II.get_output(cp_out_socket).dup()];
	var separated = CT.separate(cp_out_socket);
	console.log("separation: ["+separated[0].join(",")+"] / ["+separated[1].join(",")+"]");

	console.log("picking up controlpoint "+cp_out_socket);
	// first find all point outputs connected to the same tool as the one being dragged...
	var disqualified_outputs = {};
	CT.foreach_listener(0, cp_out_socket, separated[1], function(connection) {
	    var t_id = connection[2]; // this tool is attached to the control point, via a tie or an input
	    var connections = CT.incoming_connection_ids(t_id);
	    for (var j=0; j<connections.length; j++) {
		var conn = connections[j];
		if (!(conn[0] in disqualified_outputs)) disqualified_outputs[conn[0]] = {};
		disqualified_outputs[conn[0]][conn[1]] = true;
	    }
	});

	return CT.select_outputs(separated[0], function(tool_id,socket,gizmo,tie) { 
	    if (tie || !gizmo || gizmo.type != "point") return false;
	    return !((tool_id in disqualified_outputs) && disqualified_outputs[tool_id][socket]);
	});
    }

    this.drag_controlpoint = function(pos) {
	var gizmo = CT_II.get_output(DRAG_START[0]);
	gizmo.pos = pos; // delay creating the event until drag end
    }

    this.get_cool_outputs = function() {
	return CT.select_outputs(CT.get_tool_ids(), function(tool_id,socket,gizmo,tie) {
	    return tool_id!=0 && !tie; 
	});
    }

    this.release_controlpoint = function() {
	var cp_out_socket = DRAG_START[0];
	var gizmo = CT_II.get_output(cp_out_socket);
	var new_pos = gizmo.dup();
	var cf = ["move_controlpoint", cp_out_socket, new_pos];
	var cb = ["move_controlpoint", cp_out_socket, DRAG_START[1]];
	CT.change(cf); // perhaps not strictly necessary
	register_change(cf, cb); 
	DRAG_START = undefined;
    }


    this.snap = function(cp_out_socket, left_tool_id, left_out_socket) {

	// Step 1: reorder the tools array
	var separated = CT.separate(cp_out_socket);
	var new_tool_ids = separated[0].concat(separated[1]);
	var cf = ["shuffle_tools", new_tool_ids];
	var old_tool_ids = CT.change(cf);
	var cb = ["shuffle_tools", old_tool_ids];
	register_change(cf, cb);

	// Step 2: create a change that moves the controlpoint onto the target
	var old_pos = DRAG_START[1];
	var new_pos = CT.get_output_for_id(left_tool_id, left_out_socket).dup();
	// I could call CT.change here, but it is not necessary as the controlpoint is removed in step 4 anyway
	register_change(["move_controlpoint", cp_out_socket, new_pos],
			["move_controlpoint", cp_out_socket, old_pos]);
	

	// Step 3: redirect all edges
	CT.foreach_listener(0, cp_out_socket, new_tool_ids, function(connection) {
	    var cf = ["redirect", connection, [left_tool_id, left_out_socket]];
	    var cb = ["redirect", [left_tool_id, left_out_socket, connection[2], connection[3], connection[4]],
		      [connection[0], connection[1]]];
	    CT.change(cf);
	    register_change(cf, cb);
	});

	// Step 4: remove the old controlpoint
	cf = ["remove_controlpoint", cp_out_socket];
	cb = ["create_controlpoint", cp_out_socket, CT.get_output_for_id(left_tool_id, left_out_socket).dup()];
	CT.change(cf);
	register_change(cf, cb);

	// Step 5: look for new dupicate points and tie them together
	CT.foreach_tie(function(connection) {
	    var cf = ["tie",   connection[0], connection[1], connection[2], connection[3]];
	    var cb = ["untie", connection[2], connection[3]];
	    CT.change(cf);
	    register_change(cf, cb);
	});
    }

    this.get_controlpoints = function() {
	return CT.select_outputs([0], function() { return true; }); // all controlpoints
    }

    this.toggle_output = function(left_tool_id, left_out_socket) {
	var cf, cb, right_in_socket;

	CT.foreach_listener(left_tool_id, left_out_socket, [1], function(conn) { right_in_socket = conn[3]; });

	if (right_in_socket != undefined) {
	    cf = ["disconnect_output", left_tool_id, left_out_socket, right_in_socket];
	    cb = ["connect_output", left_tool_id, left_out_socket, right_in_socket];
	} else {
	    right_in_socket = CT.get_output_interface().first_free_output();
	    cf = ["connect_output", left_tool_id, left_out_socket, right_in_socket];
	    cb = ["disconnect_output", left_tool_id, left_out_socket, right_in_socket];
	} 
	CT.change(cf);
	register_change(cf, cb);
    }


};
