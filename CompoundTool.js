"use strict";

var CompoundTool = Tool.extend(function() {

    this.create = function() {
	return this.extend(function() {
	    this.tools = [];
	    this.id2tool = [];
	});
    }

    this.connect = function(src_tool, src_socket, dst_socket) {
	this.id2tool[0].connect(src_tool, src_socket, dst_socket);
    }

    this.disconnect = function(dst_socket) {
	this.id2tool[0].disconnect(dst_socket);
    }

    this.tie = function(left_tool, left_out_socket, right_out_socket) {
	// this.output_interface.tie(left_tool, left_out_socket, right_out_socket);
	console.error("Cannot tie a compoundtool yet");
    }

    this.untie = function(right_out_socket) {
	console.error("Cannot untie a compoundtool yet");
	// this.output_interface.untie(right_out_socket);
    }
    
    this.recalculate = function() {
	for (var i = 0; i < this.tools.length; i++) {
	    this.tools[i].recalculate();
	}
    }

    this.destroy = function() {
	for (var i=0; i<this.id2tool.length; i++) {
	    this.id2tool[i].destroy();
	}
    }


    this.has_graphics = function() { console.error("Not implemented"); return true; } // this.output_interface.has_graphics(); }
    this.add_graphics = function() { console.error("Not implemented"); } // this.output_interface.add_graphics(); }
    this.update_graphics = function() { console.error("Not implemented"); } // this.output_interface.update_graphics(); }


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
	    for (var i=0; i<n_existing_tools; i++) {
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

    this.max_input_socket = function() { return this.id2tools[0].max_output_socket(); }
   

    /* Assumes the main compoundtool to have been recalculated.
     * candidates[left_tool_id + ":" + left_out_socket][right_tool_id] = 
                                        [left_tool_id, right_tool_id, left_out_socket, left_index, right_index]
     * if src_tool has an output that is equal to dst_tool at dst_socket
     */
    function find_duplicates() {
	console.log("Searching for duplicates");

	var candidates = initialise_candidates(this.tools);
	report("Initialised candidates", candidates);
	var cpt = this.id2tool[0];
	var state = cpt.get_state();
	for (var tst=0; tst<5; tst++) {
	    cpt.randomize();
	    this.recalculate();
	    filter(candidates);
	}
	cpt.restore_state(state);
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
		var str = first[0].id+"@"+first[2]+" is duplicated in tool(s) ";
		for (var j=0; j<right_keys.length; j++) {
		    var item = right_hash[right_keys[j]];
		    if (j>0) str = str + " ; ";
		    str = str + item[1].id;
		}
		console.log(str);
	    }
	}

	function initialise_candidates(tools) {
	    // Initialise list = [[tool, tool_index, pos, output_socket], ...],
	    // filtered for valid, untied points and sorted by x-coordinate. Include CPT
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
	    // is a candidate for snapping to the tool with lower index.
	    var map = {};
	    var j=0;
	    for (var i=1; i<list.length; i++) {
		var list_i = list[i];
		var ix = list_i[2][0];
		while (j<list.length && ix - list[j][2][0] > SMALL) { j++; }
		for (var k=j; k<list.length; k++) {
		    if (i==k) continue;
		    var list_k = list[k];
		    if (list_k[2][0] - ix >= SMALL) break;
		    if (Point.distance_cc(list_k[2], list_i[2])<SMALL) {
			// figure out who's source and who's destination
			var info = list_k[1] > list_i[1] 
			    ? [ list_i[0], list_k[0], list_i[3], list_i[1], list_k[1] ]  // i is destination
			    : [ list_k[0], list_i[0], list_k[3], list_k[1], list_i[1] ];
			// info is [left_tool, right_tool, left_out_socket, left_index, right_index]
			var left_key = info[0]+":"+info[2];
			var right_hash = map[left_key];
			if (!right_hash) { right_hash = {}; map[left_key] = right_hash; }
			right_hash[info[1]] = info;
		    }
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
		    var src = info[1], gizmo = info[0].get_output(info[2]);
		    var matching_outputs = src.get_matching_outputs(gizmo);
		    if (matching_outputs.length>1) {
			console.log("I found more than one matching output, so this is the really weird case");
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

    function tools2ids(tools) { return tools.map(function(tool) { return tool.id; }); }
    function ids2tools(ids)   { var id2tool = this.id2tool; return ids.map(function(id) { return id2tool[id]; }); }

    /* ------------------------------- Used from State ----------------------------------------- */ 

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
		if (!info[1].get_tie(right_out_socket)) {
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
		var gizmo, sprite;
		var tie = t.get_tie(j);
		if (!tie) { gizmo = t.get_gizmo(j); if (t.has_graphics() && gizmo) sprite = t.get_sprite(j); }
		if (gizmo || tie) {
		    var info = [tool_id, j, gizmo, sprite, tie];
		    if (func.apply(undefined, info)) res.push(info);
		}
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

    // returns socket
    function C_create_controlpoint(cp_out_socket, pos) {
	this.id2tool[0].add(cp_out_socket, pos);
    }

    function C_move_controlpoint(cp_out_socket, pos) {
	this.id2tool[0].get_output(cp_out_socket).pos = [pos[0], pos[1]];
    }

    function C_remove_controlpoint(cp_out_socket) {
	this.id2tool[0].remove_output(cp_out_socket);
    }

    // returns tool id
    function C_create_line(left_out_socket1, left_out_socket2) {
	var line = LineTool.create();
	line.connect(this.id2tool[0], left_out_socket1, 0);
	line.connect(this.id2tool[0], left_out_socket2, 1);
	this.add_tool_with_intersections(line);
	return line.id;
    }

    // returns tool id
    function C_create_circle(left_out_socket1, left_out_socket2) {
	var circle = CircleTool.create();
	circle.connect(this.id2tool[0], left_out_socket1, 0);
	circle.connect(this.id2tool[0], left_out_socket2, 1);
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

    function C_load_tool(filename) {
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

});
