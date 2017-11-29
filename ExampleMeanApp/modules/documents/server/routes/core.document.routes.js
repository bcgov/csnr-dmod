'use strict';
// =========================================================================
//
// Routes for Documents
//
// Does not use the normal crud routes, mostly special sauce
//
// =========================================================================
var DocumentClass  = require ('../controllers/core.document.controller');
var routes = require ('../../../core/server/controllers/core.routes.controller');
var policy = require('../../../core/server/controllers/core.policy.controller');
var config = require('../../../../config/config');

module.exports = function (app) {
	//
	// get put new delete
	//
	routes.setCRUDRoutes (app, 'document', DocumentClass, policy, ['get','put','new', 'delete', 'query'], {all:'guest',get:'guest'});
	//
	// getAllDocuments                 : '/api/documents'
	//
	app.route ('/api/documents')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.list ();
		}));
	//
	// getProjectDocuments             : '/api/documents/' + projectId
	//
	app.route ('/api/documents/:projectid')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getDocumentsForProject (req.params.projectid, req.headers.reviewdocsonly);
		}));
	//
	// getProjectDocumentTypes         : '/api/documents/types/' + projectId
	//
	app.route ('/api/documents/types/:projectid')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getDocumentTypesForProject (req.params.projectid, req.headers.reviewdocsonly);
		}));
	//
	// getProjectDocumentSubTypes      : '/api/documents/subtypes/' + projectId
	//
	app.route ('/api/documents/subtypes/:projectid')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getDocumentSubTypesForProject (req.params.projectid);
		}));
	//
	// getProjectDocumentFolderNames   : '/api/documents/folderNames/' + projectId
	//
	app.route ('/api/documents/folderNames/:projectid')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getDocumentFolderNamesForProject (req.params.projectid);
		}));
	//
	// getProjectDocumentFolderNames (for MEM)   : '/api/documents/memtypes/' + projectId
	//
	app.route ('/api/documents/memtypes/:projectid')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getDocumentTypesForProjectMEM (req.params.projectid);
		}));
	//
	// getProjectDocumentVersions      : '/api/documents/versions/' + projectId
	//
	app.route ('/api/documents/versions/:document')
		.all (policy ('guest'))
		.get (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getDocumentVersions (req.Document);
		}));
	//
	// getDocumentsInList              : '/api/documentlist', data:documentList
	//
	app.route ('/api/documentlist')
		.all (policy ('guest'))
		.put (routes.setAndRun (DocumentClass, function (model, req) {
			return model.getList (req.body);
		}));
	//
	// fetch a document (download multipart stream)
	//
	app.route ('/api/document/:document/fetch')
		.all (policy ('guest'))
		.get (function (req, res) {
            if (req.Document.internalURL.match(/^(http|ftp)/)) {
                res.redirect(req.Document.internalURL);
            } else {
                // ETL fixing - if the name was brought in without a filename, and we have their document
                // file format, affix the type as an extension to the original name so they have a better
                // chance and opening up the file on double-click.
                String.prototype.endsWith = String.prototype.endsWith || function (str) {
                    return new RegExp(str + "$").test(str);
                };
                console.log("fetching:", req.Document.internalOriginalName, ":", req.Document.documentFileFormat);
                var name = req.Document.internalOriginalName;
                if (req.Document.documentFileFormat && !req.Document.internalOriginalName.endsWith(req.Document.documentFileFormat)) {
                    name = req.Document.internalOriginalName + "." + req.Document.documentFileFormat;
                }

                // get the file.
                
                var downloadurl = '/api/documents/' + req.Document.internalURL + '/download';
                var options = {
                    host: config.dmservice,
                    port: 8080,
                    path: downloadurl
                };
                var contentDisposition = 'attachment; filename=' + req.Document.documentFileName;
                res.writeHead(200, {
                    'Content-Type': req.Document.internalMime,
                    'Content-Disposition': contentDisposition,
                    'Content-Length': req.Document.internalSize
                });
                var http = require('http');
                http.get(options, function (response) {
                    response.on('data', function (data) {
                        res.write(data);
                    }).on('end', function () {
                        res.end();                        
                    });
                });
            }
            
		});
	//
	// upload comment document:  We do this to force the model as opposed to trusting the
	// 'headers' from an untrustworthy client.
	//
	app.route ('/api/commentdocument/:project/upload')
	.all (policy ('guest'))
		.post (routes.setAndRun (DocumentClass, function (model, req) {
			return new Promise (function (resolve, reject) {
                var file = req.files.file;


				if (file) {
                    var opts = { oldPath: file.path, projectCode: req.Project.code };



					routes.moveFile (opts)
					.then (function (newFilePath) {
						var theModel = model.create ({
							// Metadata related to this specific document that has been uploaded.
							// See the document.model.js for descriptions of the parameters to supply.
							project                 : req.Project,
							//projectID             : req.Project._id,
							projectFolderType       : req.body.documenttype,//req.body.projectfoldertype,
							projectFolderSubType    : req.body.documentsubtype,//req.body.projectfoldersubtype,
							projectFolderName       : req.body.documentfoldername,
							projectFolderURL        : newFilePath,
							projectFolderDatePosted : Date.now(),
							// NB                   : In EPIC, projectFolders have authors, not the actual documents.
							projectFolderAuthor     : req.body.projectfolderauthor,
							// These are the data as it was shown on the EPIC website.
							documentAuthor          : req.body.documentauthor,
							documentFileName        : req.body.documentfilename,
							documentFileURL         : req.body.documentfileurl,
							documentFileSize        : req.body.documentfilesize,
							documentFileFormat      : req.body.documentfileformat,
							documentIsInReview      : req.body.documentisinreview,
							documentVersion         : 0,
							documentSource			: 'COMMENT',
							// These are automatic as it actually is when it comes into our system
							internalURL             : newFilePath,
							internalOriginalName    : file.originalname,
							internalName            : file.name,
							internalMime            : file.mimetype,
							internalExt             : file.extension,
							internalSize            : file.size,
							internalEncoding        : file.encoding,
							directoryID             : req.body.directoryid || 0
                        });                      

                        return theModel;
					})
					.then (resolve, reject);
				}
				else {
					reject ("no file to upload");
				}
			});
		}));
	//
	// upload document
	//
	app.route ('/api/document/:project/upload').all (policy ('guest'))
		.post (routes.setAndRun (DocumentClass, function (model, req) {
            return new Promise(function (resolve, reject) {
                console.log("incoming upload");
                var file = req.files.file;
                if (file && file.originalname === 'this-is-a-file-that-we-want-to-fail.xxx') {
                    reject('Fail uploading this file.');
                } else if (file) {
                    var opts = { oldPath: file.path, projectCode: req.Project.code };


                    /* upload to the document management system. */
                    var superagent = require('superagent');
                    var agent1 = superagent.agent();
                    var itemid = "";
                    var dmsurl = 'http://' + config.dmservice + ':8080/api/documents';
                    console.log("DMS URL is " + dmsurl);
                    console.log("File.path is " + file.path);
                    agent1.post(dmsurl)
                        .attach('file', file.path)
                        .end(function (err, res) {
                            if (err) {
                                console.log(err);
                            }
                            
                            itemid = res.text.substring(1, res.text.length - 1);
                            
                            var readPermissions = null;
                            if (req.headers.internaldocument) {
                                // Force read array to be this:
                                readPermissions = ['assessment-admin', 'assessment-lead', 'assessment-team', 'assistant-dm', 'assistant-dmo', 'associate-dm', 'associate-dmo', 'complaince-officer', 'complaince-lead', 'project-eao-staff', 'project-epd', 'project-intake', 'project-qa-officer', 'project-system-admin'];
                            }
                            var datePosted = Date.now();
                            var dateReceived = Date.now();                            

                            console.log("creating model");
                            model.create({
                                // Metadata related to this specific document that has been uploaded.
                                // See the document.model.js for descriptions of the parameters to supply.
                                project: req.Project,
                                //projectID             : req.Project._id,
                                projectFolderType: req.body.documenttype,//req.body.projectfoldertype,
                                projectFolderSubType: req.body.documentsubtype,//req.body.projectfoldersubtype,
                                projectFolderName: req.body.documentfoldername,
                                projectFolderURL: '',
                                datePosted: datePosted,
                                dateReceived: dateReceived,

                                // Migrated from old EPIC
                                oldData: req.body.olddata,

                                // NB                   : In EPIC, projectFolders have authors, not the actual documents.
                                projectFolderAuthor: req.body.projectfolderauthor,
                                // These are the data as it was shown on the EPIC website.
                                documentEPICProjectId: req.body.documentepicprojectid,
                                documentAuthor: req.body.documentauthor,
                                documentFileName: req.body.documentfilename,
                                documentFileURL: req.body.documentfileurl,
                                documentFileSize: req.body.documentfilesize,
                                documentFileFormat: req.body.documentfileformat,
                                documentIsInReview: req.body.documentisinreview,
                                documentVersion: 0,
                                // These are automatic as it actually is when it comes into our system
                                internalURL: itemid,
                                internalOriginalName: file.originalname,
                                internalName: file.name,
                                internalMime: file.mimetype,
                                internalExt: file.extension,
                                internalSize: file.size,
                                internalEncoding: file.encoding,
                                directoryID: req.body.directoryid || 0,
                                displayName: req.body.displayname || req.body.documentfilename || file.originalname,
                                dateUploaded: req.body.dateuploaded
                            }, req.headers.inheritmodelpermissionid, readPermissions)
                                .then(function (d) {
                                    if (req.headers.publishafterupload === 'true') {
                                        return model.publish(d);
                                    } else {
                                        return d;
                                    }
                                })
                                .then(resolve, reject);
                        });
                }
				else {
					reject ("no file to upload");
				}
			});
		}));
    app.route('/api/document/makeLatest/:document').all(policy('user'))
        .put(routes.setAndRun(DocumentClass, function (model, req) {
            return model.makeLatest(req.Document);
        }));
	app.route('/api/publish/document/:document').all(policy('user'))
		.put(routes.setAndRun(DocumentClass, function (model, req) {
			return model.publish(req.Document);
		}));
	app.route('/api/unpublish/document/:document').all(policy('user'))
		.put(routes.setAndRun(DocumentClass, function (model, req) {
			return model.unpublish(req.Document);
		}));
	app.route('/api/getDocumentByEpicURL').all(policy('guest'))
		.put(routes.setAndRun(DocumentClass, function (model, req) {
			return model.getEpicProjectFolderURL(req.body);
		}));

};

