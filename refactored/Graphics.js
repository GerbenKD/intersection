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

	this.add_class    = function(cls)    { this.svg.classList.add(cls); this.classes[cls] = true;   }
	this.remove_class = function(cls)    { this.svg.classList.remove(cls); delete this.classes[cls]; }
	this.has_class    = function(cls)    { return this.classes[cls]; }
	this.attrib       = function(attrib) { for (var key in attrib) { this.svg.setAttribute(key, attrib[key]); } }
	this.destroy      = function ()      { this.group.removeChild(this.svg); }
	
	this.hide = function()   { this.add_class("hidden"); }
	this.show = function()   { this.remove_class("hidden"); }
	this.hidden = function() { return this.has_class("hidden"); }
    }

    //	Start out hidden. Show upon recalculate_check_valid
    this.create = function(name, group) {
	var svg = document.createElementNS(this.SVG_NS, name);
	var grp = this.groups[group];
	var sprite = Sprite.extend(function() {
	    this.svg = svg;
	    this.group = grp;
	    this.classes = {};
	});
	sprite.add_class("hidden");
	grp.appendChild(svg);
	return sprite;
    }


}
