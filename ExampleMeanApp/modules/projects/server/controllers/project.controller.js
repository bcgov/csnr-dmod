'use strict';
// =========================================================================
//
// Controller for projects
//
// =========================================================================
var path                = require ('path');
var DBModel             = require (path.resolve('./modules/core/server/controllers/core.dbmodel.controller'));
var UserClass           = require (path.resolve('./modules/users/server/controllers/admin.server.controller'));
var _                   = require ('lodash');
var Role        				= require ('mongoose').model ('_Role');
var util = require('util');
var access = require(path.resolve('./modules/core/server/controllers/core.access.controller'));

var mongoose				= require('mongoose');
var DocumentModel			= mongoose.model('Document');
var ProjectModel			= mongoose.model('Project');
var TreeModel				= require ('tree-model');
var FolderClass = require (path.resolve('./modules/folders/server/controllers/core.folder.controller'));

module.exports = DBModel.extend ({
	name : 'Project',
	plural : 'projects',
	sort: {name:1},
	populate: 'primaryContact',
	// bind: ['addPrimaryUser','addProponent'],
	init: function () {
	},
	postMessage: function (obj) {
	},
	// -------------------------------------------------------------------------
	//
	// Before adding a project this is what must happen:
	//
	// set up the eao and proponent admin and member roles
	// add them to the project
	// reverse add the project to the roles
	// add the project admin role to the current user, eao if internal, proponent
	//    otherwise
	// reset the user roles in this object so the user can save it
	//
	// -------------------------------------------------------------------------
	preprocessAdd : function (project) {
		//console.log('project.preprocessAdd project(1) = ' + JSON.stringify(project, null, 4));
		var self = this;
		//
		// return a promise, we have lots of work to do
		//
		if (_.isEmpty(project.shortName)) {
			project.shortName = project.name.toLowerCase ();
			project.shortName = project.shortName.replace (/\W/g,'-');
			project.shortName = project.shortName.replace (/^-+|-+(?=-|$)/g, '');
		}

		return new Promise (function (resolve, reject) {
			//
			// first generate a project code that can be used internally
			//
			project.code = project.shortName.toLowerCase ();
			project.code = project.code.replace (/\W/g,'-');
			project.code = project.code.replace(/^-+|-+(?=-|$)/g, '');
			if (_.endsWith(project.code, '-')) {
				project.code = project.code.slice(0, -1);
			}			//
			//
			// this does the work of that and returns a promise
			//
			self.guaranteeUniqueCode (project.code)
			//
			// then go about setting up the default admin roles on both
			// sides of the fence
			//
			.then (function (projectCode) {
				//
				// if the project hasn't an orgCode yet then copy in the user's
				//
				if (!project.orgCode) project.orgCode = self.user.orgCode;

				return self.initDefaultRoles(project);
			})
			//.then(function() {
			//	// add all eao-intake users to this project's intake role.
			//	return self.addIntakeUsers(project);
			//})
			.then(function() {
				//console.log('project.preprocessAdd project(2) = ' + JSON.stringify(project, null, 4));
				// since we know that only special people can create projects...
				// let's force this save/create.
				// at this point someone with eao-intake has been put in this project's intake role...
				// however, this controller has been initialized with this user's old roles... so saveDocument will fail.
				// we could do this two ways
				//
				// self.userRoles.push('intake');
				//
				// or
				//
				// self.force = true;
				//
				self.force = true;
				return project;
			})
			//
			.then (resolve, reject);
		});
	},
	postprocessAdd: function(project) {
		return access.addGlobalProjectUsersToProject(project._id)
			.then(function() { return Promise.resolve(project); }, function(err) { return Promise.reject(err); });
	},
	preprocessUpdate: function(project) {
		var self = this;
		//console.log('preprocessUpdate = ', JSON.stringify(project, null, 4));
		if (!project.userCan.manageFolders) {
			//console.log('preprocessUpdate. user does not have manageFolders, set directory structure to current stored value...');
			return new Promise(function (resolve, reject) {
				return self.findById(project._id)
					.then(function (p) {
						//console.log('p.directoryStructure = ', JSON.stringify(p.directoryStructure));
						//console.log('this.directoryStructure = ', JSON.stringify(project.directoryStructure));
						project.directoryStructure = p.directoryStructure;
						//console.log('this.directoryStructure = ', JSON.stringify(project.directoryStructure));
						resolve(project);
					});
			});
		} else {
			//console.log('preprocessUpdate. user has manageFolders, so let them adjust the directoryStructure.');
			return project;
		}
	},
	// -------------------------------------------------------------------------
	//
	// Utility method for API convenience.
	//
	// -------------------------------------------------------------------------
	addPhaseWithId: function (projectId, baseCode) {
		var self = this;
		return self.findById(projectId)
			.then(function(project) {
				return self.addPhase(project, baseCode);
			});
	},
	// Used for managing folder structures in the application.
	addDirectory: function (projectId, folderName, parentId) {
		// console.log("adding dir:", folderName);
		var self = this;
		var newNodeId;
		return new Promise(function (resolve, reject) {
			return self.findById(projectId)
			.then(function(project) {
				// check for manageFolders permission
				if (!project.userCan.manageFolders) {
					return Promise.reject(new Error ("User is not permitted to manage folders for '" + project.name + "'."));
				} else {
					return project;
				}
			})
			.then(function (project) {
				// Check if the folder name already exists.
				var f = new FolderClass (self.opts);
				return f.findOne({parentID: parentId, project: projectId, displayName: folderName})
				.then(function (folder) {
					if (folder) {
						return Promise.reject(new Error("Folder name already exists."));
					} else {
						return project;
					}
				});
			})
			.then(function (project) {
				// console.log("current structure:", project.directoryStructure);
				var tree = new TreeModel();
				if (!project.directoryStructure) {
					// console.log("setting default");
					// TODO: bring this in from DB instead of hardcoding
					project.directoryStructure = {id: 1, name: 'ROOT', lastId: 1, published: true};
				}
				var root = tree.parse(project.directoryStructure);
				// Walk until the right folder is found
				var theNode = root.first(function (node) {
					return node.model.id === parseInt(parentId);
				});
				// If we found it, add it
				if (theNode) {
					// Check if this already exists.
					var bFound = theNode.first(function (node) {
						// NB: Exclude myself
					    return (node.model.name === folderName) && (node.model.id !== theNode.model.id);
					});

					// If found, return error in creating.
					if (bFound) {
						return null;
					}

					root.model.lastId += 1;
					// Need to add order property to the folder item to apply alternate sorting
					var node = theNode.addChild(tree.parse({id: root.model.lastId, name: folderName, order: 0, published: false}));
					newNodeId = node.model.id;
				} else {
					// If we didn't find the node, this is an error.
					return null;
				}
				project.directoryStructure = {};
				project.directoryStructure = root.model;
				return project.save();
			})
			.then(function (p) {
				if (p) {
					p.directoryStructure.createdNodeId = newNodeId;
					var f = new FolderClass (self.opts);
					return f.create({displayName: folderName, directoryID: newNodeId, parentID: parentId, project: p})
					.then(function () {
						resolve(p.directoryStructure);
					});
				} else {
					reject(new Error("ERR: Couldn't create directory."));
				}
			})
			.catch(function (err) {
				reject(err);
			});
		});
	},
	// Used for managing folder structures in the application.
	removeDirectory: function (projectId, folderId) {
		var self = this;
		return new Promise(function (resolve, reject) {
			var f = new FolderClass (self.opts);
			// First find any documents that have this id as a parent.
			return DocumentModel.find({directoryID: parseInt(folderId), project: projectId})
			.then(function (doc) {
				// console.log("doc:", doc);
				if (doc.length !== 0) {
					// bail - this folder contains published files.
					return Promise.reject(doc);
				}
				return self.findById(projectId); 
			})
			.then(function (project) {
				//create the tree model
				var tree = new TreeModel();
				if (!project.directoryStructure) {
					return project;
				}
				//parse the tree
				var root = tree.parse(project.directoryStructure);
				// Walk until the right folder is found
				var theNode = root.first(function (node) {
					return node.model.id === parseInt(folderId);
				});
				//check if it has children
				if (theNode.hasChildren()) {
					return Promise.reject(project); //need to have an object inside the promise
				}
				return project; //fetch the database again for project
			})
			.then(function (project) {
				// check for manageFolders permission
				if (!project.userCan.manageFolders) {
					return Promise.reject(project);
					//reject(new Error ("User is not permitted to manage folders for '" + project.name + "'."));
				} else {
					return f.findOne({directoryID: folderId, project: projectId});
				}
			})
			.then(function (dir) {
				// console.log("dir:");
				return f.oneIgnoreAccess({_id: dir._id})
				.then(function (d) {
					return f.delete(d);
				})
				.then(function () {
					return self.findById(projectId);
				});
			})
			.then(function (project) {
				// console.log("current structure:", project.directoryStructure);
				var tree = new TreeModel();
				if (!project.directoryStructure) {
					return project;
				}
				var root = tree.parse(project.directoryStructure);
				// Walk until the right folder is found
				var theNode = root.first(function (node) {
					return node.model.id === parseInt(folderId);
				});
				// If we found it, remove it as long as it's not the root.
				if (theNode && !theNode.isRoot()) {
					// console.log("found node:", theNode.model.id);
					// console.log("parent Node:", theNode.parent.model.id);

					var droppedNode = theNode.drop();
					droppedNode.walk(function (node) {
						// MBL TODO: Go through the rest of the tree and update the documents to
						// be part of the parent folder.
						// console.log("node:", node.model.id);
					});
				}
				project.directoryStructure = {};
				project.directoryStructure = root.model;
				return project.save();
			})
			.then(function (p) {
				resolve(p.directoryStructure);
			})
			.catch(function (err) {
				reject(err);
			});
		});
	},
	// Used for managing folder structures in the application.
	renameDirectory: function (projectId, folderId, newName) {
		var self = this;
		return new Promise(function(resolve, reject) {
			var f = new FolderClass (self.opts);
			var _dir = null;
			return f.findOne({directoryID: folderId, project: projectId})
				.then(function (dir) {
					// console.log("dir:", dir);
					return f.oneIgnoreAccess({_id: dir._id})
					.then(function (d) {
						d.displayName = newName;
						_dir = d;
						return self.findById(projectId);
					});
				})
				.then(function (project) {
					// check for manageFolders permission
					if (!project.userCan.manageFolders) {
						return Promise.reject(new Error ("User is not permitted to manage folders for '" + project.name + "'."));
					} else {
						return project;
					}
				})
				.then(function (project) {
					// Check if the folder name already exists.
					return f.findOne({parentID: folderId, project: projectId, displayName: newName})
					.then(function (folder) {
						if (folder) {
							return Promise.reject(new Error("Folder name already exists."));
						} else {
							return project;
						}
					});
				})
				.then(function (project) {
					// console.log("current structure:", project.directoryStructure);
					var tree = new TreeModel();
					if (!project.directoryStructure) {
						return project;
					}
					var root = tree.parse(project.directoryStructure);
					// Walk until the right folder is found
					var theNode = root.first(function (node) {
						return node.model.id === parseInt(folderId);
					});
					// If we found it, rename it as long as it's not the root.
					if (theNode && !theNode.isRoot()) {
						// console.log("found node:", theNode.model.id);
						// do not rename if there is a name conflict with siblings....
						var nname = _.trim(newName);
						var nameOk = true;
						var siblings = root.all(function (n) {
							if (n.parent && n.parent.model.id  === theNode.parent.model.id) {
								// console.log(n.model.name + ' is a sibling to ' + theNode.model.name + ' (' + nname + ')');
								if (_.toLower(n.model.name) === _.toLower(nname)) {
									// console.log('name conflict... do not rename.');
									nameOk = false;
								}
								return true;
							}
							return false;
						});
						if (nameOk) {
							theNode.model.name = _.trim(nname);
						}
					}
					project.directoryStructure = {};
					project.directoryStructure = root.model;
					return project.save();
				})
				.then(function (p) {
					if (p) {
						_dir.save()
						.then(function () {
							resolve(p.directoryStructure);
						});
					} else {
						reject(new Error("ERR: Couldn't rename directory."));
					}
				})
				.catch(function (err) {
					reject(err);
				});
		});
	},
	moveDirectory: function (projectId, folderId, newParentId) {
		var self = this;
		return new Promise(function(resolve, reject) {
			var f = new FolderClass (self.opts);
			var _dir = null;
			return f.findOne({directoryID: folderId, project: projectId})
				.then(function (dir) {
					// console.log("dir:", dir);
					return f.oneIgnoreAccess({_id: dir._id})
					.then(function (d) {
						d.parentId = newParentId;
						_dir = d;
						return self.findById(projectId);
					});
				})
				.then(function (project) {
					// check for manageFolders permission
					if (!project.userCan.manageFolders) {
						return Promise.reject(new Error ("User is not permitted to manage folders for '" + project.name + "'."));
					} else {
						return project;
					}
				})
				.then(function (project) {
					//console.log("current structure:", project.directoryStructure);
					var tree = new TreeModel();
					if (!project.directoryStructure) {
						return project;
					}
					var root = tree.parse(project.directoryStructure);
					// Walk until the right folder is found
					var theNode = root.first(function (node) {
						return node.model.id === parseInt(folderId);
					});
					var theParent = root.first(function(node) {
						return node.model.id === parseInt(newParentId);
					});
					// If we found it, rename it as long as it's not the root.
					if (theParent && theNode && !theNode.isRoot()) {
						//console.log("found node:", theNode.model.id);
						//console.log("found new parent:", theParent.model.id);
						var newKid = theNode.drop();
						theParent.addChild(newKid);
					}
					project.directoryStructure = {};
					project.directoryStructure = root.model;
					//console.log("new structure:", project.directoryStructure);
					return project.save();
				})
				.then(function (p) {
					if (p) {
						_dir.save()
						.then(function () {
							resolve(p.directoryStructure);
						});
					} else {
						reject(new Error("ERR: Couldn't move directory."));
					}
				})
				.catch(function () {
					reject(new Error("ERR: Couldn't move directory."));
				});
		});
	},
	getDirectoryStructure: function (projectId) {
		var self = this;
		var folders = [];
		return new Promise(function (resolve, reject) {
			var f = new FolderClass (self.opts);
			return f.list({project: projectId})
			.then(function (foldersViewable) {
				// console.log("Folders viewable:", foldersViewable);
				folders = foldersViewable;
				return self.findById(projectId);
			})
			.then(function (project) {
				var tree = new TreeModel();
				if (!project.directoryStructure) {
					project.directoryStructure = {id: 1, name: 'ROOT', lastId: 1, published: true};
				}
				var root = tree.parse(project.directoryStructure);
				root.all(function (node) {
				    return true;
				    // return node.model.published !== true;
				}).forEach( function (n) {
					// console.log("n:", n.model.id);
					var found = folders.find(function (el) {
						// console.log("el:", el.directoryID);
						return el.directoryID === parseInt(n.model.id);
					});
					// Make sure we could have read that folder, otherwise consider it dropped.
					// console.log("FOUND:", found);
					if (!found) {
						// console.log("dropping node:", n);
						n.drop();
					}
				});

				resolve(root.model);
			})
			.catch(function (err) {
				console.log("Err:", err);
				resolve({id: 1, name: 'ROOT', lastId: 1, published: true});
			});
		});
	},
	publishDirectory: function (projectId, directoryId) {
		var self = this;
		return new Promise(function (resolve, reject) {
			var root = null;
			var _dir = null;
			var f = new FolderClass (self.opts);
			return f.findOne({directoryID: directoryId, project: projectId})
			.then(function (dir) {
				return f.oneIgnoreAccess({_id: dir._id})
				.then(function (d) {
					_dir = d;
					return self.findById(projectId);
				});
			})
			.then(function (project) {
				// check for manageFolders permission
				if (!project.userCan.manageFolders) {
					return Promise.reject(new Error ("User is not permitted to manage folders for '" + project.name + "'."));
				} else {
					return project;
				}
			})
			.then(function (project) {
				var tree = new TreeModel();
				if (!project.directoryStructure) {
					project.directoryStructure = {id: 1, name: 'ROOT', lastId: 1, published: true};
					return project.directoryStructure;
				}
				root = tree.parse(project.directoryStructure);
				var node = root.first(function (n) {
					// Do it this way because parseInt(directoryId) strips away string chars and leaves
					// the numbers, resulting in potentially unintended consequence
					return ('' + n.model.id) === directoryId;
				});
				if (node) {
					// set it to published.
					node.model.published = true;
					project.directoryStructure = {};
					project.directoryStructure = root.model;
					return self.saveAndReturn(project);
				} else {
					// console.log("couldn't find requested node.");
					return null;
				}
			}).then(function (p) {
				if (p) {
					_dir.publish();
					_dir.save()
					.then(function () {
						resolve(root.model);
					});
				} else {
					reject(root.model);
				}
			})
			.catch(function () {
				reject(new Error ("Could not publish directory."));
			});
		});
	},
	unPublishDirectory: function (projectId, directoryId) {
		var self = this;
		return new Promise(function(resolve, reject) {
			var root = null;
			var _dir = null;
			var f = new FolderClass (self.opts);
			return f.findOne({directoryID: directoryId, project: projectId})
			.then(function (dir) {
				return f.oneIgnoreAccess({_id: dir._id})
				.then(function (d) {
					_dir = d;
					return self.findById(projectId);
				});
			})
			.then(function (project) {
				// check for manageFolders permission
				if (!project.userCan.manageFolders) {
					return Promise.reject(new Error ("User is not permitted to manage folders for '" + project.name + "'."));
				} else {
					return project;
				}
			})
			.then(function (project) {
				var tree = new TreeModel();
				if (!project.directoryStructure) {
					project.directoryStructure = {id: 1, name: 'ROOT', lastId: 1, published: true};
					return project.directoryStructure;
				}
				root = tree.parse(project.directoryStructure);
				var node = root.first(function (n) {
					// Do it this way because parseInt(directoryId) strips away string chars and leaves
					// the numbers, resulting in potentially unintended consequence
					return ('' + n.model.id) === directoryId;
				});
				if (node) {
					// Check if it contains published items first.
					var pnode = node.first(function (w) {
						if (node.model.id !== w.model.id && w.model.published === true) return true;
					});
					if (pnode) {
						return null;
					}
					// See if any documents are published.
					// console.log("finding:", {directoryID: parseInt(directoryId), isPublished: true})
					return DocumentModel.find({project: projectId, directoryID: parseInt(directoryId), isPublished: true})
					.then( function (doc) {
						// console.log("doc:", doc);
						if (doc.length !== 0) {
							// bail - this folder contains published files.
							return Promise.reject(doc);
						}
						// set it to unpublished.
						node.model.published = false;
						project.directoryStructure = {};
						project.directoryStructure = root.model;
						return self.saveAndReturn(project);
					});
				} else {
					// console.log("couldn't find requested node.");
					return null;
				}
			}).then(function (p) {
				if (p) {
					_dir.unpublish();
					_dir.save()
					.then(function () {
						resolve(root.model);
					});
				} else {
					reject(root.model);
				}
			})
			.catch(function (err) {
				reject(err);
			});
		});
	},
	// -------------------------------------------------------------------------
	//
	// set a project to submitted
	//
	// -------------------------------------------------------------------------
	submit: function (project) {
		project.status = 'Submitted';
		//
		// select the right sector lead role
		//
		project.sectorRole = project.type.toLowerCase ();
		project.sectorRole = project.sectorRole.replace (/\W/g,'-');
		project.sectorRole = project.sectorRole.replace (/^-+|-+(?=-|$)/g, '');
		return this.saveDocument (project).then (function (p) {
			//
			// add the project to the roles and the roles to the project
			// this is where the project first becomes visible to EAO
			// through the project admin role and the sector lead role
			// (we dont wait on the promise here, just trust it)
			//
			//
			// TBD ROLES
			//
			return p;
			// return Roles.objectRoles ({
			// 	method      : 'add',
			// 	objects     : p,
			// 	type        : 'projects',
			// 	permissions : {submit : [p.adminRole, p.sectorRole]}
			// });
		});
	},
	// -------------------------------------------------------------------------
	//
	// publish, unpublish
	//
	// -------------------------------------------------------------------------
	publish: function (project, value) {
		var self = this;
		if (value) {
			//
			// add a news item
			//
			self.postMessage ({
				headline: 'New Assessment: '+project.name,
				content: 'New Environmental Assessment: '+project.name+'\n'+project.description,
				project: project._id,
				type: 'News'
			});
			project.publish ();
		}
		else project.unpublish ();
		return this.saveAndReturn (project);
	},
	// -------------------------------------------------------------------------
	//
	// only published projects, minimal get
	//
	// -------------------------------------------------------------------------
	published: function () {
		var self = this;
		var date = new Date(); // date we want to find open PCPs for... TODAY.

		var publishedProjects = new Promise(function(resolve, reject) {
			self.model.find ({ isPublished: true }, {_id: 1, code: 1, name: 1, region: 1, status: 1, eacDecision: 1, lat: 1, lon: 1, type: 1, description: 1, memPermitID: 1})
				.sort ({ name: 1 })
				.populate ('name' )
				.exec(function(err, recs) {
					if (err) {
						reject(new Error(err));
					} else {
						resolve(recs);
					}
				});
		});

		return new Promise(function(resolve, reject) {
			var projects, pcps;
			publishedProjects.then(function(data) {
				resolve(data);
			});
		});
	},
	// -------------------------------------------------------------------------
	//
	// just what I can write to
	//
	// -------------------------------------------------------------------------
	mine: function () {
		var self = this;
		var isProjectIntake = _.find(self.opts.userRoles, function(r) { return r === 'project-intake'; }) !== undefined;

		//Ticket ESM-640.  If these are the user's only roles on a project, don't show the project.
		var ignoredSystemRoles = ['compliance-lead', 'project-eao-staff', 'project-qa-officer', 'project-intake'];
		var findMyProjectRoles = function (username) {
			return new Promise(function (fulfill, reject) {
				// find all my projects where i have a role other than an ignored system role.
				Role.find({ user: username, role: {$nin: ignoredSystemRoles}, context: {$ne: 'application'} })
					.select ({context: 1, role: 1})
					.exec(function (error, data) {
					if (error) {
						reject(new Error(error));
					} else if (!data) {
						reject(new Error('findMyProjectRoles: Project IDs not found for username, no project roles assigned for: ' + username));
					} else {
						fulfill(data);
					}
				});
			});
		};

		var getMyProjects = function(projectRoles) {
			//console.log('projectRoles ',JSON.stringify(projectRoles));
			var projectIds = _.uniq(_.map(projectRoles, 'context'));
			//console.log('projectIds ',JSON.stringify(projectIds));
			var q = {
				//_id: { "$in": projectIds },
				//dateCompleted: { "$eq": null }
			};
			return new Promise(function(fulfill, reject) {
				ProjectModel.find (q)
					.select ({_id: 1, code: 1, name: 1, region: 1, status: 1, lat: 1, lon: 1, type: 1, description: 1, read: 1 })
					.populate ('name')
					.sort ('name')
					.exec (function(error, data) {
					if (error) {
						reject(new Error(error));
					} else if (!data) {
						fulfill([]);
					} else {
						// this mimics querying to see if we have read access to this project.
						// because we have the project/roles, we can skip the overhead of going through the db controller and
						// adding the permissions and userCan to determine user access.
						// we need to save that overhead and waits as those operations read from users/roles/permissions tables.
						var readProjects = [];
						_.each(data, function(d) {
							var projRoles = _.filter(projectRoles, function(x) { return x.context === d._id.toString(); });
							var roles = _.uniq(_.map(projRoles, 'role'));
							var read = d.read;
							var matched = _.intersection(read, roles);
							if (matched.length > 0) {
								readProjects.push(d);
							}
						});
						fulfill(readProjects);
					}
				});
			});
		};

		var getUnpublishedProjects = function() {
			if (!isProjectIntake) {
				return Promise.resolve([]);
			} else {
				var q = {
					dateCompleted: { "$eq": null },
					isPublished: false
				};
				return new Promise(function(fulfill, reject) {
					ProjectModel.find (q)
						.select ({_id: 1, code: 1, name: 1, region: 1, status: 1, lat: 1, lon: 1, type: 1, description: 1, read: 1 })
						.populate ('name')
						.sort ('name')
						.exec (function(error, data) {
							if (error) {
								reject(new Error(error));
							} else if (!data) {
								fulfill([]);
							} else {
								fulfill(data);
							}
						});
				});
			}
		};

		var projects, unpublishedprojects, allprojects = [];
		return findMyProjectRoles(self.user.username)
			.then(function(prs) {
				return getMyProjects(prs);
			})
			.then(function(results) {
				projects = results || [];
				return getUnpublishedProjects();
			})
			.then(function(results) {
				unpublishedprojects = results || [];

				allprojects = projects;

				_.each(unpublishedprojects, function(o) {
					if (_.find(projects, function(p) { return p._id.toString() === o._id.toString(); }) === undefined) {
						allprojects.push(o);
					}
				});
				return _.sortBy(allprojects, function(o) { return o.name; });
			});
	},
	forProponent: function (id) {
		// show this list for an org in the system/management screens.
		// mimic the resuts found on front screen, except for an org and don't care about being published
		var self = this;
		var date = new Date(); // date we want to find open PCPs for... TODAY.

		var orgProjects = new Promise(function(resolve, reject) {
			self.model.find ({ proponent: id }, {_id: 1, code: 1, name: 1, region: 1, status: 1, eacDecision: 1, currentPhase: 1, lat: 1, lon: 1, type: 1, description: 1, memPermitID: 1, isPublished: 1})
				.sort ({ name: 1 })
				.populate ( 'name' )
				.exec(function(err, recs) {
					if (err) {
						reject(new Error(err));
					} else {
						resolve(recs);
					}
				});
		});

		return new Promise(function(resolve, reject) {
			var projects, pcps;
			orgProjects.then(function (data) {
				projects = data;
				resolve(data);
			});
		});
	},
	initDefaultRoles : function(project) {
		console.log('initDefaultRoles(' + project.code + ')');
		var defaultRoles = [];

		project.adminRole = 'project-system--admin';
		project.proponentAdminRole = 'proponent-lead';
		//project.eaoInviteeRole = undefined;
		//project.proponentInviteeRole = undefined;
		project.eaoMember = 'project-eao-staff';
		project.proMember = 'proponent-team';

		defaultRoles.push(project.eaoMember);
		defaultRoles.push(project.proMember);

		return Promise.resolve (project);
	},

	removeProject: function (project) {
		return ProjectModel.remove({_id: project._id});
	}
});
