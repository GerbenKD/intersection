"use strict";

var CompoundTool = Tool.extend(function() {

    this.typename = "CompoundTool"; // intended for debugging

    this.ControlPoints = ControlPointTool.create();

    this.create = function() {
	return this.extend(function() {
	    this.tools = [];
	    this.id2tool = [];
	    this.add_tool(InterfaceTool.create());
	    this.add_tool(InterfaceTool.create());
	});
    }

    this.initialize = function(undobuffer) {
	function perform_frame(frame) {
	    for (var i=0; i<frame.length; i++) {
		this.change(frame[i][0]);
	    }
	}

	for (var i=0; i<undobuffer.index; i++) {
	    perform_frame.call(this, undobuffer.buffer[i]);
	}

	if (undobuffer.index == undobuffer.buffer.length && undobuffer.current.length>0) 
	    perform_frame.call(this, undobuffer.current);
    }

    this.get_input_interface = function() { return this.id2tool[0]; }
    this.get_output_interface = function() { return this.id2tool[1]; }

    this.get_input = function(right_in_socket) {
	return this.id2tool[0].get_input(right_in_socket);
    }

    this.get_output = function(socket) { 
	return this.id2tool[1].get_output(socket); 
    }

    this.connect = function(src_tool, src_socket, dst_socket) {
	this.id2tool[0].connect(src_tool, src_socket, dst_socket);
    }

    this.disconnect = function(dst_socket) {
	this.id2tool[0].disconnect(dst_socket);
    }

    this.tie = function(left_tool, left_out_socket, right_out_socket) {
	this.id2tool[1].tie(left_tool, left_out_socket, right_out_socket);
    }

    this.untie = function(right_out_socket) {
	this.id2tool[1].untie(right_out_socket);
    }

    this.get_tie = function(right_out_socket) {
	return this.id2tool[1].get_tie(right_out_socket);
    }

    this.recalculate = function() {
	for (var i = 0; i < this.tools.length; i++) {
	    this.tools[i].recalculate();
	}
    }

    this.remove_output = function(socket) {
	if (this.get_tie(socket)) this.untie(socket);
	if (this.id2tool[1].get_input(socket)) {
	    this.id2tool[1].disconnect(socket);
	}
    }


    /*
      
      embed:
      creates new compoundtools-within-compoundtools
      after embedding, all inputs of the embedded tool are to controlpoints
      destroying a compoundtool should therefore:
      (1) destroy its contents.
      (2) all remaining inputs should be destroyed recursively up to and including their controlpoints
    */

    this.destroy = function(level) {
	var ii = this.id2tool[0];

	// first destroy recursively
	for (var i=this.id2tool.length-1; i>=2; i--) {
	    this.id2tool[i].destroy((level||0)+1);
	}

	// then destroy any remaining controlpoints
	for (var i=0; i<ii.max_input_socket(); i++) {
	    var input = [ii, i];
	    var next = ii.get_input(i);
	    while (next) {
		input[0].disconnect(input[1]);
		input = next;
		next = input[0].get_input(input[1]);
	    }
	    if (input[0]===CompoundTool.ControlPoints) {
		input[0].remove_output(input[1]);
	    }
	}
     }

    // alternative to build_draw_list for when you wanna see everything
    this.build_draw_set_with_internals = function(set) {
	for (var i=0; i<this.tools.length; i++) {
	    this.tools[i].build_draw_set(set);
	}
    }
	
    this.add_tool = function(tool) { 
	tool.id = this.id2tool.length;
	this.id2tool.push(tool);
	this.tools.push(tool); 
    }

    this.add_tool_with_intersections = function(tool) {
	function create_intersection(tool1, socket1, gizmo1, tool2, socket2, gizmo2) {
	    var itool;
	    var invert = false;
	    if (gizmo1.type == "line") {
		itool = gizmo2.type == "line" ? LLI_Tool.create() : LCI_Tool.create(); 
	    } else {
		invert = true;
		itool = gizmo2.type == "line" ? LCI_Tool.create() : CCI_Tool.create(); 
	    }
	    itool.connect(tool1, socket1, invert ? 1 : 0);
	    itool.connect(tool2, socket2, invert ? 0 : 1);
	    return itool;
	}

	var n_existing_tools = this.tools.length;
	this.add_tool(tool);

	for (var j=0; j<tool.max_output_socket(); j++) {
	    var gizmo = tool.get_output(j);
	    if (!gizmo || gizmo.type == "point") continue;
	    for (var i=0; i<n_existing_tools; i++) { // TODO skip interfaces??
		var test_tool = this.tools[i];
		for (var k=0; k<test_tool.max_output_socket(); k++) {
		    var test_gizmo = test_tool.get_output(k);
		    if (!test_gizmo) continue;
		    if (test_gizmo.type == "point") continue;
		    this.add_tool(create_intersection(tool, j, gizmo, test_tool, k, test_gizmo));
		}
	    }
	}
    }

    this.max_input_socket = function()  { return this.id2tool[0].max_output_socket(); }
    this.max_output_socket = function() { return this.id2tool[1].max_output_socket(); }
    
    /* Assumes the main compoundtool to have been recalculated.
     * candidates[left_tool_id + ":" + left_out_socket][right_tool_id] = 
                                        [left_tool_id, right_tool_id, left_out_socket, left_index, right_index]
     * if src_tool has an output that is equal to dst_tool at dst_socket
     */
    function find_duplicates() {
	console.log("Searching for duplicates");

	var candidates = initialise_candidates(this.tools);
	report("Initialised candidates", candidates);
	var state = this.ControlPoints.get_state();
	for (var tst=0; tst<5; tst++) {
	    this.ControlPoints.randomize();
	    this.recalculate();
	    filter(candidates);
	}
	this.ControlPoints.restore_state(state);
	this.recalculate();

	report("After filtering", candidates);

	return candidates;

	function report(msg, candidates) {
	    var left_keys = Object.keys(candidates);
	    console.log(msg+": found "+left_keys.length+" duplicate target(s):");
	    for (var i=0; i<left_keys.length; i++) {
		var right_hash = candidates[left_keys[i]];
		var right_keys = Object.keys(right_hash);
		var first = right_hash[right_keys[0]];
		var str = first[0].id+"@"+first[2]+" (index "+first[3]+") is duplicated in tool(s) ";
		for (var j=0; j<right_keys.length; j++) {
		    var item = right_hash[right_keys[j]];
		    if (j>0) str = str + " ; ";
		    str = str + item[1].id + " (index "+item[4]+")";
		}
		console.log(str);
	    }
	}

	function initialise_candidates(tools) {
	    // Initialise list = [[tool, tool_index, pos, output_socket], ...],
	    // filtered for valid, untied points and sorted by x-coordinate.
	    var list = [];
	    for (var index=0; index < tools.length; index++) {
		var tool = tools[index];
		for (var output_socket = 0; output_socket < tool.max_output_socket(); output_socket++) {
		    if (tool.get_tie(output_socket)) continue;
		    var gizmo = tool.get_output(output_socket);
		    if (!gizmo || !gizmo.valid || gizmo.type != "point") continue;
		    list.push([tool, index, gizmo.pos, output_socket]);
		}
	    }
	    list.sort(function(a,b) { return a[2][0] - b[2][0]; });
	    
	    // Find all candidates: tools that are sufficiently close together. Tool with higher index
	    // is a candidate for snapping to the tool with lower index
	    // AND (new) output sockets are candidates for snapping to lower output sockets on the same tool.
	    var map = {};
	    var j=0;
	    for (var i=1; i<list.length; i++) {
		var list_i = list[i];
		var x = list_i[2][0];
		while (j<list.length && x - list[j][2][0] > SMALL) { j++; }
		for (var k=j; k<list.length; k++) {
		    if (i==k) continue; // don't snap a socket to itself
		    var list_k = list[k];
		    if (list_k[2][0] - x >= SMALL) break;
		    if (Point.distance_cc(list_k[2], list_i[2])>=SMALL) continue;

		    // figure out who's source and who's destination
		    var info = (list_k[1] > list_i[1]) || (list_k[1]==list_i[1] && list_k[3]>list_i[3])
			? [ list_i[0], list_k[0], list_i[3], list_i[1], list_k[1] ]  // i is destination
			: [ list_k[0], list_i[0], list_k[3], list_k[1], list_i[1] ];
		    // info is [left_tool, right_tool, left_out_socket, left_index, right_index]
		    var left_key = info[0]+":"+info[2];
		    var right_hash = map[left_key];
		    if (!right_hash) { right_hash = {}; map[left_key] = right_hash; }
		    right_hash[info[1]] = info;
		}
	    }
	    return map;
	}

	// Tests candidates the given map, removing targets that turn out to be different.
	function filter(candidates) {
	    var left_keys = Object.keys(candidates);
	    for (var left_ix=0; left_ix<left_keys.length; left_ix++) {
		var left_key = left_keys[left_ix];
		var right_hash = candidates[left_key];
		var right_tool_ids = Object.keys(right_hash);
		var deleted = 0;
		for (var right_ix=0; right_ix<right_tool_ids.length; right_ix++) {
		    var right_key = right_tool_ids[right_ix];
		    var info = right_hash[right_key];
		    var left_out_socket = info[2];
		    var src = info[1], gizmo = info[0].get_output(left_out_socket);
		    var matching_outputs_unfiltered = src.get_matching_outputs(gizmo);
		    var matching_outputs = matching_outputs_unfiltered;
		    if (info[0]===src) {
			matching_outputs = [];
			for (var i=0; i<matching_outputs_unfiltered.length; i++) {
			    var right_out_socket = matching_outputs_unfiltered[i];
			    if (left_out_socket < right_out_socket) matching_outputs.push(right_out_socket);
			}
		    }

		    if (matching_outputs.length>1) {
			console.log("I found more than one matching output, so this is the really weird case");
			console.log("The target is a "+info[0].typename+" with id="+info[0].id+" and index="+info[3]+", output socket "+info[2]);
			console.log("The source is a "+info[1].typename+" with id="+info[1].id+" and index="+info[4]+", multiple output sockets");
			for (var a=0; a<src.max_output_socket(); a++) {
			    var tie = src.get_tie(a);
			    var gizmo = src.gizmos[a];
			    var msg = "socket "+a+": ";
			    if (tie) {
				msg = msg+"tied to a "+tie[0].typename+" with id "+tie[0].id+", socket "+tie[1];
			    } else if (gizmo) {
				msg = msg+"has an output gizmo of type "+gizmo.type;
				if (gizmo.type=="point") msg = msg+" at ("+gizmo.pos[0]+","+gizmo.pos[1]+")";
			    } else {
				msg = "unattached";
			    }
			    console.log(msg);
			}
		    }
		    if (matching_outputs.length==0) {
			// these turn out not to be equal
			delete right_hash[right_key];
			deleted++;
			if (deleted == right_tool_ids.length) delete candidates[left_key];
		    }
		}
	    }
	}
    }


    /* ------------------------------- Used from State ----------------------------------------- */ 

    this.get_tool_ids = function() { 
	return this.tools.map(function(tool) { return tool.id; });
    }

    // Constructs a list of ties for all duplicate tools. The list consists of the suggested connections.
    this.foreach_tie = function(func) {
	this.recalculate();
	var map = find_duplicates.call(this);
	// map[left_tool_id + ":" + left_out_socket][right_tool_id] = info
	// info = [left_tool, right_tool, left_out_socket, left_index, right_index]

	var entries = [];
	for (var left_key in map) {
	    var right_hash = map[left_key];
	    for (var right_key in right_hash) {
		var info = right_hash[right_key];
		entries.push(info);
	    }
	}
	entries.sort(function(a,b) { return (a[3]-b[3]) || (a[4]-b[4]); });
	
	for (var i=0; i!=entries.length; i++) {
	    var info = entries[i]; 
	    var right_out_sockets = info[1].get_matching_outputs(info[0].get_output(info[2]));
	    if (right_out_sockets.length<1) console.error("Somehow a duplicate has disappeared?!");
	    for (var j=0; j<right_out_sockets.length; j++) {
		var right_out_socket = right_out_sockets[j];
		if (!info[1].get_tie(right_out_socket) && (info[3]!=info[4]||info[2]<right_out_socket)) {
		    func([info[0].id, info[2], info[1].id, right_out_socket, true]);
		}
	    }
	}
    }

    this.incoming_connection_ids = function(id) {
	var incoming = this.id2tool[id].incoming_connections();
	var res = [];
	for (var i=0; i<incoming.length; i++) {
	    var c = incoming[i];
	    res.push([c[0].id, c[1], c[2].id, c[3], c[4]]);
	}
	return res;
    }

    this.foreach_listener = function(tool_id, output_socket, tool_ids, func) {
	for (var i=0; i<tool_ids.length; i++) {
	    var connections = this.incoming_connection_ids(tool_ids[i]);
	    for (var j=0; j<connections.length; j++) {
		var conn = connections[j];
		if (conn[0]===tool_id && conn[1]==output_socket) func(conn);
	    }
	}
    }

    this.get_output_for_id = function(tool_id, output_socket) {
	return this.id2tool[tool_id].get_output(output_socket);
    }

    this.separate = function(socket) {
	var tool = this.id2tool[0];
	var dependent = {}; // maps dependent tools that have been seen
	var dependent_tools = [], independent_tools = [];

	for (var i=0; i<this.tools.length; i++) {
	    var t = this.tools[i];
	    if (check_dependent(t)) {
		dependent_tools.push(t.id);
		dependent[t.id] = true;
	    } else {
		independent_tools.push(t.id);
	    }
	}

	return [independent_tools, dependent_tools];

	// tool is dependent on the controlpoint if its inputs or its ties refer to either another dependent tool, or
	// to the controlpoint tool with the correct socket
	function check_dependent(t) {
	    var connections = t.incoming_connections();
	    for (var i=0; i<connections.length; i++) {
		var conn = connections[i];
		if ((conn[0]==tool && conn[1]==socket) || dependent[conn[0].id]) return true;
	    }
	    return false;
	}
    }

    this.select_outputs = function(tool_ids, func) {
	var res = [];
	for (var i=0; i<tool_ids.length; i++) {
	    var tool_id = tool_ids[i];
	    var t = this.id2tool[tool_id];
	    for (var j=0; j<t.max_output_socket(); j++) {
		var tie = t.get_tie(j);
		var info = [tool_id, j, t.get_output(j), tie];
		if (info[2] && func.apply(undefined, info)) res.push(info);
	    }
	}
	return res;
    }

    this.change = function(change, suppress_log) {
	var fn = change[0];
	var fu = eval("C_"+fn);
	if (!fu) { console.error("Unknown change: '"+fn+"'"); return; }
	if (!suppress_log) console.log("Performing change "+JSON.stringify(change));
	return fu.apply(this, change.slice(1));
    }

    /* --------------------------------------- Changes ------------------------------------------- */ 

    // socket always refers to the input interface, not to the socket number in this.ControlPoints
    function C_create_controlpoint(socket, pos) {
	var left_out_socket = this.ControlPoints.first_free_output();
	this.ControlPoints.create_controlpoint(left_out_socket, pos);
	this.id2tool[0].connect(this.ControlPoints, left_out_socket, socket);
    }

    function C_move_controlpoint(cp_socket, pos) {
	this.id2tool[0].get_output(cp_socket).pos = [pos[0], pos[1]];
    }

    // socket always refers to the input interface, not to the socket number in this.ControlPoints
    function C_remove_controlpoint(cp_socket) {
	var input = this.id2tool[0].get_input(cp_socket);
	if (input[0] !== this.ControlPoints) {
	    console.error("Attempt to remove a controlpoint that isn't a controlpoint.");
	    return;
	}
	this.id2tool[0].disconnect(cp_socket);
	this.ControlPoints.remove_output(input[1]);
    }

    // returns tool id
    function C_create_line(left_out_socket1, left_out_socket2) {
	var line = LineTool.create();
	line.connect(this.id2tool[0], left_out_socket1, 0);
	line.connect(this.id2tool[0], left_out_socket2, 1);
	// line.initialize(undobuffer)
	this.add_tool_with_intersections(line);
	return line.id;
    }

    // returns tool id
    function C_create_circle(left_out_socket1, left_out_socket2) {
	
	var circle = CircleTool.create(); // OF andere constructie
	
	circle.connect(this.id2tool[0], left_out_socket1, 0);
	circle.connect(this.id2tool[0], left_out_socket2, 1);

	// initialisatie

	this.add_tool_with_intersections(circle);

	return circle.id;
    }

    // removes the tool with the given id and all later tools (intersections) in the tools array
    function C_remove_tool(id) {
	while (this.tools.length > 0) {
	    var t = this.tools.pop();
	    var t2 = this.id2tool.pop();
	    if (t!==t2) { console.error("remove_tool can only remove tools that have not been shuffled yet"); return; }
	    var t_id = t.id;
	    t.destroy();
	    console.log("Destroyed tool with id="+t_id+", looking for "+id+", #left="+this.tools.length);
	    if (t_id==id) return;
	}
	console.error("Cannot find the tool with the given id "+id+" in C_remove_tool");
    }

    function C_shuffle_tools(ids) {
	var res = [];
	for (var i=0; i<ids.length; i++) {
	    res.push(this.tools[i].id);
	    this.tools[i] = this.id2tool[ids[i]];
	}
	return res;
    }

    /* We are the container for the new compoundtool.
       The container_sockets are the output sockets in our input interface that will be
       connected to the new compoundtool.
    */
    function C_embed(savestatename) {
	var savestate = Storage.getobj(savestatename);
	if (!savestate) { console.error("Error in embedding: cannot obtain savestate"); return;	}
	var new_ct = CompoundTool.create(this);
	new_ct.initialize(savestate[1]); // TODO remove socket array from savestate
	this.add_tool_with_intersections(new_ct); // new_ct is now given the right id

	// now rewire all new_ct's controlpoints via this compoundtool's input interface
	var ii = this.id2tool[0];
	for (var i=0; i<new_ct.max_input_socket(); i++) {
	    var input = new_ct.get_input(i);
	    if (input) {
		assert(input[0]===CompoundTool.ControlPoints, 
		       "Embedded compoundtool has non-controlpoint input?!");
		var my_socket = ii.first_free_input();
		new_ct.disconnect(i);
		new_ct.connect(ii, my_socket, i);
		ii.connect(CompoundTool.ControlPoints, input[1], my_socket);
	    }
	}
	return new_ct.id;
    }

    // before doing any redirections, use shuffle_tools to make sure the new target is to the left
    // of the right_tool in the connection
    function C_redirect(connection, new_target) {
	var right_tool = this.id2tool[connection[2]];
	var new_target_tool = this.id2tool[new_target[0]];
	if (connection[4]) {
	    right_tool.untie(connection[3]);
	    right_tool.tie(new_target[0], new_target[1], connection[3]);
	} else {
	    right_tool.disconnect(connection[3]);
	    right_tool.connect(new_target_tool, new_target[1], connection[3]);
	}
    }

    // before doing any ties, use shuffle_tools to make sure the new target is to the left
    // of the right_tool in the connection
    function C_tie(left_id, left_out_socket, right_id, right_out_socket) {
	this.id2tool[right_id].tie(this.id2tool[left_id], left_out_socket, right_out_socket);
    }

    function C_untie(right_id, right_out_socket) {
	this.id2tool[right_id].untie(right_out_socket);
    }

    function C_connect_output(left_tool_id, left_out_socket, right_in_socket) {
	this.id2tool[1].connect(this.id2tool[left_tool_id], left_out_socket, right_in_socket);
    }

    function C_disconnect_output(left_tool_id, left_out_socket, right_in_socket) {
	this.id2tool[1].disconnect(right_in_socket);
    }

});

