"use strict";


var Graphics = new function() {
	this.XS = window.innerWidth;
	this.YS = window.innerHeight;

	var SVG_NS = "http://www.w3.org/2000/svg";

	// html elements
	var BODY = document.getElementById("body");
	var DIV  = document.getElementById("div");

	// this.add_class    = function(elt, cls) { elt.classList.add(cls); }
	// this.remove_class = function(elt, cls) { elt.classList.remove(cls); }

	//converts a mouse event to screen coords
	this.e2coord = function(e) {
		e = e || window.event;
		var docEl = document.documentElement;
		var scrollLeft = docEl.scrollLeft || document.body.scrollLeft;
		var scrollTop  = docEl.scrollTop || document.body.scrollTop;
		var x = e.pageX || (e.clientX  + scrollLeft);
		var y = e.pageY || (e.clientY  + scrollTop);
		return [x,y];
	}

	this.SVG = new function() {

		this.create = function(bbox) {
			var svg_elt = document.createElementNS(SVG_NS, "svg");
			svg_elt.style.left = bbox[0];
			svg_elt.style.top 	= bbox[1];
			svg_elt.style.width = bbox[2];
			svg_elt.style.height= bbox[3];
			DIV.appendChild(svg_elt);
			var group_elts = {};
			var group_names = ["lines", "points", "highlighted", "controlpoints"];
			for (var i=0; i<group_names.length; i++) {
				var group_elt = document.createElementNS(SVG_NS, "g");
				group_elts[group_names[i]] = group_elt;
				svg_elt.appendChild(group_elt);
			}

			function construct() {
				this.width = bbox[2];
				this.height = bbox[3];
				this.svg_elt = svg_elt;
				this.group_elts = group_elts;
			}

			construct.prototype = this;
			return new construct();
		};

		var Sprite = new function() {
			this.add_class = function(cls) { this.sprite_elt.classList.add(cls); }
			this.remove_class = function(cls) { this.sprite_elt.classList.remove(cls); }

			this.attrib = function(attrib) { for (var key in attrib) { this.sprite_elt.setAttribute(key, attrib[key]); } }
			this.destroy = function () { this.svg_object.group_elts[this.group_name].removeChild(this.sprite_elt); }

			this.lift = function(group) {
				this.svg_object.group_elts[this.group_name].removeChild(this.sprite_elt);
				this.svg_object.group_elts[group].appendChild(this.sprite_elt);
				this.group_name = group;
			}
		}	

		this.create_sprite = function(name, group) {
			var sprite_elt = document.createElementNS(SVG_NS, name);
			var svg_object = this;

			function construct() {
				this.sprite_elt = sprite_elt;
				this.group_name  = group;
				this.svg_object = svg_object;
			}
			construct.prototype = Sprite;
			this.group_elts[group].appendChild(sprite_elt);
			return new construct();
		}

		this.add_class = function(cls) {
			this.svg_elt.classList.add(cls);
		}

		this.redraw = function(set) {
			var prev = this.previous_redraw_set;
			if (!prev) prev = {};
						
			for (var id in set) { 
				set[id].draw(this); 
			}
			// kill sprites that are no longer used
			for (var id in prev) {
				if (!(id in set)) prev[id].remove_sprite();
			}
			this.previous_redraw_set = set;
		}
	}	

	this.get_stamp = function(stamp_id) {
		return stamps[stamp_id];
	}



//	------------------------ for backward compatibility: --------------------------------

	BODY.oncontextmenu = function() { return false; } // disable right click menu

}
