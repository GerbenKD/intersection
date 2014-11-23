"use strict";

var Graphics = new function() {

    this.XS              = window.innerWidth;
    this.YS              = window.innerHeight;
    this.SVG_NS = "http://www.w3.org/2000/svg";

    // html elements
    this.BODY            = document.getElementById("body");
    this.SVG             = document.getElementById("svg");
    this.G_LINES         = document.getElementById("lines");
    this.G_POINTS        = document.getElementById("points");
    this.G_HIGHLIGHTED   = document.getElementById("highlighted");
    this.G_CONTROLPOINTS = document.getElementById("controlpoints");

    this.SVG.setAttribute("width",  this.XS);
    this.SVG.setAttribute("height", this.YS);

    this.add_class    = function(elt, cls) { elt.classList.add(cls);    }
    this.remove_class = function(elt, cls) { elt.classList.remove(cls); }
    this.has_class    = function(elt, cls) { return elt.classList.contains(cls); }

    //	Start out hidden. Show upon recalculate_check_valid
    this.svg_create = function(name, clazz) {
	var svg = document.createElementNS(this.SVG_NS, name);
	if (clazz) this.add_class(svg, clazz);
	return svg;
    }

    this.svg_attrib = function(elt, attrib) {
	for (var key in attrib) {
	    elt.setAttribute(key, attrib[key]);
	}
    }

    this.hide = function(group, elt) { group.removeChild(elt); }
    this.show = function(group, elt) { group.appendChild(elt); }

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
}
