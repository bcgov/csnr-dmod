'use strict';
// =========================================================================
//
// this was all getting very, very messy. So now this is the ONE AND ONLY
// place to put menu definitions.  Menus are now defined as visible through
// a permision, or set of permissions, assigned to them
//
// =========================================================================
angular.module('core').run(['Menus','ENV', function (Menus, ENV) {
	// -------------------------------------------------------------------------
	//
	// System Menu
	//
	// -------------------------------------------------------------------------
	Menus.addMenu('systemMenu', {
		permissions: [
		'application.listContacts'
		]
	});
	// -------------------------------------------------------------------------
	//
	// Projects Menu
	//
	// -------------------------------------------------------------------------
	Menus.addMenu('projectsMenu', {
		permissions: ['application.createProject','application.viewSchedule']
	});
	Menus.addMenuItem('projectsMenu', {
		title: 'Add Project',
		state: "p.edit({projectid:'new'})",
		permissions: ['application.createProject']
	});
	// -------------------------------------------------------------------------
	//
	// Add Project Top Menu Items
	//
	// -------------------------------------------------------------------------
	Menus.addMenu('projectTopMenu', {
		permissions: ['context.editProject','context.viewSchedule','context.listEnforcements','context.listCommentPeriods']
	});
	Menus.addMenuItem('projectTopMenu', {
		title: 'Edit Project',
		state: 'p.edit',
		permissions: ['context.editProject']
	});
	// -------------------------------------------------------------------------
	//
	// Add Project Menu Items
	//
	// -------------------------------------------------------------------------
	Menus.addMenu('projectMenu', {
		permissions: [
			'context.listDocuments',
			'context.listValuedComponents',
			'context.listProjectRoles',
			'context.listInspectionReports',
			'context.listProjectConditions',
			'context.listProjectComplaints',
			'context.listProjectInvitations',
			'context.listProjectUpdates',
			'context.listProjectGroups'
		]
	});
	Menus.addMenuItem('projectMenu', {
		title: 'Documents',
		state: 'p.docs',
		permissions: ['context.listDocuments']
	});
}]);

