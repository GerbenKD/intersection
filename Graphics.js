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
    
    this.add_class    = function(elt, cls) { elt.classList.add(cls); }
    this.remove_class = function(elt, cls) { elt.classList.remove(cls); }

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
	this.extend = function(constr) { constr.prototype = this; return new constr(); }

	this.add_class = function(cls) { this.svg.classList.add(cls); }
	this.remove_class = function(cls) { this.svg.classList.remove(cls); }

	this.attrib = function(attrib) { for (var key in attrib) { this.svg.setAttribute(key, attrib[key]); } }
	this.destroy = function () { this.group.removeChild(this.svg); }

	this.lift = function(group) {
	    var grp = Graphics.groups[group];
	    this.group.removeChild(this.svg);
	    grp.appendChild(this.svg)
	    this.group = grp;
	}
    }

    //	Start out hidden. Show upon recalculate_check_valid
    this.create = function(name, group) {
	var svg = document.createElementNS(this.SVG_NS, name);
	var grp = this.groups[group];
	var sprite = Sprite.extend(function() {
	    this.svg = svg;
	    this.group = grp;
	});
	grp.appendChild(svg);
	return sprite;
    }

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



}
