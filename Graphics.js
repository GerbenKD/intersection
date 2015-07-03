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

    var Sprite = new function() {
	this.add_class = function(cls)    { this.sprite_elt.classList.add(cls); }
	this.remove_class = function(cls) { this.sprite_elt.classList.remove(cls); }
	this.attrib = function(attrib) { for (var key in attrib) { this.sprite_elt.setAttribute(key, attrib[key]); } }
    }	

    this.create_sprite = function(name, group) {
	var sprite_elt = document.createElementNS(SVG_NS, name);

	function construct() {
	    this.sprite_elt = sprite_elt;
	    this.group_name  = group;
	}
	construct.prototype = Sprite;
	return new construct();
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
		this.bbox = bbox;
		this.svg_elt = svg_elt;
		this.group_elts = group_elts;
	    }

	    construct.prototype = this;
	    return new construct();
	};


	this.add_class = function(cls) { this.svg_elt.classList.add(cls); }
	this.remove_class = function(cls) { this.svg_elt.classList.remove(cls); }

	this.attach = function(sprite) { this.group_elts[sprite.group_name].appendChild(sprite.sprite_elt); }
	this.detach = function(sprite) { this.group_elts[sprite.group_name].removeChild(sprite.sprite_elt); }

	this.create_renderer = function() {
	    var prev = {};
	    var me = this;

	    return function(set, graphics_state) {
		if (!set) set = {};
		for (var id in set) { 
		    set[id].draw(graphics_state); 
		    if (!(id in prev)) me.attach(set[id].sprite);
		}
		// kill sprites that are no longer used
		for (var id in prev) {
		    if (!(id in set)) me.detach(prev[id].sprite);
		}
		prev = set;
	    }
	}
    }
    

    //	------------------------ for backward compatibility: --------------------------------

    BODY.oncontextmenu = function() { return false; } // disable right click menu

}

var Animation = new function() {
    
    this.run = function(anim) {
	var frame = 0;
	function animate() {
	    var busy = anim(frame);
	    frame++;
	    if (busy) requestAnimationFrame(animate);
	}
	requestAnimationFrame(animate);
    }

    this.delay = function(anim, numframes) {
	return function(frame) {
	    return frame>=numframes ? anim(frame-numframes) : true;
	}
    }

    this.parallel = function() {
	var animations = Array.prototype.slice.call(arguments);
	return function(frame) {
	    if (animations.length==0) return false;
	    for (var i=0; i<animations.length; i++) {
		var f = animations[i];
		if (!f(frame)) { animations.splice(i, 1); i--; }
	    }
	    return animations.length!=0;
	}
    }

    this.sequential = function() {
	var animations = Array.prototype.slice.call(arguments);
	var frame0 = 0;

	return function(frame) {
	    var busy = undefined;
	    while (busy==undefined) {
		if (animations.length==0) return false;
		var f = animations[0];
		var busy = f(frame-frame0);
		if (!busy) { animations.shift(); frame0 = frame; }
	    }
	    return animations.length!=0;
	}

    }
}();
