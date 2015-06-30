"use strict";


/*
 * 
 * var Graphics = new function() {
 * 	 this.N_STAMPS = 10;
 *   this.DIV = ???;
 * };
 * 
 * var SVG = new function() {
 *   this.create = function() {
 *   }
 *   
 *   this.create_sprite = function() {}
 * 
 * }
 * 
 */



var Graphics = new function() {
	this.XS = window.innerWidth;
	this.YS = window.innerHeight;
	
	var main_svg_object;
	var stamps;
	
	
	var N_STAMPS = 10;
	
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

	var SVG = new function() {

		this.create = function(x0, y0, width, height) {
			function construct() {
				this.svg_elt = document.createElementNS(SVG_NS, "svg");
				this.group_elts = {};
				var group_names = ["lines", "points", "highlighted", "controlpoints"];
				for (var i=0; i<group_names.length; i++) {
					var group_elt = document.createElementNS(SVG_NS, "g");
					this.group_elts[group_names[i]] = group_elt;
					this.svg_elt.appendChild(group_elt);
				}
				this.svg_elt.style.left = x0;
				this.svg_elt.style.top 	= y0;
				this.svg_elt.setAttribute("width", width);
				this.svg_elt.setAttribute("height", height);
				DIV.appendChild(this.svg_elt);
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
	}	
	
	// ------------------------ for backward compatibility: --------------------------------
	this.create = function(name, group) {
		return main_svg_object.create_sprite(name, group);
	};


	this.redraw = function() {
		var previous = {}; // id -> gizmo
		return function(set) {
			for (var id in set) { 
				set[id].draw(); 
			}
			// kill sprites that are no longer used
			for (var id in previous) {
				if (!(id in set)) previous[id].remove_sprite();
			}
			previous = set;
		};
	}();

	
	BODY.oncontextmenu = function() { return false; } // disable right click menu
	
	// create SVG objects
	main_svg_object = SVG.create(0,0,this.XS,this.YS);
	main_svg_object.add_class("canvas");
	
	stamps = [];
	
	var stamp_margin = this.XS * 0.01;
	var stamp_width  = (this.XS - ((N_STAMPS + 1) * stamp_margin)) / N_STAMPS;
	var stamp_height = stamp_width * 0.8;
	
	console.log("Stamp margin: " + stamp_margin + ", stamp width: " + stamp_width + ", stamp height: " + stamp_height);
	
	for (var i = 0; i < N_STAMPS; i++) {
		var stamp_object = SVG.create((stamp_margin * (i + 1)) + (stamp_width * i), this.YS - (stamp_height + stamp_margin), stamp_width, stamp_height);
		stamps.push(stamp_object);
		stamp_object.add_class("stamp");
	}
}
