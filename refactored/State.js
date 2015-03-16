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

    /* The global state maintains a single selected controlpoint. For that controlpoint,
       the listeners are available and it can be snapped. This state is transparent to the
       outside.
     */
 
    var UNDO_BUFFER = []; // list of undo frames. An undo frame is itself a list of changes.
    var UNDO_CURRENT = [];
    var UNDO_INDEX = 0; // points to the first frame that can be redone

    function step_one(which) {
	var frame = UNDO_BUFFER[UNDO_INDEX];
	for (var i=0; i<frame.length; i++) {
	    CT.change(frame[i][which]);
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
	    step_one.call(this, 0);
	}
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


    this.create_line = function(pos1, pos2) {
	var cf1 = ["create_controlpoint", pos1];
	var cp1 = CT.change(cf1);
	register_change(cf1, ["remove_controlpoint", cp1]);

	var cf2 = ["create_controlpoint", pos2];
	var cp2 = CT.change(cf2);
	register_change(cf2, ["remove_controlpoint", cp2]);

	var cf3 = ["create_line", cp1, cp2];
	var id = CT.change(cf3);
	register_change(cf3, ["remove_tool", id]);
    }

    this.create_circle = function(pos_centre, pos_border) {
	var cf_centre = ["create_controlpoint", pos_centre];
	var cp_centre = CT.change(cf_centre);
	register_change(cf_centre, ["remove_controlpoint", cp_centre]);

	var cf_border = ["create_controlpoint", pos_border];
	var cp_border = CT.change(cf_border);
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
	var separated = CT.separate(cp_out_socket);
	var new_tool_ids = separated[0].concat(separated[1]);
	var cf = ["shuffle_tools", new_tool_ids];
	var old_tool_ids = CT.change(cf);
	var cb = ["shuffle_tools", old_tool_ids];
	register_change(cf, cb);

	CT.foreach_listener(0, cp_out_socket, new_tool_ids, function(connection) {
	    var cf = ["redirect", connection, [left_tool_id, left_out_socket]];
	    var cb = ["redirect", [left_tool_id, left_out_socket, connection[2], connection[3], connection[4]],
		      [connection[0], connection[1]]];
	    CT.change(cf);
	    register_change(cf, cb);
	});

	cf = ["remove_controlpoint", cp_out_socket];
	cb = ["create_controlpoint", CP.get_output(cp_out_socket).pos];
	CT.change(cf);
	register_change(cf, cb);

	// TODO add ties for duplicate points:
	// this.recalculate();
	// CT.find_duplicates(CP)
	// tie_em_up.call(this, find_duplicates.call(this, this.id2tool[0])); // Give CPT to find_duplicates

    }

    this.get_controlpoints = function() {
	return CT.select_outputs([0], function() { return true; }); // all controlpoints
    }

};
