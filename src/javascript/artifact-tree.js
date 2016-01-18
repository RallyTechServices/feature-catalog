
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

        this.blacklistFields = ['Workspace','Attachments','Tags','Discussion','Milestones','Predecessors','Successors'];
        this.childTypesBlacklist = config.childTypesBlacklist || ['testcase','defectsuite','defect'];
        this.parentChildTypeMap = this._setupParentChildMap(config.portfolioItemTypes);
        this.modelHash = {};

        this.level1TemplateField = config.level1TemplateField || null;
        this.level2TemplateField = config.level2TemplateField || null;
        this.level3TemplateField = config.level3TemplateField || null;

        this.mixins.observable.constructor.call(this, config);

    },
    load: function(rootArtifact, rootParent, rootGrandparent){
        this.totalRecords = 1;
        this.tree = {};
        this.stoppedByError = false;
        this.rootArtifact = rootArtifact;
        this.rootParent = rootParent;
        this.rootGrandparent = rootGrandparent;

        this._loadModel(rootArtifact);
    },
    _updateStatus: function(){
        this.fireEvent('statusupdate', this.completedArtifacts, this.totalArtifacts);
    },
    deepCopy: function(parent){
        this.logger.log('deepCopy');
        var me = this;
        this.totalArtifacts = _.keys(this.tree).length || 0;
        this.completedArtifacts = 0;

        this.fireEvent('statusupdate', 0, this.totalArtifacts);
        var overrides = {PortfolioItem: "", Parent: ""};
        if (this.level1TemplateField){
            overrides[this.level1TemplateField] = this.rootGrandparent;
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
                    me._copyTasks,
                    me._stitchArtifacts
                ],me).then({
                    success: function(){
                        this.logger.log('set parent', parent.get('_ref'));
                        var root = me.tree[me.rootArtifact.get('ObjectID')].copyRecord;
                        root.set("Parent", parent.get('_ref'));
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
                promises.push(this.copyArtifact(oid, overrides));
            }
        }, this);

        Deft.Promise.all(promises, this).then({
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
                    me.logger.log('parentRef', parent);
                    promises.push(function(){ return me.copyArtifact(oid, {WorkProduct: parent}); });
                }
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
    _getTaskParentRef: function(taskOid){
        var parentOid = null;

        _.each(this.tree, function(obj, oid){
            var tasks = obj && obj.Tasks || [];
            console.log(tasks, taskOid,Ext.Array.contains(tasks, Number(taskOid)));
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
                        this.logger.log('copyArtifact callback', operation.wasSuccessful(), result, operation);
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
    getFieldsToCopy: function(artifactToCopy, overrideFields){
        var fields = artifactToCopy.getFields(),
            copyableFields = _.filter(fields, this._fieldIsCopyable, this),
            fieldHash = {};

        this.logger.log('getFieldsToCopy',copyableFields);

        _.each(copyableFields, function(f){

            //if field is collection and count === 0, then it can be null, otherwise, we need to copy the cooleciton
            if (f.attributeDefinition.AttributeType === "COLLECTION"){
                //todo copy collection
            }

            var val = artifactToCopy.get(f.name) || null;

            if (val && Ext.isObject(val)){  //If this is a reference field, then we need to use the ObjectId
                val = val._ref;
            }

            if (_.has(overrideFields, f.name)){
                val = overrideFields[f.name];
            }
            this.logger.log('field', f.name, f.attributeDefinition.AttributeType, val,artifactToCopy.get(f.name));
            if (val){
                fieldHash[f.name] = val;
            }
        }, this);
        console.log('fieldHash', fieldHash);
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
                    this._loadArtifactChildren(loadedArtifact);
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
                this._loadCollection(artifact, c.collectionName);
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
    _loadCollection: function(artifact, collectionName){
        var deferred = Ext.create('Deft.Deferred'),
            parentOid = artifact.get('ObjectID');

        this.tree[parentOid][collectionName] = [];

        artifact.getCollection(collectionName).load({
            fetch: ['ObjectID'],
            callback: function(records, operation, success) {
                if (success){
                    _.each(records, function(r){
                        this.tree[parentOid][collectionName].push(r.get('ObjectID'));
                        this._loadModel(r);
                    }, this);
                    this._checkForDoneness();
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
    }

});
