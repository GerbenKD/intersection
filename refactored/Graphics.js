"use strict";

/* TODO: refactor this so that graphics objects are proper objects and don't have stowaways.
   Hide and show can be called directly on them.
*/

var Graphics = new function() {

    this.XS              = window.innerWidth;
    this.YS              = window.innerHeight;
    this.SVG_NS = "http://www.w3.org/2000/svg";


    this.groups = function() {
	var g = {};
	for (var i=0; i<arguments.length; i++) {
	    var name = arguments[i];
	    g[name] = document.getElementById(name);
	}
	return g;
    }("lines", "points", "highlighted", "controlpoints");

    // html elements
    this.BODY            = document.getElementById("body");
    this.SVG             = document.getElementById("svg");

    this.SVG.setAttribute("width",  this.XS);
    this.SVG.setAttribute("height", this.YS);

    this.add_class    = function(elt, cls) { elt.classList.add(cls);    }
    this.remove_class = function(elt, cls) { elt.classList.remove(cls); }
    this.has_class    = function(elt, cls) { return elt.classList.contains(cls); }

    //	Start out hidden. Show upon recalculate_check_valid
    this.svg_create = function(name, group, clazz, attrib) {
	var svg = document.createElementNS(this.SVG_NS, name);
	var grp = this.groups[group];
	svg.stowaways = { group: grp };
	this.add_class(svg, clazz);
	this.svg_attrib(svg, attrib);
	this.svg_hide(svg);
	grp.appendChild(svg);
	return svg;
    }

    this.svg_destroy = function(elt) {
	elt.stowaways.group.removeChild(elt);
    }
   
    this.svg_attrib = function(elt, attrib) {
	for (var key in attrib) {
	    elt.setAttribute(key, attrib[key]);
	}
    }

    this.svg_hide = function(elt) {
	if (elt.stowaways.hidden) { console.error("Hiding an element that's already hidden!"); return; }
	elt.stowaways.hidden = true;
	this.add_class(elt, "hidden");
    }

    this.svg_show = function(elt) {
	if (!elt.stowaways.hidden) { console.error("Showing an element that's not hidden!"); return; }
	elt.stowaways.hidden = false;
	this.remove_class(elt, "hidden");
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
}
