"use strict";

var Cplx = new function() {

    this.create = function(re, im) { // returns (re+i*im)
	function constr() {
	    this.re = re; this.im = im;
	}
	constr.prototype = this;
	return new constr(); 
    }

    this.random = function() {
	return Cplx.create(Math.random(), Math.random());
    }

    this.one = this.create(1,0);

    this.add = function(c) { return Cplx.create(this.re+c.re, this.im+c.im); }
    this.sub = function(c) { return Cplx.create(this.re-c.re, this.im-c.im); }

    // (a+ib)(c+id) = ac-bd + i(bc+ad)
    this.mul = function(c) {
	return Cplx.create(this.re*c.re-this.im*c.im, this.re*c.im+this.im*c.re);
    }

    // (a+ib)/(c+id) = (a+ib)(c-id)/(c+id)(c-id) = ac+bd+i(bc-ad) / c^2 + d^2
    this.div = function(c) {
	var r2 = c.re*c.re+c.im*c.im;
	return Cplx.create((this.re*c.re+this.im*c.im)/r2, (this.im*c.re-this.re*c.im)/r2);
	
    }

    this.sqrt = function() {
	var r = this.abs();
	var delta = (this.im>0?1:-1)*Math.sqrt(0.5*(r-this.re));
	var gamma = Math.sqrt(0.5*(this.re+r));
	return Cplx.create(gamma, delta);
    }

    this.neg = function() { return Cplx.create(-this.re, -this.im); }

    this.square = function() { return this.mul(this); }

    this.abs = function() { return Math.sqrt(this.re*this.re+this.im*this.im); }

    this.is_complex = function() { return Math.abs(this.im) > SMALL; }

    this.toString = function() { return this.re.toFixed(1)+"+"+this.im.toFixed(1)+"i"; }

    this.v2_norm = function(v) { 
	return v[0].square().add(v[1].square()).sqrt();
    }

    this.v2_scale = function(v, f) { return [v[0].mul(f), v[1].mul(f)]; }

    this.v2_sub = function(v1, v2) { return [v1[0].sub(v2[0]), v1[1].sub(v2[1])]; }
    this.v2_add = function(v1, v2) { return [v1[0].add(v2[0]), v1[1].add(v2[1])]; }

}();
