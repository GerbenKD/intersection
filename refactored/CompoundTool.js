"use strict";

/*
  =============================== CompoundTool: ===============================
  hidden fields:
  - ct.input_interface
  - ct.output_interface
  - ct.tools             - [ tool, tool, ... ] - in topological sorted order
  - ct.graphics_level (1 = outputs, 2 = everything)

  additional methods:
  - ct.add_tool(tool)                  - add a new tool to the compound tool
  - ct.get_tools(num_indep, dependent) - returns all dependent / independent tools given the number of independents
*/


var InterfaceTool = BasicTool.extend(function() {

    this.create_output_gizmo = function(socket) { return this.listen(socket); } // this is teh shit

    this.connect = function(src_tool, src_socket, dst_socket) {
	BasicTool.connect.call(this, src_tool, src_socket, dst_socket);
	this.create_output(dst_socket);
    }
    
    this.disconnect = function(socket) {
	BasicTool.disconnect.call(this, socket);
	this.delete_output(socket);
    }
    
    // by copying over the inputs every recalculation we ensure that tools can change their output gizmos
    // if they want
    this.recalculate = function() {
	for (var i = 0; i < this.inputs.length; i++) {
	    if (this.inputs[i] && this.tied[i]) {
		this.outputs[i] = this.listen(i);
	    }
	}
    }
    
});


var CompoundTool = Tool.extend(function() {

    this.create = function() {
	return this.extend(function() {
	    this.input_interface  = InterfaceTool.create();
	    this.output_interface = InterfaceTool.create();
	    this.tools = [];
	});
    }

    this.connect = function(src_tool, src_socket, dst_socket) {
	this.input_interface.connect(src_tool, src_socket, dst_socket);
    }

    this.disconnect = function(dst_socket) {
	this.input_interface.disconnect(dst_socket);
    }

    this.tie = function(left_tool, left_out_socket, right_out_socket) {
	this.output_interface.tie(left_tool, left_out_socket, right_out_socket);
    }

    this.untie = function(right_out_socket) {
	this.output_interface.untie(right_out_socket);
    }
    
    this.recalculate = function(num_indep) {
	if (!num_indep) num_indep = 0;
	this.input_interface.recalculate();
	for (var i = num_indep; i < this.tools.length; i++) {
	    this.tools[i].recalculate();
	}
	this.output_interface.recalculate();
    }

    this.add_graphics = function(lvl) {
	this.graphics_level = lvl;
	switch (lvl) {
	case 1:
	    this.output_interface.add_graphics();
	    break;
	case 2:
	    // TODO perhaps outputs should have a special look, or something
	    for (var i=0; i<this.tools.length; i++) {
		this.tools[i].add_graphics();
	    }
	    break;
	default:
	    console.error("Bad graphics level!");
	    break;
	}
    }

    this.has_graphics = function() { return this.graphics_level; }
    
    this.update_graphics = function(num_indep) {
	if (!this.graphics_level) return;
	if (!num_indep) num_indep = 0;
	switch (this.graphics_level) {
	case 1:
	    this.output_interface.update_graphics();
	    break;
	case 2:
	    for (var i=num_indep; i<this.tools.length; i++) {
		this.tools[i].update_graphics();
	    }
	    break;
	default:
	    console.error("Graphics level "+this.graphics_level+" not implemented in update_graphics");
	    break;
	}
    }

    this.add_tool = function(tool) {
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
	this.tools.push(tool);

	var gr = this.graphics_level==2 && !tool.graphics;
	if (gr) tool.add_graphics();

	for (var j=0; j<tool.max_output_socket(); j++) {
	    var gizmo = tool.get_output(j);
	    if (!gizmo) continue;
	    if (gizmo.type == "point") continue;
	    for (var i=0; i<n_existing_tools; i++) {
		var test_tool = this.tools[i];
		for (var k=0; k<test_tool.max_output_socket(); k++) {
		    var test_gizmo = test_tool.get_output(k);
		    if (!test_gizmo) continue;
		    if (test_gizmo.type == "point") continue;
		    var itool = create_intersection(tool, j, gizmo, test_tool, k, test_gizmo);
		    if (gr) itool.add_graphics();
		    this.tools.push(itool);
		}
	    }
	}
    }

     
    this.get_input  = function(socket) { return this.input_interface.get_input(socket);   }
    this.get_output = function(socket) { return this.output_interface.get_output(socket); }
    this.get_sprite = function(socket) { return this.output_interface.get_sprite(socket); }
    this.max_output_socket = function() { return this.output_interface.max_output_socket(); }
    this.max_input_socket = function() { return this.input_interface.max_input_socket(); }

    // invariant: every tool's inputs/ties refer to tools earlier in the tools array, or to the controlpoint tool
    this.separate = function(tool, socket) {
	var dependent = {}; // hashes dependent tools that have been seen
	var dependent_tools = [];

	var i_wr = 0;
	for (var i_rd=0; i_rd<this.tools.length; i_rd++) {
	    var t = this.tools[i_rd];
	    if (check_dependent(t)) {
		dependent_tools.push(t);
		dependent[t.id] = true;
	    } else {
		this.tools[i_wr++] = t;
	    }
	}
	if (i_rd-i_wr != dependent_tools.length) console.error("This should not happen");
	for (var i=0; i<i_rd-i_wr; i++) { this.tools[i_wr+i] = dependent_tools[i]; }
	
	return i_wr;

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
   
    this.get_tools = function(num_indep) {
	return [this.tools.slice(0, num_indep), this.tools.slice(num_indep, this.tools.length)];
    }


    /* Assumes the main compoundtool to have been recalculated.
     * candidates[left_tool_id + ":" + left_out_socket][right_tool_id] = 
                                        [left_tool, right_tool, left_out_socket, left_index, right_index]
     * if src_tool has an output that is equal to dst_tool at dst_socket
     */
    this.find_duplicates = function(cpt) {
	console.log("Searching for duplicates");

	var candidates = initialise_candidates(this.tools);
	report("Initialised candidates", candidates);
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
	    for (var index=-1; index < tools.length; index++) {
		var tool = index<0 ? cpt : tools[index];
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
			var left_key = info[0].id+":"+info[2];
			var right_hash = map[left_key];
			if (!right_hash) { right_hash = {}; map[left_key] = right_hash; }
			right_hash[info[1].id] = info;
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

});
