'use strict';

var mongoose = require('mongoose');
var phases   = require ('./memphases');
var projects = require ('./demoprojects');
var Project  = mongoose.model('Project');
var _ = require ('lodash');

module.exports = function () {

	_.each (projects, function (p) {
	 	var project = new Project ();
	 	//
	 	// fill out the base project information with some other stuff
	 	//
	 	if ( p.status.match (/^operating/) ) { project.status = 'Certified'; }
	 	else if ( p.status.match (/^closed/)) { project.status = 'Decommissioned'; }
	 	else { project.status = 'In Progress'; }
	 	//
	 	// name description code
	 	//
	 	project.name = p.name;
	 	project.description = p.description;
	 	project.code = p.permit.toLowerCase ();
	 	if (project.code === 'N/A') {
	 		project.code = p.name.toLowerCase ().replace (' ', '-').substr (0, 10);
	 	}
	 	//
	 	// type
	 	//
	 	project.type = 'Demo';
	 	//
	 	// region
	 	//
	 	project.region = p.memRegion;
	 	//
	 	// lats and lons
	 	//
	 	project.lat = p.lat;
	 	project.lon = p.lon;
	 	//
	 	// roles
	 	//
	 	project.roles = ['mem', 'public'];
	 	//
	 	// cram in all other info into the description
		//
	 	var od = project.description;
	 	project.description = p.description;
	 	//
	 	// access
	 	//
	 	project.read = ['public'];
	 	project.submit = ['mem'];
	 	//
	 	// save
	 	//
	 	project.save ();
	 });

};
