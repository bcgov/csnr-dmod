# Introduction
The CSNR-DMOD project demonstrates the integration of the NRS Document Service with OpenShift.  The project documentation is kept in the github [DMOD Wiki](https://github.com/bcgov/csnr-dmod/wiki/)    

The prototype consists of the following:
- **DocumentServices** - a microservice that acts as a bridge between OpenShift and NRS Document Service. An OpenShift template has been created for this microservice in order to be usable by other applications that need to access document management system in the OpenShift environment. Refer to [Document Services](https://github.com/bcgov/csnr-dmod/wiki/Document-Microservice) for detailed documentation.
- **ExampleMeanApp** - an example client that uses the Document Services in OpenShift. Among its features are the following:
	- Login using OAuth2
	- Display and Download of documents for public users
	- Display, Download, Upload of documents for logged in users
	- Management of Folders and Documents for logged in users

## Development Environment

### ExampleMeanApp: Node.js

Install the following:
- Ruby (https://www.ruby-lang.org/en/downloads/)
- sass (a Ruby package)
	- Execute `gem install sass` to install
- Python (version > 2.5 and < 3.0, 2.7 is recommended https://www.python.org/downloads/)
- Node Version Manager (https://github.com/coreybutler/nvm-windows/releases)
	- Execute `nvm install v6.11.3 32` 
	- Execute `nvm use v6.11.3 32`

Run Locally Through Command Line 
```
    git clone https://github.com/bcgov/csnr-dmod.git
    cd cnsr-dmod
    cd ExampleMeanApp
    npm install -g kerberos -python=<Python Location> (e.g \Python27) 
    npm install -python=<Python Location>  
    bower install --config.interactive=false --allow-root
    grunt buildprod
    node server.js
```

Run Locally Using Eclipse IDE
```
    Install Eclipse (http://www.eclipse.org/downloads/)
    Install Node.js plugin for Eclipse (https://marketplace.eclipse.org/content/nodeclipse)
    Create a new Node.js project in eclipse and browse the ExampleMeanApp as the location of the project
    Right click on the server.js file and execute Run As Node.js Application 
```

### DocumentServices: Java  

#### Prerequisites:   
1. The following must be installed:
	- Java JDK 1.7 or newer (http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html)
	- Maven (https://maven.apache.org/download.cgi)
	- Java IDE (e.g. Eclipse IDE)
2. The following must be installed:
	- Download the following libraries from the NRS Artifactory

| Artifact | Version |
| -------- | ------- |
| nrs-dm-model           | 1.2.0.4 |
| nrs-dm-rest-client     | 1.2.0.4 |
| nrs-dm-rest-common     | 1.2.0.4 |
| nrs-dm-service         | 1.2.0.4 |
| webade-oauth2-rest-token-client | 1.2.0.4 |

	- For each of the required artifacts, create a directory in /tmp folder following the package structure. E.g. nrs-dm-model 1.2.0.4 should have a folder ca\bc\gov\nrs\common\dm\nsrs-dm-model\1.2.0.4 and place the nrs-dm-model inside this folder
	- Create an archive of all the artifacts that have been created in its appropriate folder. Name this archive ca.zip. (The ca.zip is not needed to run locally but required in further steps to setup the DocumentServices in Openshift environment)

Run Locally Using Eclipse IDE
```
    In eclipse, Import As Maven project the DocumentServices
    Right click on the class ApplicationStarter.java and Run As Java Application. 
    Verify if the service successfully runs by checking in the browser http://localhost:8080, the list of services will be displayed
```



### OpenShift Environment : Build  

Secret
-------
The Document Microservice has a dependency on certain libraries which are not stored in the Open Source repository.  These files are stored in the NRS Artifactory.
	- ca.zip contains the WebADE libraries and NRS Document Management libraries and needs to be added as a secret into the Openshift platform

Using an account with Admin access to the Openshift Platform execute the following commands:

    oc project csnr-dmod-tools
    oc secrets new nrs-libs ca.zip

**Note that the jar files in that directory should not be checked into the Git repository.**



Build Template
--------------
The Build template is used to provision the Tools project.  Be sure to review the contents of the template and substitute appropriate values for the template parameters when the template is processed.

If no changes to the default parameters are required, the template can be processed and used to create OpenShift objects with the following commands:

`oc project csnr-dmod-tools`
`oc process -f dmod-build-template.json | oc create -f -` 

Nexus
-----
Complex Java projects can be slow to execute.  Build times of more than 30 minutes are normal, and sometimes a build can take more than several hours.  To speed up the build, a local nexus can be used.

The following commands can be used to configure a local nexus:

```
oc new-app sonatype/nexus
oc expose svc/nexus
oc volumes dc/nexus --add --name nexus-volume-1 --type persistentVolumeClaim --mount-path /sonatype-work/ --claim-name nexus-pv --claim-size 5G --overwrite
```

You can then create a Node.js proxy repository, and put the URL for that proxy repository into the NPM_MIRROR environment variable in any Node.js applications.


### OpenShift Environment : Deployment   

Secret
-------
The Document Microservice requires WebADE credentials as a runtime configuration.

Create a template file of the secret in JSON format:

```
{
    "kind": "Secret",
    "apiVersion": "v1",
    "metadata": {
        "name": "webade-service-credentials",
        "creationTimestamp": null
    },
    "data": {
        "username": <replace with WebADE SERVICE CLIENT ID that is used to access documents for public user>,
        "password": <replace with password of the SERVICE CLIENT ID used> 
    }
}
```

**Note the secret template should not be checked into the Git repository.**

Using an account with Admin access to the Openshift Platform execute the following commands:

```
    oc project csnr-dmod-dev
    oc create -f <file name of the secret file>
```



Deployment Template
-------------------
1. Go to csnr-dmod-dev project
`oc project csnr-dmod-dev`

2. Allow the dev project to access the tools project
`oc policy add-role-to-user system:image-puller system:serviceaccount:csnr-dmod-dev:default -n csnr-dmod-tools`

3. There are 2 templates available(choose one that is applicable):
	- dmod-deployment-template.json (this templates creates both the deployment of ExampleMeanApp and the DocumentServices)
		- To execute `oc process -f dmod-deployment-template.json | oc create -f -`
	- document-microservice-template.json (this templates creates the deployment of the DocumentServices, this is useful for other projects that may reuse document service)
		- To execute `oc process -f document-microservice-template.json | oc create -f -`


### Getting Help or Reporting an Issue
To report bugs/issues/features requests, please file an [issue](https://github.com/bcgov/csnr-dmod/issues/).

### How to Contribute
If you would like to contribute, please see our [contributing](CONTRIBUTING.md) guidelines.

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

### Licence
	Copyright 2017 Province of British Columbia

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at 

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

This repository is maintained by (http://www2.gov.bc.ca/gov/content/governments/organizational-structure/ministries-organizations/ministries/forest-and-natural-resource-operations). 
