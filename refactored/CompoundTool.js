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

    this.tie = function(src_socket, dst_tool, dst_socket) {
	this.output_interface.tie(src_socket, dst_tool, dst_socket);
    }

    this.untie = function(socket) {
	this.output_interface.untie(socket);
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

    // invariant: every tool's inputs refer to tools earlier in the tools array, or to the controlpoint tool
    this.separate = function(tool, socket) {
	var dependent = {}; // hashes dependent tools that have been seen
	var dependent_tools = [];

	var i_wr = 0;
	for (var i_rd=0; i_rd<this.tools.length; i_rd++) {
	    var t = this.tools[i_rd];
	    var dep = check_dependent(t);
	    if (dep) {
		dependent_tools.push(t);
		dependent[t.id] = true;
	    } else {
		this.tools[i_wr++] = t;
	    }
	}
	if (i_rd-i_wr != dependent_tools.length) console.error("This should not happen");
	for (var i=0; i<i_rd-i_wr; i++) { this.tools[i_wr+i] = dependent_tools[i]; }
	
	return i_wr;

	// tool is dependent on the controlpoint if its inputs refer to either another dependent tool, or
	// to the controlpoint tool with the correct socket
	function check_dependent(t) {
	    for (var i=0; i<t.max_input_socket(); i++) {
		var inp = t.get_input(i);
		if (!inp) continue;
		if ((inp[0]===tool && inp[1]==socket) || dependent[inp[0].id]) return true;
	    }
	    return false;
	}
    }
   
    this.get_tools = function(num_indep) {
	return [this.tools.slice(0, num_indep), this.tools.slice(num_indep, this.tools.length)];
    }

    /* Assumes the main compoundtool to have been recalculated.
     * candidates[dst_tool_id + ":" + dst_socket][src_tool_id] = [dst_tool, src_tool, dst_socket] 
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
	    var dst = Object.keys(candidates);
	    console.log(msg+": found "+dst.length+" duplicate target(s):");
	    for (var i=0; i<dst.length; i++) {
		var src_hash = candidates[dst[i]];
		var src = Object.keys(src_hash);
		var first = src_hash[src[0]];
		if (!first) {console.log("src="+src+" src.length="+src.length+", src[0]="+src[0]); }
		var str = first[0].id+"@"+first[2]+" is duplicated in tool(s) ";
		for (var j=0; j<src.length; j++) {
		    var item = src_hash[src[j]];
		    if (j>0) str = str + " ; ";
		    str = str + item[1].id;
		}
		console.log(str);
	    }
	}

	function initialise_candidates(tools) {
	    // Initialise list = [[tool, tool_index, pos, output_socket], ...],
	    // filtered for valid points and sorted by x-coordinate. Include CPT
	    var list = [];
	    for (var index=-1; index < tools.length; index++) {
		var tool = index<0 ? cpt : tools[index];
		for (var output_socket = 0; output_socket < tool.max_output_socket(); output_socket++) {
		    var gizmo = tool.get_output(output_socket);
		    if (!gizmo || !gizmo.valid || gizmo.type != "point") continue;
		    list.push([tool, index, gizmo.pos, output_socket]);
		}
	    }
	    list.sort(function(a,b) { return a[2][0] - b[2][0]; });
	    
	    // Find all candidates: tools that are sufficiently close together. Tool with higher index
	    // is a candidate for snapping to the tool with lower index.
	    // Construct a map dst_id+":"+dst_sock -> src_id -> [dst, src, dst_socket, dst_index, src_index]
	    // (dst is the snap target, the tool with lower index)
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
			var dst_src_sock = list_k[1] > list_i[1] 
			    ? [ list_i[0], list_k[0], list_i[3], list_i[1], list_k[1] ]  // i is destination
			    : [ list_k[0], list_i[0], list_k[3], list_k[1], list_i[1] ];
			var dst_key = dst_src_sock[0].id+":"+dst_src_sock[2];
			var src_hash = map[dst_key];
			if (!src_hash) { src_hash = {}; map[dst_key] = src_hash; }
			src_hash[dst_src_sock[1].id] = dst_src_sock;
		    }
		}
	    }
	    return map;
	}

	// Tests candidates the given map, removing targets that turn out to be different.
	function filter(candidates) {
	    var dst_keys = Object.keys(candidates);
	    for (var dst_ix=0; dst_ix<dst_keys.length; dst_ix++) {
		var dst_key = dst_keys[dst_ix];
		var src_hash = candidates[dst_key];
		var src_tool_ids = Object.keys(src_hash);
		var deleted = 0;
		for (var src_ix=0; src_ix<src_tool_ids.length; src_ix++) {
		    var src_key = src_tool_ids[src_ix];
		    var dst_src_sock = src_hash[src_key];
		    var src = dst_src_sock[1], gizmo = dst_src_sock[0].get_output(dst_src_sock[2]);
		    var matching_outputs = src.get_matching_outputs(gizmo);
		    if (matching_outputs.length>1) {
			console.log("I found more than one matching output, so this is the really weird case");
		    }
		    if (matching_outputs.length==0) {
			// these turn out not to be equal
			delete src_hash[src_key];
			deleted++;
			if (deleted == src_tool_ids.length) delete candidates[dst_key];
		    }
		}

	    }
	}
    }

});
