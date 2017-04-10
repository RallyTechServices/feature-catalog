
Ext.define('Rally.technicalservices.ArtifactTree',{
    logger: new Rally.technicalservices.Logger(),
    mixins: {
        observable: 'Ext.util.Observable'
    },

    rootArtifact: undefined,
    modelHash: null,
    portfolioItemTypes: undefined,
    childTypesBlacklist: undefined,
    parentChildTypeMap: null,
    blacklistFields: null,

    stoppedByError: false,

    constructor: function(config){

        this.blacklistFields = ['Workspace','Attachments','Tags','Discussion','Milestones'];
        this.childTypesBlacklist = config.childTypesBlacklist || ['testcase','defectsuite','defect'];
        this.parentChildTypeMap = this._setupParentChildMap(config.portfolioItemTypes);
        this.modelHash = {};

        this.level1TemplateField = config.level1TemplateField || null;
        this.level2TemplateField = config.level2TemplateField || null;
        this.level3TemplateField = config.level3TemplateField || null;

        this.mixins.observable.constructor.call(this, config);

    },
    load: function(rootArtifact, rootParent){
        this.logger.log('load:', rootArtifact, rootParent);
        
        this.totalRecords = 1;
        this.tree = {};
        this.stoppedByError = false;
        this.rootArtifact = rootArtifact;
        this.rootParent = rootParent && rootParent.FormattedID  || null;
        if (rootParent && this.level1TemplateField){
            this._fetchGrandparent(rootParent).then({
                success: function(grandparent){
                    this.rootGrandparent = grandparent;
                    this._loadModel(rootArtifact);
                },
                scope: this
            });
        } else {
            this.rootGrandparent = null;
            this._loadModel(rootArtifact);
        }
    },
    _updateStatus: function(){
        this.fireEvent('statusupdate', this.completedArtifacts, this.totalArtifacts);
    },
    deepCopy: function(parent){
        this.logger.log('..deepCopy..');
        var me = this;
        this.totalArtifacts = _.keys(this.tree).length || 0;
        this.completedArtifacts = 0;

        this.fireEvent('statusupdate', 0, this.totalArtifacts);
        var overrides = {PortfolioItem: "", Parent: ""};
        if (this.level1TemplateField){
            overrides[this.level1TemplateField] = this.rootArtifact.get('FormattedID'); //this.rootGrandparent;
        }
        if (this.level2TemplateField){
            overrides[this.level2TemplateField] = this.rootParent;
        }
        if (this.level3TemplateField) {
            overrides[this.level3TemplateField] = this.rootArtifact.get('FormattedID');
        }
        this.logger.log('deepCopy.overrides',overrides);
        me._copyStandaloneArtifacts(overrides).then({
            success: function(){
                this.logger.log('deepCopy. _copyStandaloneArtifacts success');
                Deft.Chain.sequence([
                    function() { return me._copyTasks(); },
                    function() { return me._updateCollections(); },
                    function() { return me._stitchArtifacts(); },
                    function() { return me._copyAttachments(); }
                ],me).then({
                    success: function(){
                        this.logger.log('set parent', parent.get('_ref'));
                        var root = me.tree[me.rootArtifact.get('ObjectID')].copyRecord;
                        parent.get('_type') == "portfolioitem/feature" ? root.set("PortfolioItem", parent.get('_ref')):root.set("Parent", parent.get('_ref'));
                        
                        root.save().then({
                            success: function(result, operation){
                                me.fireEvent('copycompleted', me.tree[me.rootArtifact.get('ObjectID')].copyRecord);
                            },
                            failure: function(operation){
                                me.fireEvent('copyerror', Ext.String.format("Error stitching {0} to {1}: {2}", me.rootArtifact.copyRecord.get('FormattedID'), parent.get('FormattedID'), operation.error.errors.join(',')));
                            },
                            scope: this
                        });
                    },
                    failure: function(msg){
                        console.error(msg);
                        me._deleteArtifacts();
                        me.fireEvent('copyerror',msg);
                    },
                    scope: me
                });
            },
            failure: function(msg){
                this.logger.log('deepCopy. _copyStandaloneArtifacts failure', msg);
            },
            scope: this
        });
    },
    _deleteArtifacts: function(){
        this.logger.log('_deleteArtifacts');
        var tasks = [],
            artifacts = [];

        _.each(this.tree, function(artifact, oid) {
            //first we need to delete tasks
            if (artifact.copyRecord) {
                if (artifact.copyRecord.get('_type').toLowerCase() === 'task') {
                    tasks.push(artifact);
                } else {
                    artifacts.push(artifact);
                }
            }
        });

        var promises = [];
        _.each(tasks, function(t){
            promises.push(function(){ return this._deleteArtifact(t)});
        }, this);
        _.each(artifacts, function(a){
            promises.push(function(){ return this._deleteArtifact(a)});
        }, this);


        Deft.Chain.sequence(promises, this).then({
            success: function(){
                this.logger.log('artifacts deleted');
            },
            scope: this
        });
    },
    _deleteArtifact: function(artifact){
        var deferred = Ext.create('Deft.Deferred');

        artifact.deleted = false;
        if (artifact.copyRecord){
            var fid = artifact.copyRecord.get('FormattedID');
            artifact.copyRecord.destroy({
                callback: function(result, operation){
                    this.logger.log('artifact deleted',fid, operation.wasSuccessful(), result, operation);
                    if (operation.wasSuccessful()){
                        artifact.copyRecord = null;
                        artifact.deleted = true;
                    }
                    deferred.resolve();
                },
                scope: this
            });
        }
        return deferred;
    },
    _copyStandaloneArtifacts: function(overrides){
        this.logger.log('_copyStandaloneArtifacts', overrides);
        var promises = [],
            deferred = Ext.create('Deft.Deferred');

        _.each(this.tree, function(obj, oid){
            if (obj.record.get('_type').toLowerCase() !== 'task' && !obj.copyRecord){
                // promises.push(this.copyArtifact(oid, overrides));
                promises.push(function() {
                    return this.copyArtifact(oid, overrides);
                });
            }
        }, this);


        Deft.Chain.sequence(promises, this).then({
            success: function(){
                deferred.resolve();
            },
            failure: function(msg){
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred;
    },
    _stitchArtifacts: function(){
        this.logger.log('_stitchArtifacts');

        var promises = [],
            deferred = Ext.create('Deft.Deferred');

        _.each(this.tree, function(obj, oid){

            var childTypes = this.parentChildTypeMap[obj.record.get('_type').toLowerCase()] || [],
                newParentRef = obj.copyRecord && obj.copyRecord.get('_ref');

            _.each(childTypes, function(ct){
                var children = obj[ct.collectionName] || [];
                if (children.length > 0){
                    _.each(children, function(childOid){
                        if (this.tree[childOid].copyRecord){
                            this.tree[childOid].copyRecord.set(ct.parentField, newParentRef);
                            promises.push(function(){ return this.tree[childOid].copyRecord.save(); });
                        }
                    }, this);
                }
            },this);
        }, this);

        this.logger.log('_stitchArtifacts', promises.length);

        Deft.Chain.sequence(promises, this).then({
            success: function(){
                this.logger.log('_stitchArtifacts success');
                deferred.resolve();
            },
            failure: function(msg){
                this.logger.log('_stitchArtifacts failed', msg);
                deferred.reject(msg);
            },
            scope: this
        });

        return deferred;
    },
    _getNewRefs: function(oldOids, collectionField){
        var newRefs = [];
        if (collectionField === 'Predecessors'){
            _.each(oldOids, function(oid){
                if (this.tree[oid] && this.tree[oid].copyRecord){
                    newRefs.push(this.tree[oid].copyRecord.get('_ref'));
                }
            }, this);
        }
        return newRefs;
    },
    _updateCollections: function(){
        this.logger.log('_updateCollections start');
        var promises = [],
            deferred = Ext.create('Deft.Deferred'),
            collectionFields = ['Predecessors','Tags'];

        _.each(this.tree, function(obj, oid) {
            _.each(collectionFields, function (cf) {
                if (obj[cf] && obj[cf].length > 0) {
                    if (cf === 'Predecessors') {
                        promises.push(function () {
                            var newRefs = this._getNewRefs(obj[cf], cf)
                            return this._updateCollection(obj.copyRecord, cf, newRefs);
                        });

                    } else if (cf === 'Tags') {

                        promises.push(function () {
                            var newRefs = obj[cf];
                            return this._updateCollection(obj.copyRecord, cf, newRefs);
                        });
                    }
                }
            }, this);
        });

        this.logger.log('_updateCollections promises', promises.length);
        
        Deft.Chain.sequence(promises, this).then({
            success: function(){
                this.logger.log('_updateCollections success');
                deferred.resolve();
            },
            failure: function(msg){
                this.logger.log('_updateCollections failed', msg);
                deferred.reject(msg);
            },
            scope: this
        });

        return deferred;
    },
    
    _updateCollection: function(newArtifact, collectionName, collectionRefs){
        this.logger.log('_updateCollection', collectionName, newArtifact, collectionRefs);

        var me = this,
            deferred = Ext.create('Deft.Deferred'),
            store = newArtifact.getCollection(collectionName);

        store.load({
            callback: function(){
                me.logger.log("_updateCollection after store load");
                if ( collectionRefs.length === 0 ) { deferred.resolve(); }
                
                Ext.Array.each(collectionRefs, function(cr){
                    store.add(cr)
                });
                store.sync({
                    callback: function(){
                        me.logger.log("_updateCollection after store sync");
                        deferred.resolve();
                    }
                });
            }
        });
        return deferred.promise;
    },

    _updateArtifact: function(rec){
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('updateArtifact');
        rec.save({
            callback: function(result, operation){
                if(operation.wasSuccessful()) {
                    deferred.resolve();
                } else {
                    deferred.reject("Update for " + rec.get('FormattedID') + " failed: " + operation.error.errors.join(','));
                }
            }
        });
        return deferred;
    },
    _copyTasks: function(){
        this.logger.log('_copyTasks');
        var me = this,
            promises = [],
            deferred = Ext.create('Deft.Deferred');

        _.each(this.tree, function(obj, oid){
            if (obj.record.get('_type').toLowerCase() === 'task'){
                //find parent
                var parent = me._getTaskParentRef(oid);
                if (parent){
                    promises.push(function(){ return me.copyArtifact(oid, {WorkProduct: parent}); });
                }
            }
        }, this);

        Deft.Chain.sequence(promises, this).then({
            success: function(){
                this.logger.log('_copyTasks success');
                deferred.resolve();
            },
            failure: function(msg){
                this.logger.log('_copyTasks fail', msg);
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred;
    },
    
    _copyAttachments:function(source_artifact,target_artifact) {
        this.logger.log('_copyAttachments');
        var me = this,
            promises = [],
            deferred = Ext.create('Deft.Deferred');

        _.each(this.tree, function(obj, oid){
            var attachment_oids = obj.Attachments;
            var parent_record = obj.copyRecord;
                        
            if ( !parent_record ) {
                me.logger.log("_copyAttachments no copy record", obj);
            } else {
                Ext.Array.each(attachment_oids, function(attachment_oid){
                    promises.push( function() {
                        return me.copyAttachment(attachment_oid,parent_record);
                    });
                });
            }
        }, this);

        Deft.Chain.sequence(promises, this).then({
            success: function(){
                me.logger.log('_copyAttachments resolve');
                deferred.resolve();
            },
            failure: function(msg){
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred;    
    },
    
    _getTaskParentRef: function(taskOid){
        var parentOid = null;

        _.each(this.tree, function(obj, oid){
            var tasks = obj && obj.Tasks || [];

            if (Ext.Array.contains(tasks, Number(taskOid))){
                parentOid = obj.copyRecord && obj.copyRecord.get('ObjectID') || null;
                return false;
            }
        });
        return parentOid;
    },
    copyArtifact: function(artifactOid, overrides){
        var deferred = Ext.create('Deft.Deferred'),
            artifact = this.tree[artifactOid].record;
        this.logger.log('copyArtifact', artifact.get('FormattedID'));

        this._fetchModel(artifact.get('_type')).then({
            success: function(model){
                var fields = this.getFieldsToCopy(artifact,overrides);

                Ext.create(model, fields).save({
                    callback: function(result, operation){
                        this.logger.log('copyArtifact callback',artifact.get('FormattedID'), operation.wasSuccessful(), result, operation);
                        if (operation.wasSuccessful()){
                            this.tree[artifactOid].copyRecord = result;
                            
                            this.completedArtifacts++;
                            this._updateStatus();
                            deferred.resolve();
                        } else {
                            this.tree[artifactOid].copyRecord = null;
                            this.tree[artifactOid].error = operation.error.errors.join(',');
                            deferred.reject(operation.error.errors.join(','));
                        }
                    },
                    scope: this
                });
            },
            failure: function(msg){
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred;
    },
    
    copyAttachment: function(oid,parent_record) {
        this.logger.log("copyAttachment", oid, parent_record);
        
        var deferred = Ext.create('Deft.Deferred'),
            me = this;

        Deft.Chain.sequence([
            function() { return me._fetchModel('Attachment'); },
            function() { return me._fetchModel('AttachmentContent'); }
        ]).then({
            success: function(models){
                var attachment_model = models[0];
                var attachment_content_model = models[1];
                
                attachment_model.load(oid, {
                    fetch: ['ObjectID','Content','ContentType','Description','Name','Size','Summary'],
                    callback: function(source_attachment, operation) {
                        if(operation.wasSuccessful()) {
                            var content_oid = source_attachment.get('Content').ObjectID;
                            attachment_content_model.load(content_oid, {
                                fetch: ['Content'],
                                callback: function(source_attachment_content, operation) {
                                    if(operation.wasSuccessful()) {
                                        var content = source_attachment_content.get('Content');
                                        
                                        Ext.create(attachment_content_model, { 'Content': content }).save({
                                            callback: function(content_record,operation) {
                                                if (operation.wasSuccessful()) {
                                                    Ext.create(attachment_model, {
                                                        Artifact   : parent_record.get('_ref'),
                                                        Content    : content_record.get('_ref'),
                                                        ContentType: source_attachment.get('ContentType'),
                                                        Name       : source_attachment.get('Name'),
                                                        Description: source_attachment.get('Description'),
                                                        Size       : source_attachment.get('Size'),
                                                        Summary    : source_attachment.get('Summary')
                                                    }).save({
                                                        callback: function(attachment, operation){
                                                            if (operation.wasSuccessful()){
                                                                console.log('Saved attachment: ', source_attachment.get('Name'));
                                                                deferred.resolve();
                                                            } else {
                                                                deferred.reject(operation.error.errors.join(','));
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    deferred.reject(operation.error.errors.join(','));
                                                }
                                            }
                                        });                                        
                                    } else {
                                        deferred.reject(operation.error.errors.join(','));
                                    }
                                }
                            });
                        } else {
                            deferred.reject(operation.error.errors.join(','));
                        }
                    }
                });
            },
            failure: function(msg){
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred;
    },
    
    getFieldsToCopy: function(artifactToCopy, overrideFields){
        var fields = artifactToCopy.getFields(),
            copyableFields = _.filter(fields, this._fieldIsCopyable, this),
            fieldHash = {};

        //this.logger.log('getFieldsToCopy',copyableFields);

        _.each(copyableFields, function(f){

            //if field is collection and count === 0, then it can be null, otherwise, we need to copy the cooleciton
            if (f.attributeDefinition.AttributeType !== "COLLECTION"){
                var val = artifactToCopy.get(f.name); // || null;

                if (val && Ext.isObject(val)){  //If this is a reference field, then we need to use the ObjectId
                    val = val._ref;
                }

                if (_.has(overrideFields, f.name)){
                    val = overrideFields[f.name];
                }
                //this.logger.log('field', f.name, f.attributeDefinition.AttributeType, val,artifactToCopy.get(f.name));
                if (val){
                    fieldHash[f.name] = val;
                }
            }
        }, this);
        //this.logger.log('getFieldsToCopy fieldHash', fieldHash)

        return fieldHash;
    },
    _fieldIsCopyable: function(field){

        if (Ext.Array.contains(this.blacklistFields, field.name)){

            return false;
        }
        if (field.hidden || field.readOnly){

            return false;
        }
        if (field.attributeDefinition){

            return true;
        }
        return false;
    },


    _loadModel: function(artifact){
        this._fetchModel(artifact.get('_type')).then({
            success: function(model) {
                this.logger.log('_loadModel success');
                this._loadArtifact(model, artifact);
            },
            failure: function(msg){
                this.tree[artifact.get('ObjectID')].error = msg;
                this._checkForDoneness(msg);

            },
            scope: this
        });

    },
    _loadArtifact: function(model, artifact){
        this.logger.log('_loadArtifact', artifact);
        if (this.stoppedByError){
            return;
        }

        var oid = artifact.get('ObjectID');
        model.load(oid, {
            fetch: true,
            scope: this,
            callback: function(loadedArtifact, operation) {
                if(operation.wasSuccessful()) {
                    this.logger.log('_loadArtifact success', oid, loadedArtifact);
                    this.tree[oid] = this.getTreeNode(loadedArtifact);
                    this._loadArtifactCollections(loadedArtifact);
                    //this._loadArtifactChildren(loadedArtifact);
                } else {
                    this.logger.log('_loadArtifact failure', oid, operation);
                    var msg = Ext.String.format("Failed to load {0}/{1} with error: {2} ",artifact.get('_type'),artifact.get('ObjectID'),operation.error.errors.join(','));
                    this.tree[oid].error = msg;
                    this._checkForDoneness(msg);
                }
            }
        });
    },
    getTreeNode: function(artifact){
        return {record: artifact, error: null, childCount: {}};
    },
    _loadArtifactCollections: function(artifact){
        var collectionFields = ['Predecessors','Tags','Attachments'],
            promises = [];

        _.each(collectionFields, function(cf){
            if (artifact.get(cf) && artifact.get(cf).Count && artifact.get(cf).Count > 0){
                //promises.push(this._loadCollection(artifact, cf, false, cf === 'Tags'));
                promises.push(function() {
                    return this.copyArtifact(oid, overrides);
                });                
            }
        }, this);

        if (promises.length > 0){
            Deft.Chain.sequence(promises).then({
                success: function(){
                    this.logger.log('artifact collections loaded', artifact);
                    this._loadArtifactChildren(artifact)
                },
                failure: function(){},
                scope: this
            });
        } else {
            this._loadArtifactChildren(artifact);
        }
    },
    _loadArtifactChildren: function(artifact){
        if (this.stoppedByError){
            return;
        }

        var childrenToLoad = this.parentChildTypeMap[artifact.get('_type').toLowerCase()],
            collectionsLoading = 0;

        childrenToLoad = _.filter(childrenToLoad, function(c){
            if (!Ext.Array.contains(this.childTypesBlacklist, c.typePath)){
                return true;
            }
        }, this);

        this.logger.log('_loadArtifactChildren',childrenToLoad, this.parentChildTypeMap, artifact.get('_type').toLowerCase());
        _.each(childrenToLoad, function(c){
            this.logger.log('_loadArtifactChildren child',c, artifact.get(c.collectionName).Count);
            if (artifact.get(c.collectionName).Count > 0){
                this.totalRecords = this.totalRecords + artifact.get(c.collectionName).Count;
                this._loadCollection(artifact, c.collectionName, true);
            }
        }, this);

        if (collectionsLoading === 0){
            this._checkForDoneness();
        }
    },
    _checkForDoneness: function(errorMessage){
        this.logger.log('_checkForDoneness', this.tree, this.totalRecords, _.keys(this.tree).length, errorMessage);
        if (errorMessage){
            this.stoppedByError = true;
            this.fireEvent('error', errorMessage);
            return;
        }
        if (this.tree && _.keys(this.tree).length === this.totalRecords){
            this.logger.log('TREE LOADED!')
            this.fireEvent('treeloaded', this);
        }
    },
    _loadCollection: function(artifact, collectionName, loadRecord, preserveRefs){
        var deferred = Ext.create('Deft.Deferred'),
            parentOid = artifact.get('ObjectID');

        this.tree[parentOid][collectionName] = [];

        artifact.getCollection(collectionName).load({
            fetch: ['ObjectID'],
            callback: function(records, operation, success) {
                this.logger.log('_loadCollection callback', collectionName, records, success);

                if (success){
                    _.each(records, function(r){
                        var val = r.get('ObjectID');
                        if (preserveRefs){
                            val = r.get('_ref');
                        }
                        this.tree[parentOid][collectionName].push(val);
                        if (loadRecord){
                            this._loadModel(r);
                        }
                    }, this);
                    deferred.resolve();
                } else {
                    var msg = Ext.String.format("Failed to load collecton for {0}/{1} with error: {2} ",artifact.get('_type'),artifact.get('ObjectID'),operation.error.errors.join(','));
                    this.tree[parentOid].error = msg;
                    this._checkForDoneness(msg);
                    deferred.reject(msg);
                }
            },
            scope: this
        });

        return deferred;
    },
    _fetchModel: function(type){
        var deferred = Ext.create('Deft.Deferred');
        if (this.modelHash[type]){
            deferred.resolve(this.modelHash[type]);
        } else {
            Rally.data.ModelFactory.getModel({
                type: type,
                success: function(model){
                    this.modelHash[type] = model;
                    deferred.resolve(model);
                },
                failure: function(){
                    var msg = 'Failed to load model: ' + type;
                    this._checkForDoneness(msg);
                    deferred.reject(msg);
                },
                scope: this
            });
        }
        return deferred;
    },
    _setupParentChildMap: function(portfolioItemsByOrdinal){
        var parentChildTypeMap = {
            hierarchicalrequirement: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'Requirement'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'},
                {typePath: 'hierarchicalrequirement', collectionName: 'Children', parentField: 'Parent'}
            ],
            defect: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            defectsuite: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'DefectSuites'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            testset: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'TestSets'}
            ]
        };

        if (portfolioItemsByOrdinal && portfolioItemsByOrdinal.length > 0){
            parentChildTypeMap[portfolioItemsByOrdinal[0].toLowerCase()] = [{typePath: 'hierarchicalrequirement', collectionName: 'UserStories', parentField: 'PortfolioItem'}];

            for (var i = 1; i<portfolioItemsByOrdinal.length ; i++){
                parentChildTypeMap[portfolioItemsByOrdinal[i].toLowerCase()] = [{typePath: portfolioItemsByOrdinal[i-1], collectionName: 'Children', parentField: 'Parent'}];
            }
        }
        return parentChildTypeMap;
    },
    _fetchGrandparent: function(parentObj){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store',{
            model: parentObj._type,
            fetch: ['Parent','FormattedID'],
            filters: [{
                property: 'FormattedID',
                value: parentObj.FormattedID
            }]
        }).load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(records[0] && records[0].get('Parent') && records[0].get('Parent').FormattedID);
                } else {
                    deferred.reject('Error loading parent record: ' + operation.error.errors.join(','));
                }
            }
        });

        return deferred;
    }
});
