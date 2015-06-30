"use strict";

var Storage = new function() {
    
    this.haskey = function(name)  { return name in localStorage; }

    this.getstr = function(name)  { return name in localStorage ? localStorage[name] : null; }

    this.setstr = function(name, value) { localStorage[name] = value; }

    this.getobj = function(name) { return name in localStorage ? JSON.parse(localStorage[name]) : null; }

    this.setobj = function(name, value) { localStorage[name] = JSON.stringify(value); }

    this.remove = function(name) { delete localStorage[name]; }

    this.filename2savestatename = function(filename) { 
	var file2savestate = this.getobj("file2savestate");
	return file2savestate ? file2savestate[filename] : null;
    }

    this.get_file = function(filename) {
	var savestatename = this.filename2savestatename(filename);
	return savestatename ? this.getobj(savestatename) : null;
    }

}();
