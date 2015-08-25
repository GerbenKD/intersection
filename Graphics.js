"use strict";


var Graphics = new function() {

    var SVG_NS = "http://www.w3.org/2000/svg";

    // html elements
    var BODY = document.getElementById("body");
    var DIV  = document.getElementById("div");
    var MAINDIV = document.getElementById("maindiv");

    var TOPRULER = document.getElementById("topruler");
    var BOTTOMRULER = document.getElementById("bottomruler");
    var BUTTONS = document.getElementById("buttons");

    // this.add_class    = function(elt, cls) { elt.classList.add(cls); }
    // this.remove_class = function(elt, cls) { elt.classList.remove(cls); }

    this.toggle_fullscreen = function() {
	if (is_fullscreen()) leave_fullscreen(); else enter_fullscreen();
	
	
	/*
	  function add_fs_listener(func) {
	  document.addEventListener("mozfullscreenchange", func);
	  document.addEventListener("webkitfullscreenchange", func);
	  document.addEventListener("msfullscreenchange", func);
	  document.addEventListener("fullscreenchange", func);
	  }
	*/

	function is_fullscreen() {
	    return document.fullscreenElement
		|| document.webkitFullscreenElement 
		|| document.mozFullScreenElement
		|| document.msFullScreenElement;
	}

	function enter_fullscreen() {
	    var elt = BODY;
	    if      (elt.mozRequestFullScreen)    elt.mozRequestFullScreen();
	    else if (elt.msRequestFullScreen)     elt.msRequestFullScreen();
	    else if (elt.webkitRequestFullscreen) elt.webkitRequestFullscreen();
	    else if (elt.requestFullscreen)       elt.requestFullScreen();
	    else alert("Full screen not supported"); // TODO do something real here
	}

	function leave_fullscreen() {
	    if      (document.exitFullscreen)       document.exitFullscreen();
	    else if (document.msExitFullscreen)     document.msExitFullscreen();
	    else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
	    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
	    else alert("Full screen not supported"); // TODO do something real here
	}

    }


    this.reposition = function() {
	this.XS = window.innerWidth;
	this.YS = window.innerHeight;
    }

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

    this.topruler = function(bbox) { Graphics.set_elt_bbox(TOPRULER, bbox); }
    this.bottomruler = function(bbox) { Graphics.set_elt_bbox(BOTTOMRULER, bbox); }

    this.create_button = function() {
	var svg_elt = document.createElementNS(SVG_NS, "svg");
	svg_elt.onclick = onclick;
	svg_elt.classList.add("button");
	BUTTONS.appendChild(svg_elt);
	return svg_elt;
    }

    this.create_svg = function() {
	return document.createElementNS(SVG_NS, "svg");
    }

    this.create_polygon = function() {
	return document.createElementNS(SVG_NS, "polygon");
    }


    this.set_elt_bbox = function(elt, bbox) {
	var st = elt.style;
	st.left = bbox[0];
	st.top = bbox[1];
	st.width = bbox[2];
	st.height = bbox[3];
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

	this.create = function() {
	 
	    function construct() {
		var svg_elt = document.createElementNS(SVG_NS, "svg");
		// to fix a bug with the background not appearing, stick an invisible rectangle in here
		var rect_elt = document.createElementNS(SVG_NS, "rect");
		svg_elt.appendChild(rect_elt);
		rect_elt.style.fill = "none";
		rect_elt.style.stroke = "none";
		var group_elts = {};
		var group_names = ["lines", "points", "highlighted", "controlpoints"];
		for (var i=0; i<group_names.length; i++) {
		    var group_elt = document.createElementNS(SVG_NS, "g");
		    group_elts[group_names[i]] = group_elt;
		    svg_elt.appendChild(group_elt);
		}
		this.svg_elt = svg_elt;
		this.rect_elt = rect_elt;
		this.group_elts = group_elts;
		DIV.appendChild(svg_elt);
	    }

	    construct.prototype = this;
	    return new construct();
	};

	this.set_bbox = function(bbox) {
	    this.bbox = bbox;
	    Graphics.set_elt_bbox(this.svg_elt, bbox);
	    this.rect_elt.setAttribute("x", 0);
	    this.rect_elt.setAttribute("y", 0);
	    this.rect_elt.setAttribute("width", bbox[2]);
	    this.rect_elt.setAttribute("height", bbox[3]);
	}

	// moves the svg element to maindiv
	this.focus = function(firsttime) {
	    if (!firsttime) DIV.removeChild(this.svg_elt);
	    this.remove_class("deselected");
	    MAINDIV.appendChild(this.svg_elt);
	}

	this.unfocus = function(firsttime) {
	    if (!firsttime) MAINDIV.removeChild(this.svg_elt);
	    this.add_class("deselected");
	    DIV.appendChild(this.svg_elt);
	}

	this.add_class = function(cls) { this.svg_elt.classList.add(cls); }
	this.remove_class = function(cls) { this.svg_elt.classList.remove(cls); }

	this.attach = function(sprite) { this.group_elts[sprite.group_name].appendChild(sprite.sprite_elt); }
	this.detach = function(sprite) { this.group_elts[sprite.group_name].removeChild(sprite.sprite_elt); }

	function arrays_equal(a, b) {
	    if (a === b) return true;
	    if (a == null || b == null) return false;
	    if (a.length != b.length) return false;

	    // If you don't care about the order of the elements inside
	    // the array, you should sort both arrays here.

	    for (var i = 0; i < a.length; ++i) {
		if (a[i] !== b[i]) return false;
	    }
	    return true;
	}

	this.create_renderer = function() {
	    var prev = {};
	    var me = this;

	    return function(set, graphics_state) {
		if (!set) set = {};
		if (graphics_state.bbox && !arrays_equal(graphics_state.bbox, me.bbox)) {
		    me.set_bbox(graphics_state.bbox);
		}
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
    
    this.run = function(anim, speed) {
	if (speed==undefined) speed=1;
	var frame = 0;
	function animate() {
	    var busy = anim(frame);
	    frame+=speed;
	    if (busy) requestAnimationFrame(animate);
	}
	requestAnimationFrame(animate);
    }

    this.delay = function(anim, numframes) {
	return function(frame) {
	    return frame>=numframes ? anim(frame-numframes) : true;
	}
    }

    this.parallel = function(animations) {
	return function(frame) {
	    if (animations.length==0) return false;
	    for (var i=0; i<animations.length; i++) {
		var f = animations[i];
		if (!f(frame)) { animations.splice(i, 1); i--; }
	    }
	    return animations.length!=0;
	}
    }

    this.sequential = function(animations) {
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
