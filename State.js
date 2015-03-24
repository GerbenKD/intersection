"use strict";

var State = new function() {

    var UNDO;

    /* --------------------------------------- Load/save --------------------------------------- */ 

    /* Load/save design:

       localState has the following structure:

       current_slot    : name of the currently edited file
       tool_<id>       : saved tool with given id
       references_<id> : number of references to this tool
       map             : { name: id }

       Example: user loads a file.

       1. First, the id of this file is found in the map. The right tool is loaded.
       2. The tool is edited. During editing, a new tool is included by file name.
       This load action is stored in the undo buffer by id.
       3. The tool is saved. This operation is complex, as the reference counts have to stay consistent.
       * Add one to the reference count of all ids referenced by the new file
       * Add one to the reference count of the id of the new file itself (it is "referenced" by being visible)
       * UNLINK old file:
       - Decrease the reference count of the old id by one.
       - If it hits zero, find all referenced objects, recursively UNLINK them, then delete this id from localStorage.
    */

    this.restore_state = function(continuation) {

	// get or create filename
	if (!("current_slot" in localStorage)) {
	    console.log("Creating current slot 'file_0'");
	    localStorage.current_slot = "file_0";
	}
	var fn = localStorage.current_slot;

	// get or create map
	if (!("map" in localStorage)) {
	    console.log("Creating map");
	    localStorage.map = JSON.stringify({});
	}
	var map = JSON.parse(localStorage.map);

	// get or create file id
	if (!(fn in map)) {
	    console.log("Setting id of '"+fn+"' to 0 in map");
	    map[fn] = 0;
	    localStorage.map = JSON.stringify(map);
	}
	var id = map[fn];

	// get or create the file
	var tool_name = "tool_"+id;
	if (!(tool_name in localStorage)) {
	    console.log("Creating empty tool '"+tool_name+"'");
	    localStorage[tool_name] = JSON.stringify({
		buffer:  [],
		current: [],
		current_stored: [],
		index: 0
	    });
	}
	var tool = JSON.parse(localStorage[tool_name]);
	initialize.call(this, tool, continuation);
    }
    
    this.load = function(name, continuation) {
	var map = JSON.parse(localStorage.map);
	if (!(name in map)) return false;
	var tool_name = "tool_"+map[name];
	if (!(tool_name in localStorage)) return false;
	var tool = JSON.parse(localStorage[tool_name]);
	initialize.call(this, tool, continuation);
	return true;
    }

    function first_free_id() {
	var i = 0;
	while (("tool_"+i) in localStorage) i++;
	return i;
    }

    // this one is complicated, but for the time being always map to the same tool
    this.save = function(name) {
	var map = JSON.parse(localStorage.map)
	var tool_name;
	if (!(name in map)) {
	    var id = first_free_id();
	    tool_name = "tool_"+id;
	    map[name] = tool_name;
	    localStorage.map = JSON.stringify(map);
	} else {
	    tool_name = "tool_"+map[name];
	}
	localStorage[tool_name] = JSON.stringify(UNDO);
    }

    /* --------------------------------------- Constructor ------------------------------------- */ 

    var CP, CT, DRAG_START;

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

    // animation is controlled by "numiter", which determines the speed.
    function animate_controlpoints(displacements, continuation) {
	var iter = 0, numiter=20;
	requestAnimationFrame(animate);

	function animate() {
	    var x = iter/(numiter-1);
	    var f = x < 0.5 ? 2*x*x : 1-2*(1-x)*(1-x);
	    iter++;
	    for (var cp_out_socket in displacements) {
		var d = displacements[cp_out_socket];
		var pos = [ d[0][0]*(1-f) + d[1][0]*f,
			    d[0][1]*(1-f) + d[1][1]*f ];
		CT.change(["move_controlpoint", cp_out_socket, pos], true);
		CT.recalculate();
		CT.update_graphics();
	    }
	    if (iter < numiter) requestAnimationFrame(animate); else continuation();
	}
    }

    function perform_frame(frame, direction) {
	for (var i=0; i<frame.length; i++) {
	    CT.change(frame[i][direction]);
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

    function initialize(tool, continuation) {
	if (CT) CT.destroy();
	CT = CompoundTool.create();

	// override some CT methods related to graphics

	CT.has_graphics = function() { return true; }

	CT.update_graphics = function() {
	    for (var i=0; i<this.tools.length; i++) {
		this.tools[i].update_graphics();
	    }
	}

	CT.add_tool = function(tool) {
	    tool.add_graphics();
	    CompoundTool.add_tool.call(this, tool);
	}

	CP = ControlPointTool.create();
	CT.add_tool(CP);

	UNDO = tool;
	for (var i=0; i<UNDO.buffer.length; i++) {
	    perform_frame(UNDO.buffer[i], 0);
	}
	if (UNDO.current.length>0) perform_frame(UNDO.current, 0);
	continuation();
	console.log("index="+UNDO.index);
    }


    this.redraw = function() {
	CT.recalculate();
	CT.update_graphics();
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
	var cp1 = CP.first_free_output();
	var cf1 = ["create_controlpoint", cp1, pos1];
	CT.change(cf1);
	register_change(cf1, ["remove_controlpoint", cp1]);

	var cp2 = CP.first_free_output();
	var cf2 = ["create_controlpoint", cp2, pos2];
	CT.change(cf2);
	register_change(cf2, ["remove_controlpoint", cp2]);

	var cf3 = ["create_line", cp1, cp2];
	var id = CT.change(cf3);
	register_change(cf3, ["remove_tool", id]);
    }

    this.create_circle = function(pos_centre, pos_border) {
	var cp_centre = CP.first_free_output();
	var cf_centre = ["create_controlpoint", cp_centre, pos_centre];
	CT.change(cf_centre);
	register_change(cf_centre, ["remove_controlpoint", cp_centre]);

	var cp_border = CP.first_free_output();
	var cf_border = ["create_controlpoint", cp_border, pos_border];
	CT.change(cf_border);
	register_change(cf_border, ["remove_controlpoint", cp_border]);

	var cf_circle = ["create_circle", cp_centre, cp_border];
	var id = CT.change(cf_circle);
	register_change(cf_circle, ["remove_tool", id]);
    }

    this.pick_up_controlpoint = function(cp_out_socket) {
	DRAG_START = [cp_out_socket, CP.get_output(cp_out_socket).dup()];
	var separated = CT.separate(cp_out_socket);

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

	return CT.select_outputs(separated[0], function(tool_id,socket,gizmo,sprite,tie) { 
	    if (tie || !gizmo || gizmo.type != "point") return false;
	    return !((tool_id in disqualified_outputs) && disqualified_outputs[tool_id][socket]);
	});
    }

    this.drag_controlpoint = function(pos) {
	var gizmo = CP.get_output(DRAG_START[0]);
	gizmo.pos = pos; // delay creating the event until drag end
    }

    this.release_controlpoint = function() {
	var cp_out_socket = DRAG_START[0];
	var gizmo = CP.get_output(cp_out_socket);
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

};
