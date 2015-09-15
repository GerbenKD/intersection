/*

  A socket is the integer identifier of an input or output in a tool

  A connection is [left_tool, left_output_socket, right_tool, right_socket, is_tie].

  =================================== Tool: ==================================
  - abstract tool.create()             - create an instance of this tool class
  - abstract tool.connect(src_tool, src_socket, dst_socket)
  - abstract tool.disconnect(dst_socket)
  - abstract tool.recalculate(num_indep) - update the outputs and the valid status of the tool, skipping independents
  - abstract tool.max_input_socket()   - returns a number greater than all used input socket numbers
  - abstract tool.max_output_socket()  - returns a number greater than all used output socket numbers
  - abstract tool.get_input(socket)    - returns [input_tool, output_socket]
  - abstract tool.get_output(socket)   - returns output gizmo at that socket
  - abstract tool.tie(src_socket, dst_tool, dst_socket) - fix and mirror dst_tool's output at src_socket
  - abstract tool.untie(socket)        - untie the tool, upon recalculate will reconstruct its own output
  - abstract tool.create_output(socket)- create an uninitialized output gizmo at given socket
  - abstract tool.delete_output(socket)- delete an output gizmo at given socket
  - tool.listen(socket)                - get gizmo at an input
  - tool.get_matching_outputs(gizmo)   - get output sockets that match the gizmo
  ================================ BasicTool: =================================
  hidden fields:
  - bt.inputs    - [ [src_tool, src_socket], ... ]
  - bt.outputs   - [ gizmo, ... ]

  additional methods:

  - bt.add_output    - add an output gizmo to a tool
  - bt.remove_output - remove an output gizmo
*/


var Tool = new function() {

    // Conveniently construct a subclass or instance. Each tool is given an id.
    this.extend = function(constr) { 
	constr.prototype = this;
	return new constr();
    }

    this.first_free_input = function() {
	var socket;
	for (socket = 0; socket < this.max_input_socket(); socket++) {
	    if (!this.get_input(socket)) break;
	}
	return socket;
    }

    this.first_free_output = function() {
	var socket;
	for (socket = 0; socket < this.max_output_socket(); socket++) {
	    if (!this.get_output(socket)) break;
	}
	return socket;
    }

    // return the Gizmo at the given input
    this.listen = function(socket) {
	var connection = this.get_input(socket);
	return connection && connection[0].get_output(connection[1]);
    }

    this.get_matching_outputs = function(gizmo) {
	var matches = [];
	for (var i=0; i<this.max_output_socket(); i++) {
	    var out_gizmo = this.get_output(i);
	    if (out_gizmo && out_gizmo.equals(gizmo)) {
		matches.push(i);
	    } 
	}
	return matches;
    }

    // returns all incoming connections, including ties.
    this.incoming_connections = function() {
	var res = [];
	for (var i=0; i<this.max_input_socket(); i++) {
	    var conn = this.get_input(i);
	    if (conn) res.push([conn[0], conn[1], this, i, false]);
	}
	for (var i=0; i<this.max_output_socket(); i++) {
	    var pos = this.get_tie(i);
	    if (!pos) continue;
	    /* Uncomment to follow tie chains (I currently think this should not be necessary)
	       while (true) {
	       var newpos = pos[0].get_tie(pos[1]);
	       if (!newpos) break;
	       pos = newpos;
	       }
	    */
	    if (this.id==8) {
		console.log("incoming connections: "+pos[0].id+":"+pos[1]+" at input "+i);
	    }
	    res.push([pos[0], pos[1], this, i, true]);
	}
	return res;
    }

    this.build_draw_set = function(set) {
	for (var i=0; i<this.max_output_socket(); i++) {
	    var gizmo = this.get_output(i);
	    if (gizmo) set[gizmo.id] = gizmo;
	}
    }

};



var BasicTool = Tool.extend(function() {

    this.create = function(fields) {
	return this.extend(function() {
	    this.inputs   = [];
	    this.gizmos  = [];
	    this.ties     = [];
	    for (var key in fields) { this[key] = fields[key]; }
	});
    }


    this.destroy = function() {
	for (var i=0; i<this.max_output_socket(); i++) {
	    this.remove_output(i);
	}
	this.inputs = [];
    }

    // --------------------------------- inputs ----------------------------------

    this.num_input_sockets = function() {
	var n = 0;
	for (var i=0; i<this.max_input_socket(); i++) {
	    if (this.inputs[i]) n++;
	}
	return n;
    }

    this.num_output_sockets = function() {
	var n = 0;
	for (var i=0; i<this.max_output_socket(); i++) {
	    if (this.outputs[i] || this.ties[i]) n++;
	}
	return n;
    }

    this.max_input_socket = function() { return this.inputs.length; }

    this.get_input = function(socket) { return this.inputs[socket]; }

    this.connect = function(left_tool, left_out_socket, right_in_socket) {
	// rudimentary sanity check
	if (this.inputs[right_in_socket]) {
	    console.error("Disconnect socket "+right_in_socket+" first"); return;
	}
	this.inputs[right_in_socket] = [left_tool, left_out_socket];
    }

    this.disconnect = function(right_in_socket) {
	assert(this.inputs[right_in_socket], "Attempt to disconnect an unconnected socket "+right_in_socket);
	this.inputs[right_in_socket] = undefined;
    }

    // ----------------------------------- ties ----------------------------------

    this.tie = function(left_tool, left_out_socket, right_out_socket) {
	if (this.ties[right_out_socket]) {
	    console.error("Untie socket "+right_out_socket+" first"); return;
	}
	this.remove_output(right_out_socket);
	this.ties[right_out_socket] = [left_tool, left_out_socket];
    }

    this.get_tie = function(right_out_socket) {
	return this.ties[right_out_socket];
    }

    this.destroy_tie = function(socket) {
	if (!this.ties[socket]) {
	    console.error("Attempt to destroy a tie in an untied socket, "+socket); return;
	}
	this.ties[socket] = undefined;

    }

    this.untie = function(socket) {
	this.destroy_tie(socket);
	this.create_output(socket);
    }

    // ----------------------------------- gizmos --------------------------------------------

    this.max_output_socket = function() { 
	var max = 0;
	if (this.gizmos) max=this.gizmos.length;
	if (this.ties) { var len = this.ties.length; if (len>max) max=len; }
	return max;
    }

    this.create_output = function(socket) {
	if (this.gizmos[socket]) {
	    console.error("Attempt to create a gizmo at socket "+socket+", but it already exists");
	    return;
	}
	this.gizmos[socket] = this.create_output_gizmo(socket);
    }

    this.remove_output = function(socket) {
	if (this.get_tie(socket)) this.untie(socket);
	if (this.gizmos[socket]) this.gizmos[socket] = undefined;

	if (this.gizmos[socket]) {
	    this.gizmos[socket].destroy();
	    this.gizmos[socket] = undefined;
	}
    }

    this.get_output = function(socket) { 
	var tie = this.get_tie(socket);
	return tie ? tie[0].get_output(tie[1]) : this.gizmos[socket];
    }
});

var LineTool = BasicTool.extend(function() {


    this.recalculate = function() {
	this.gizmos[0].p1 = this.listen(0).pos;
	this.gizmos[0].p2 = this.listen(1).pos;
    }

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return Line.create(); }

});


var CircleTool = BasicTool.extend(function() {

    this.recalculate = function() {
	this.gizmos[0].center = this.listen(0).pos;
	this.gizmos[0].border = this.listen(1).pos;
    }

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return Circle.create(); }

});


var CCI_Tool = BasicTool.extend(function() {

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	instance.create_output(1);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return ConstructedPoint.create(); }

    this.solutions = function(p1, p2) {
	if (this.ties[0]) {
	    var tied_output_pos = this.get_output(0).pos;
	    this.gizmos[1].pos = Point.distance_cc(p1, tied_output_pos).abs() < SMALL ? p2 : p1;
	} else if (this.ties[1]) {
	    if (this.ties[1][0]===this) {
		this.gizmos[0].pos = p1;
		// p2 should be equal to p1 in this case, that's why the tie is there
	    } else {
		var tied_output_pos = this.get_output(1).pos;
		this.gizmos[0].pos = Point.distance_cc(p1, tied_output_pos).abs() < SMALL ? p2 : p1;
	    }
	} else {
	    this.gizmos[0].pos = p1;
	    this.gizmos[1].pos = p2;
	}
    }


    /*

      CCI: als de cirkels dezelfde straal hebben, worden de pos velden van de output gizmos undefined.
      CLI: de output gizmos hebben een pos die nooit undefined is, maar soms wel complex
      LLI: de output gizmo heeft een pos die undefined is als de lijnen parallel lopen.

      valid flag wordt opgedoekt, maar alle code moet kunnen omgaan met undefined positions

      Controlpoints hebben een complexe position (zoals alle point gizmos)
      Maar undo buffer events ("move_controlpoint") hebben re\"eele posities.

      Undo gooit de redo history pas weg als er een undo_frame optreedt.
      Redo doet eerst undo van CURRENT (die daarna verdwijnt) en dan REDO van het huidige frame.

     */

    this.recalculate = function() {
	if (this.ties[0] && this.ties[1]) return; // our hands are tied!
	var circle1 = this.listen(0), circle2 = this.listen(1); // nieuw
	if (!circle1.is_defined() || !circle2.is_defined()) {
	    if (!this.ties[0]) { this.gizmos[0].pos = undefined; }
	    if (!this.ties[1]) { this.gizmos[1].pos = undefined; }
	    return;
	}
	
	var x1  = circle1.center[0], y1  = circle1.center[1], r1 = circle1.radius(),
	    x2  = circle2.center[0], y2  = circle2.center[1], r2 = circle2.radius();

	var dx = x2.sub(x1), dy = y2.sub(y1);
	var d2 = dx.square().add(dy.square());

	if (d2.abs()<SMALL2) {
	    // the circle centres are too close together
	    if (!this.ties[0]) { this.gizmos[0].pos = undefined; }
	    if (!this.ties[1]) { this.gizmos[1].pos = undefined; }
	    return;
	}
	    
	var D = r1.add(r2).square().div(d2).sub(Cplx.one).mul(Cplx.one.sub(r1.sub(r2).square().div(d2)));

	var half = Cplx.create(0.5, 0);
	var dr2 = r1.square().sub(r2.square()).div(d2).mul(half);
	var xs = x1.add(x2).mul(half).add(dx.mul(dr2));
	var ys = y1.add(y2).mul(half).add(dy.mul(dr2));

	var K = D.sqrt().mul(half);
	var xt = dy.mul(K);
	var yt = dx.mul(K).neg();

	this.solutions([xs.add(xt), ys.add(yt)], [xs.sub(xt), ys.sub(yt)]);
    }
});


var LCI_Tool = BasicTool.extend(function() {

    this.typename = "LCI_Tool"; // intended for debugging

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	instance.create_output(1);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return ConstructedPoint.create(); }
    
    this.solutions = function(p1, p2) {
	if (this.ties[0]) {
	    var tied_output_pos = this.get_output(0).pos;
	    this.gizmos[1].pos = Point.distance_cc(p1, tied_output_pos).abs() < SMALL ? p2 : p1;
	} else if (this.ties[1]) {
	    if (this.ties[1][0]===this) {
		this.gizmos[0].pos = p1;
		// p2 should be equal to p1 in this case, that's why the tie is there
	    } else {
		var tied_output_pos = this.get_output(1).pos;
		this.gizmos[0].pos = Point.distance_cc(p1, tied_output_pos).abs() < SMALL ? p2 : p1;
	    }
	} else {
	    this.gizmos[0].pos = p1;
	    this.gizmos[1].pos = p2;
	}
    }

    this.recalculate = function() {
	if (this.ties[0] && this.ties[1]) return; // our hands are tied!
	
	var line = this.listen(0), circle = this.listen(1);
	if (!line.is_defined() || !circle.is_defined()) {
	    if (!this.ties[0]) { this.gizmos[0].pos = undefined; }
	    if (!this.ties[1]) { this.gizmos[1].pos = undefined; }
	    return;
	}
	

	// convert inputs to complex numbers
	var cx  = circle.center[0],  cy = circle.center[1];
	var cbx = circle.border[0], cby = circle.border[1];
	var l1x = line.p1[0], l1y = line.p1[1];
	var l2x = line.p2[0], l2y = line.p2[1];
	// done

	var r2 = cx.sub(cbx).square().add(cy.sub(cby).square());
	var x1 = l1x.sub(cx), y1 = l1y.sub(cy);
	var x2 = l2x.sub(cx), y2 = l2y.sub(cy);
	var dx = x2.sub(x1), dy = y2.sub(y1);
	var dr2 = dx.square().add(dy.square());
	var D = x1.mul(y2).sub(x2.mul(y1));
	var R = r2.mul(dr2).sub(D.square());
	var sqrtR = R.sqrt().div(dr2);
	var xt = dx.mul(sqrtR), yt = dy.mul(sqrtR);
	
	D = D.div(dr2);
	var xs = cx.add(D.mul(dy));
	var ys = cy.sub(D.mul(dx));

	this.solutions([xs.add(xt), ys.add(yt)], [xs.sub(xt), ys.sub(yt)]);
    }
});

var LLI_Tool = BasicTool.extend(function() {

    this.typename = "LLI_Tool"; // intended for debugging

    this.create = function() {
	var instance = BasicTool.create.call(this);
	instance.create_output(0);
	return instance;
    }

    this.create_output_gizmo = function(socket) { return ConstructedPoint.create(); }

    this.recalculate = function() {
	if (this.ties[0]) return; // our single sad hand is tied
	var line1 = this.listen(0), line2 = this.listen(1);
	if (!line1.is_defined() || !line2.is_defined()) {
	    this.gizmos[0].pos = undefined; return;
	}
	var x1 = line1.p1[0], y1 = line1.p1[1],
	    x2 = line1.p2[0], y2 = line1.p2[1],
	    x3 = line2.p1[0], y3 = line2.p1[1],
	    x4 = line2.p2[0], y4 = line2.p2[1];
	var x12 = x1.sub(x2), x34=x3.sub(x4), y12=y1.sub(y2), y34=y3.sub(y4);
	var cos_t = x12.mul(x34).add(y12.mul(y34)).div(x12.square().add(y12.square()).mul(x34.square().add(y34.square())).sqrt());
	if (Math.abs(cos_t.abs()-1)<0.000001) { this.gizmos[0].pos = undefined; return; }
	var N = x12.mul(y34).sub(y12.mul(x34));
	var f1 = x1.mul(y2).sub(y1.mul(x2)), f2 = x3.mul(y4).sub(y3.mul(x4));
	var xi = f1.mul(x34).sub(x12.mul(f2)).div(N);
	var yi = f1.mul(y34).sub(y12.mul(f2)).div(N);

	this.gizmos[0].pos = [xi, yi]; 
    }
});
