'use strict';
// =========================================================================
//
// Controller for vcs
//
// =========================================================================
var path = require('path');
var _ = require('lodash');
var DBModel = require(path.resolve('./modules/core/server/controllers/core.dbmodel.controller'));

var ProjectController = require(path.resolve('./modules/projects/server/controllers/project.controller'));

var mongoose = require ('mongoose');
var Role  = mongoose.model ('_Role');

module.exports = DBModel.extend({
	name: 'User',
	plural: 'users',
	populate: 'org',
	sort: 'lastName firstName',

	search: function (name, email, org, groupId) {
		var self = this;
		self.sort = {lastName: 1}; // doesn't look like we can sort with case insensitivity :|
		var getUsers = new Promise(function (resolve, reject) {
			var q = {};
			if (!_.isEmpty(name)) {
				q.displayName = new RegExp(name, 'i');
			}
			if (!_.isEmpty(email)) {
				q.email = new RegExp(email, 'i');
			}
			if (!_.isEmpty(org)) {
				q.orgName = new RegExp(org, 'i');
			}
			//console.log('self.listIgnoreAccess(q)...');
			self.listIgnoreAccess(q)
				.then(function (res) {
					//console.log('self.listIgnoreAccess(q)... resolve ', res.length);
					resolve(res);
				}, function (err) {
					//console.log('err = ', JSON.stringify(err));
					reject(new Error(err));
				});
		});

		var getUsersInGroup = new Promise(function (resolve, reject) {
			resolve([]);
		});


		return new Promise(function (resolve, reject) {
			var users, usersInGroup;
			//console.log('1) getUsers... ');
			return getUsers
				.then(function (res) {
					users = res;
					//console.log('1) getUsers... ', users.length);
					//console.log('2) getUsersInGroup... ');
					return getUsersInGroup;
				}).then(function (res) {
					usersInGroup = res;
					//console.log('2) getUsersInGroup... ', usersInGroup.length);
					if (!_.isEmpty(groupId)) {
						if (_.isEmpty(name) && _.isEmpty(email) && _.isEmpty(org)) {
							//console.log('only searched for groups, so return those users...');
							return usersInGroup;
						} else {
							//console.log('searched for groups and users, so return the intersection...');
							var intersection = [];
							_.forEach(users, function(o) {
								var ug = _.find(usersInGroup, function(u) {return u._id.toString() === o._id.toString(); });
								if (ug) {
									intersection.push(o);
								} else {
									//console.log('no match: users._id = ' + o._id.toString());
								}
							});
							return intersection;
						}
					} else {
						//console.log('return all users and users in Group...');
						return _.concat(users, usersInGroup);
					}
				})
				.then(function (res) {
					//console.log('3) list... ', res.length);
					return _.uniqBy(res, '_id');
				})
				.then(function (res) {
						//console.log('4) unique list, resolve... ', res.length);
						resolve(res);
					},
					function (err) {
						//console.log('!) reject... ', JSON.stringify(err));
						reject(new Error(err));
					}
				);
		});
	},

	groupsAndRoles: function(id) {
		// get associated projects for user.
		// can be through role or through a group.
		var self = this;

		var getUser = function(id) {
			return self.findById(id);
		};

		var getSystemRoles = function () {
			return new Promise(function (fulfill, reject) {
				Role.find({ context: 'application', owner: 'sysadmin' })
					.select ({context: 1, role: 1})
					.sort('role')
					.exec(function (error, data) {
						if (error) {
							reject(new Error(error));
						} else if (!data) {
							reject(new Error('user.getSystemRoles none found'));
						} else {
							fulfill(data);
						}
					});
			});
		};

		var getGlobalProjectRoles = function() {
			var Defaults = mongoose.model ('_Defaults');
			return new Promise (function (resolve, reject) {
				Defaults.findOne({resource: 'application', level: 'global', type : 'global-project-roles'}).exec()
					.then (function(r) {
						return r.defaults.roles;
					})
					.then (resolve,reject);
			});
		};

		var getUserSystemRoles = function (username, systemRoles) {
			return new Promise(function (fulfill, reject) {
				Role.find({ user: username, context: 'application' })
					.select ({context: 1, role: 1})
					.sort('role')
					.exec(function (error, data) {
						if (error) {
							reject(new Error(error));
						} else if (!data) {
							fulfill([]);
						} else {
							fulfill(data);
						}
					});
			});
		};

		var getProjectRoles = function (username, systemRoles) {
			return new Promise(function (fulfill, reject) {
				Role.find({ user: username, context: {$ne: 'application'}, role: {$nin: systemRoles} })
					.select ({context: 1, role: 1})
					.sort('role')
					.exec(function (error, data) {
						if (error) {
							reject(new Error(error));
						} else if (!data) {
							reject(new Error('user.projectRoles: Project IDs not found for username, no project roles assigned for: ' + username));
						} else {
							fulfill(data);
						}
					});
			});
		};

		var getProjects = function (ids) {
			var projectCtl = new ProjectController(self.opts);
			return projectCtl.findMany({_id : {$in: ids}}, 'code name region status dateCompleted type isPublished', 'name');
		};

		var allSystemRoles, globalProjectRoles, systemRoles, user, userSystemRoles, projectRoles, projectGroups;
        var projectIds = [];
        return getSystemRoles()
			.then(function(results) {
				allSystemRoles = _.map(results, function (o) { return o.role; });
				return getGlobalProjectRoles();
			})
			.then(function(results) {
				globalProjectRoles = results || [];
				systemRoles = _.difference(allSystemRoles, globalProjectRoles);
				return getUser(id);
			})
			.then(function(result) {
				user = result;
				return getUserSystemRoles(user.username, allSystemRoles);
			})
			.then(function(results) {
				userSystemRoles = results || [];
				return getProjectRoles(user.username, allSystemRoles);
			})
			.then(function(results) {
				projectGroups = results || [];
				projectIds = _.concat(projectIds, _.map(projectGroups, function(o) { return o.project.toString(); }));
				return getProjects(_.uniq(projectIds));
			})
			.then(function(results) {

				// projects with groups and roles....
				var _projects = [];
				_.each(results, function(p) {
					var groups = _.filter(projectGroups, function(o) { return o.project.toString() === p._id.toString(); });
					var roles = _.filter(projectRoles, function(o) { return o.context === p._id.toString(); });

					var item = JSON.parse(JSON.stringify(p));
					item.groups = groups;
					item.roles = roles;
					_projects.push(item);
				});

				// system level roles and system managed project roles...
				var _systemRoles = [];
				var _globalProjectRoles = [];
				var sysroles = _.uniq(_.map(userSystemRoles, function (o) { return o.role; }));
				_.each(sysroles, function(r) {
					var gpr = _.find(globalProjectRoles, function(o) { return o === r;});
					if (gpr) {
						_globalProjectRoles.push(r);
					} else {
						_systemRoles.push(r);
					}
				});

				return {
					systemRoles : _systemRoles,
					globalProjectRoles: _globalProjectRoles,
					projects: _projects
				};
			});

	}

});
