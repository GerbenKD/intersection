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

    var CP, CT;

    initialize();

    /* The global state maintains a single selected controlpoint. For that controlpoint,
       the listeners are available and it can be snapped. This state is transparent to the
       outside.
     */
 
    var UNDO_BUFFER = []; // list of undo frames. An undo frame is itself a list of changes.
    var UNDO_CURRENT = [];
    var UNDO_INDEX = 0; // points to the first frame that can be redone

    function step_one() {
	var frame = UNDO_BUFFER[UNDO_INDEX];
	for (var i=0; i<frame.length; i++) {
	    CT.perform(frame[i]);
	}
	UNDO_INDEX++;
    }


    this.create_undo_frame = function() {
	UNDO_BUFFER.splice(UNDO_INDEX, UNDO_BUFFER.length - UNDO_INDEX, UNDO_CURRENT);
	UNDO_CURRENT = [];
	UNDO_INDEX++;
    }

    this.step = function(steps) {
	var i_target = UNDO_INDEX + steps;
	if (steps<0) {
	    if (UNDO_CURRENT.length > 0) create_undo_frame();
	    initialize(); 
	    if (i_target<0) i_target = 0;
	    UNDO_INDEX = 0;
	} else {
	    if (UNDO_CURRENT.length > 0) UNDO_CURRENT = []; // flush current frame if we're redoing!!!
	    if (i_target > UNDO_BUFFER.length) i_target = UNDO_BUFFER.length;
	}
	while (UNDO_INDEX < i_target) {
	    step_one.call(this);
	}
    }

    /* ------------------------------------------ Overrides ------------------------------------- */ 

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


    // This creates an action (by putting all arguments in an array) and performs it

    this.change = function() {
	var change = Array.prototype.slice.call(arguments);
	UNDO_CURRENT.push(change);
	return CT.perform(change);
    }


    this.create_line = function(pos1, pos2) {
	var sockets = State.change("create_line");
	State.change("move_controlpoint", sockets[0], pos1);
	State.change("move_controlpoint", sockets[1], pos2);
    }

    this.create_circle = function(pos_centre, pos_border) {
	var sockets = State.change("create_circle");
	State.change("move_controlpoint", sockets[0], pos_centre);
	State.change("move_controlpoint", sockets[1], pos_border);
    }

    this.drag_controlpoint = function(cp_out_socket, pos) {
	CP.get_output(cp_out_socket).pos = pos; // hack this directly because it ain't gonna be no event
    }

    this.snap = function(cp_out_socket, left_tool_id, left_out_socket) {
	State.change("snap", cp_out_socket, left_tool_id, left_out_socket);
    }

    this.release_controlpoint = function(cp_out_socket, pos) {
	State.change("move_controlpoint", cp_out_socket, pos);
    }


    this.redraw = function() {
	CT.recalculate();
	CT.update_graphics();
    }

    this.get_controlpoints = function() {
	return CT.select_outputs([0], function() { return true; }); // all controlpoints
    }


    this.get_controlpoint_targets = function(cp_out_socket) {
	var T = CT.split_tools(cp_out_socket);
	var dep_tool_ids = T[1];
	var cpl = CT.get_listener_ids(0, cp_out_socket, dep_tool_ids);

	// first find all point outputs connected to the same tool as the one being dragged...
	var disqualified_outputs = {};
	for (var i=0; i<cpl.length; i++) {
	    var t_id = cpl[i][2]; // this tool is attached to the control point, via a tie or an input
	    var connections = CT.incoming_connection_ids(t_id);
	    for (var j=0; j<connections.length; j++) {
		var conn = connections[j];
		if (!(conn[0] in disqualified_outputs)) disqualified_outputs[conn[0]] = {};
		disqualified_outputs[conn[0]][conn[1]] = true;
	    }
	}

	var indep_tool_ids = T[0];

	return CT.select_outputs(indep_tool_ids, function(tool_id,socket,gizmo,sprite,tie) { 
	    if (tie || !gizmo || gizmo.type != "point") return false;
	    return !((tool_id in disqualified_outputs) && disqualified_outputs[tool_id][socket]);
	});
    }

};
