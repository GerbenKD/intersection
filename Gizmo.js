/* Gizmos no longer know their relationships to other gizmos,
   so they simply receive the relevant parents on the recalculate call.
   Connections are maintained by the tools.
 */


var Gizmo = new function() {

	this.extend = function() {
		var id = 0;
		return function(constr) { 
			constr.prototype = this;
			var instance = new constr();
			instance.id = id++;
			return instance;
		};
	}();

	this.create = function() {
		var instance = this.extend(function() {
			this.classes = {};
		}); 
		return instance;
	}

	this.remove_sprite = function() {
		if (this.sprite) delete this.sprite;
	}

	this.draw = function(graphics_state) {	
		if (!this.sprite) {
			this.create_sprite(graphics_state);
			for (var cls in this.classes) {
				if (this.classes[cls]) this.sprite.add_class(cls);
			}
		}
		if (this.is_visible()) {
			this.move_sprite(graphics_state);
			this.set_class("hidden", false);
		} else {
			this.set_class("hidden", true); 
		}
	}

	this.has_class = function(cls) { return this.classes[cls]; }

	this.set_class = function(cls, value) {
		if (this.classes[cls] ^ value) {
			this.classes[cls] = value;
			if (this.sprite) {
				if (value) this.sprite.add_class(cls); else this.sprite.remove_class(cls);
			}
		}
	}

}();


var Point = Gizmo.extend(function() {
	this.type = "point";

	this.dup = function() { return [this.pos[0], this.pos[1]]; }
	this.screen_pos = function() { return [this.pos[0].re, this.pos[1].re]; } // only use when visible

	this.equals = function(gizmo) {
		if (gizmo.type != "point" || gizmo.pos==undefined || this.pos==undefined) return false;
		return Point.distance_cc(this.pos, gizmo.pos).abs() < SMALL;
	}

	this.distance_cc = function(pos1, pos2) { 
		return pos1[0].sub(pos2[0]).square().add(pos1[1].sub(pos2[1]).square()).sqrt();
	}

	this.distance_pp = function(p1, p2) {
		return Point.distance_cc(p1.pos, p2.pos);
	}

	this.distance_to_c = function(pos) {
		return Point.distance_cc(this.pos, pos);
	}

	this.toString = function() {
		return "p("+this.pos[0]+","+this.pos[1]+")";
	}
	

});


var ConstructedPoint = Point.extend(function() {

	this.create_sprite = function() { 
		var sprite = Graphics.create_sprite("circle", "points");
		sprite.add_class("intersectionpoint");
		this.sprite = sprite;
	}

	this.is_defined = function() { return this.pos; }
	this.is_visible = function() { return this.is_defined() && !(this.pos[0].is_complex() || this.pos[1].is_complex()); }

	this.move_sprite = function(graphics_state) { 
		var r = Graphics.SCALE * 0.003 * graphics_state.scale;
		var f = graphics_state.suppress_internals;
		if (f==undefined) f=1;
		if (!this.has_class("output")) r *= 1-f;
		this.sprite.attrib({ "cx": this.pos[0].re, "cy": this.pos[1].re, "r": r }); 
		this.sprite.sprite_elt.style["stroke-width"] = r/3;
	}

});

var ControlPoint = Point.extend(function() {
	this.controlpoint = true;

	this.create = function(pos) {
		var instance = Point.create.call(this);
		instance.pos = pos;
		return instance;
	}

	this.is_defined = function() { return true; }
	this.is_visible = function() { return true; }


	this.create_sprite = function(graphics_state) {
		var sprite = Graphics.create_sprite("circle", "controlpoints");
		sprite.add_class("controlpoint");
		this.sprite = sprite;
	}

	this.move_sprite = function(graphics_state) {
		var r = Graphics.SCALE * graphics_state.scale;
		this.sprite.attrib({ "cx": this.pos[0].re, "cy": this.pos[1].re, "r": 0.006*r }); 
		this.sprite.sprite_elt.style["stroke-width"] = 0.001*r;
	}

});


var Line = Gizmo.extend(function() {

	this.type = "line";

	this.create_sprite = function() {
		var sprite = Graphics.create_sprite("line", "lines");
		sprite.add_class("line");
		this.sprite = sprite;
	}

	// returns the coordinates of the projection of (x,y) onto this line
	this.project_coords = function(pos) {
		var x1 = this.p1[0], y1 = this.p1[1],
		x2 = this.p2[0], y2 = this.p2[1];
		var bx = x2.sub(x1), by = y2.sub(y1), ax = pos[0].sub(x1), ay = pos[1].sub(y1);
		var b_len = bx.square().add(by.square()).sqrt();
		if (b_len.abs() < SMALL) return undefined; // the angle of the line is ill defined
		var b_hat_x = bx.div(b_len), b_hat_y = by.div(b_len);
		var a_scalar = ax.mul(b_hat_x).add(ay.mul(b_hat_y));
		return [x1.add(b_hat_x.mul(a_scalar)), y1.add(b_hat_y.mul(a_scalar))];
	} 

	this.distance_to_c = function(pos) {
		var p = this.project_coords(pos);
		return p ? Point.distance_cc(p, pos) : undefined;
	}

	this.is_defined = function() { return this.p1 && this.p2; }
	this.is_visible = function() {
		return this.is_defined() && !(this.p1[0].is_complex() || this.p1[1].is_complex() ||
				this.p2[0].is_complex() || this.p2[1].is_complex());
	}


	// output: suppress    0 => 0.003, 1 -> 0.001   
	// nonoutput: suppress 0 => 0.001, 1 -> 0
	this.move_sprite = function(graphics_state) {
		var r = Graphics.SCALE * 0.001 * graphics_state.scale;
		var f = graphics_state.suppress_internals;
		var sprite = this.sprite;
		if (f==undefined) f=1;
		r *= this.has_class("output") ? 3-2*f : 1-f; // TODO: use greyscales rather than line thickness to make it vanish
		var bbox;
		{ var bb = graphics_state.bbox;
		bbox = [bb[0]-2*r, bb[1]-2*r, bb[2]+4*r, bb[3]+4*r];
		}

		var real_p1 = [this.p1[0].re, this.p1[1].re];
		var real_p2 = [this.p2[0].re, this.p2[1].re];

		var exit1 = extend(real_p1, real_p2);
		var exit2 = extend(real_p2, real_p1);

		if (exit1!=undefined && exit2 != undefined) {
			sprite.attrib({ "x1": exit1[0], "y1": exit1[1], "x2": exit2[0], "y2": exit2[1]});
			sprite.sprite_elt.style["stroke-width"] = r;
		}

		// If the exits are undefined we can only hope that the old line runs
		// more or less in the right direction, or that the defining points are
		// moved to another position quickly! Also, avoid lines with 
		// parents[0]=parents[1].

		// extends the vector v1 -> v2 to the edge of the screen
		function extend(p1, p2) {
			var x = p1[0], dx = p2[0]-p1[0], y = p1[1], dy = p2[1]-p1[1];
			if (dx!=0) {
				var ix = dx>0 ? bbox[2] : 0;
				var iy = y + (ix-x)/dx * dy;
				if (iy>=0 && iy<=bbox[3]) return [ix, iy];
			}
			if (dy!=0) {
				var iy = dy>0 ? bbox[3] : 0;
				var ix = x+(iy-y)/dy * dx;
				if (ix>0 && ix<=bbox[2]) return [ix, iy];
			}
			return undefined;
		}
	}
	
	this.toString = function() {
		return "l(("+this.p1[0]+","+this.p1[1]+"),("+this.p2[0]+","+this.p2[1]+"))";
	}

});

var Circle = Gizmo.extend(function() {
	this.type = "circle";

	this.create_sprite = function() {
		var sprite = Graphics.create_sprite("circle", "lines");
		sprite.add_class("circle");
		this.sprite = sprite;
	}

	this.radius = function() {
		return Point.distance_cc(this.center, this.border);
	}

	// Distance between a point and the circle, used for highlighting
	// (derived by intersecting the line between the circle center and pos, and the circle)
	this.distance_to_c = function(pos) {
		var d = Cplx.v2_sub(this.center, pos);
		var f = Cplx.v2_norm(Cplx.v2_sub(this.center, this.border)).div(Cplx.v2_norm(d));
		var pt1 = Cplx.v2_scale(d, f);
		return Cplx.v2_norm(Cplx.v2_sub(d, pt1));
	}

	this.is_defined = function() { return this.center && this.border; }
	this.is_visible = function() { 
		return this.is_defined() && !(this.center[0].is_complex() || this.center[1].is_complex() ||
				this.border[0].is_complex() || this.border[1].is_complex());
	}

	this.move_sprite = function(graphics_state) {
		var r = Graphics.SCALE * 0.001 * graphics_state.scale;
		var f = graphics_state.suppress_internals;
		if (f==undefined) f=1;
		r *= this.has_class("output") ? (3-2*f) : 1-f;
		this.sprite.attrib({"cx": this.center[0].re, "cy": this.center[1].re, "r": this.radius().re});
		this.sprite.sprite_elt.style["stroke-width"] = r;
	}
	
	this.toString = function() {
		return "c(("+this.center[0]+","+this.center[1]+"),("+this.border[0]+","+this.border[1]+"))";
	}
});
