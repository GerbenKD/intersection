"use strict";


var CPPos = new function() {

    this.extend = function(constr) { constr.prototype = this; return new constr(); }

    this.create = function(owner, pos) {
	return this.extend(function() {
	    this.owner = owner;
	    this.pos = pos;
	});
    }

    this.clone = function() {
	var old_me = this;
	return CPPos.extend(function() {
	    this.pos = old_me.pos.slice(0);
	    this.owner = old_me.owner;
	});
    }

    this.scale = function(bbox0, bbox1) {
	var old_me = this;
	return CPPos.extend(function() {
	    var new_pos = [];
	    this.owner = old_me.owner;
	    for (var i=0; i<old_me.pos.length; i++) {
		var p = old_me.pos[i];
		if (!p) continue;
		new_pos[i] = [(p[0]-bbox0[0])/bbox0[2] * bbox1[2] + bbox1[0],
			      (p[1]-bbox0[1])/bbox0[3] * bbox1[3] + bbox1[1]];
	    }
	    this.pos = new_pos;
	});
    }

    this.move = function() {
	for (var i=0; i<this.pos.length; i++) {
	    var p = this.pos[i];
	    if (!p) continue;
	    var gizmo = this.owner.listen(i);
	    gizmo.pos = [p[0], p[1]];
	}
    }
}();
