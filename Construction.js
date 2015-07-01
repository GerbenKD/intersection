"use strict";

var Construction = CompoundTool.extend(function() {
	
	this.typename = "Construction"; // intended for debugging
	
	
	this.create = function() {
		var instance = CompoundTool.create.call(this); 
		instance.ControlPoints = ControlPointTool.create();
		return instance;
	}
		
	this.redraw = function(svg_object) {
		this.recalculate();
		var set = {};
		this.ControlPoints.build_draw_set(set);
		this.build_draw_set_with_internals(set);
		svg_object.redraw(set);
	}
	
	function add_to_bbox(bbox, pos) {
		if (bbox.length==0) { bbox.push(pos[0],pos[1],0,0); return; }
		if (pos[0] < bbox[0]) bbox[0]=pos[0]; else if (pos[0] > bbox[0]+bbox[2]) bbox[2] = pos[0]-bbox[0];
		if (pos[1] < bbox[1]) bbox[1]=pos[1]; else if (pos[1] > bbox[1]+bbox[3]) bbox[3] = pos[1]-bbox[1];
	}
	
	
	this.change_bounding_box = function(bbox_orig, bbox_new) {
		var cp = this.ControlPoints.get_state();
		for (var i=0; i<cp.length; i++) {
			if (cp[i]) cp[i] = [(cp[i][0]-bbox_orig[0])/bbox_orig[2] * bbox_new[2] + bbox_new[0],
			                    (cp[i][1]-bbox_orig[1])/bbox_orig[3] * bbox_new[3] + bbox_new[1]];
		}
		this.ControlPoints.restore_state(cp);
		this.recalculate();
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
			if (input[0]===this.ControlPoints) {
				input[0].remove_output(input[1]);
			}
		}
	}

	
});