"use strict";

/*
 * - The State object contains all game state as well as undo information and supports load/save
 * - All actions refer to objects by their ID
 * - Actions can have a return value, but that's just for convenience of the caller. Redoing a sequence
 *   of actions yields the correct state regardless of how the return values are used.
 * - All tools are identified by their IDs. The correct tools are located 
 */

var State = new function() {

    /* --------------------------------------- Constructor ------------------------------------- */ 

    var CP, CT, DRAG_START;

    initialize();
 
    var UNDO_BUFFER = []; // list of undo frames. An undo frame is itself a list of [forward_change,backward_change]
    var UNDO_CURRENT = [];
    var UNDO_CURRENT_STORED = [];
    var UNDO_INDEX = 0; // points to the first frame that can be redone

    this.create_undo_frame = function() {
	if (UNDO_CURRENT.length>0) {
	    UNDO_BUFFER.splice(UNDO_INDEX, UNDO_BUFFER.length - UNDO_INDEX, UNDO_CURRENT);
	    UNDO_CURRENT = [];
	    UNDO_INDEX++;
	    UNDO_CURRENT_STORED = [];
	}
    }

    function bounded_sigmoid(x, a) { return 1 / (1+Math.pow((1-x)/x, a)); }

    // animation is controlled by "numiter", which determines the speed, and
    // alpha, which controls the sharpness of the sigmoid function.
    function animate_controlpoints(displacements, continuation) {
	var iter = 0, numiter=30, alpha = 2;
	requestAnimationFrame(animate);

	function animate() {
	    var f = bounded_sigmoid(iter / (numiter-1), alpha);
	    iter++;
	    for (var cp_out_socket in displacements) {
		var d = displacements[cp_out_socket];
		var pos = [ d[0][0]*f + d[1][0]*(1-f),
			    d[0][1]*f + d[1][1]*(1-f) ];
		CT.change(["move_controlpoint", cp_out_socket, pos], true);
		CT.recalculate();
		CT.update_graphics();
	    }
	    if (iter < numiter) requestAnimationFrame(animate); else continuation();
	}
    }

    function perform_frame(frame, direction, continuation) {
	if (frame.length==0) { continuation(); return; }
	var num_moves = 0;
	while (num_moves < frame.length && frame[num_moves][direction][0] == "move_controlpoint") {
	    num_moves++;
	}
	if (num_moves==0) {
	    CT.change(frame[0][direction]);
	    perform_frame(frame.slice(1), direction, continuation);
	} else {
	    var displacements = {};
	    for (var i=0; i<num_moves; i++) {
		var fw = frame[i][1-direction], bw = frame[i][direction];
		var cp_out_socket = fw[1];
		if (!(cp_out_socket in displacements)) {
		    displacements[cp_out_socket] = [bw[2], fw[2]];
		} else {
		    displacements[cp_out_socket][1] = fw[2];
		}
	    }
	    animate_controlpoints(displacements, 
				  function() { perform_frame(frame.slice(num_moves), direction, continuation); });
	}
    }

    // continuation is executed once undo animation has completed
    this.undo = function(continuation) {
	// figure out what undo frame we're dealing with and handle administration
	var frame;
	if (UNDO_INDEX == UNDO_BUFFER.length && UNDO_CURRENT.length > 0) {
	    UNDO_CURRENT_STORED = UNDO_CURRENT;
	    frame = UNDO_CURRENT;
	    UNDO_CURRENT = [];
	} else {
	    if (UNDO_INDEX>0) {
		frame = UNDO_BUFFER[UNDO_INDEX-1];
		UNDO_INDEX--;
	    }
	}

	// actually undo all the changes
	if (frame) perform_frame(frame.slice().reverse(), 1, continuation); else continuation();
    }

    // continuation is executed once redo animation has completed
    this.redo = function(continuation) {
	// figure out what undo frame we're dealing with and handle administration
	var frame;
	if (UNDO_INDEX == UNDO_BUFFER.length && UNDO_CURRENT_STORED.length > 0) {
	    UNDO_CURRENT = UNDO_CURRENT_STORED;
	    frame = UNDO_CURRENT_STORED;
	    UNDO_CURRENT_STORED = [];
	} else {
	    if (UNDO_INDEX < UNDO_BUFFER.length) {
		frame = UNDO_BUFFER[UNDO_INDEX];
		UNDO_INDEX++;
	    }
	}

	// actually undo all the changes
	if (frame) perform_frame(frame, 0, continuation); else continuation();
    }

    function initialize() {
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


    }


    this.redraw = function() {
	CT.recalculate();
	CT.update_graphics();
    }

    // This creates an action (by putting all arguments in an array) and performs it

    function register_change(change_forward, change_backward) {
	UNDO_CURRENT.push([change_forward, change_backward]);
    }


    this.last_change_was_a_move = function() {
	if (UNDO_CURRENT.length == 0) return false;
	var change = UNDO_CURRENT[UNDO_CURRENT.length-1];
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
