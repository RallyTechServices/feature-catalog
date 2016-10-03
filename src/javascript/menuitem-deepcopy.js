Ext.define('Rally.ui.menu.bulk.DeepCopy', {
    alias: 'widget.rallyrecordmenuitembulkdeepcopy',
    extend: 'Rally.ui.menu.bulk.MenuItem',

    config: {
        onBeforeAction: function(){
//            console.log('onbeforeaction');
        },

        /**
         * @cfg {Function} onActionComplete a function called when the specified menu item action has completed
         * @param Rally.data.wsapi.Model[] onActionComplete.successfulRecords any successfully modified records
         * @param Rally.data.wsapi.Model[] onActionComplete.unsuccessfulRecords any records which failed to be updated
         */
        onActionComplete: function(){
   //         console.log('onActionComplete');
        },

        text: 'Copy to Parent...',

        handler: function () {
            this._onBulkCopyToParentClicked();
        },
        predicate: function (records) {
            var portfolioItemType = this.typesToCopy[0].toLowerCase();

            return _.every(records, function (record) {
                return record.get('_type').toLowerCase() === portfolioItemType;
            });
        }
    },
     _onBulkCopyToParentClicked: function() {
        var records = this.records,
            me = this;

        Ext.create("Rally.ui.dialog.ArtifactChooserDialog", {
            artifactTypes: [this.portfolioItemType.toLowerCase()],
            autoShow: true,
            height: 250,
            title: 'Choose Parent to copy to',
            storeConfig: {
                context: {
                    project: null,
                    workspace: Rally.util.Ref.getRelativeUri(this.getContext().getWorkspace()),

                },
                fetch: ['FormattedID','Name','Project'],
                filters: this.parentFilters
            },
            autoShow: true,
            columns: [
                {
                    text: 'ID',
                    dataIndex: 'FormattedID',
                    renderer: _.identity
                },
                'Name',
                'Project'
            ],
            listeners: {
                artifactchosen: function(dialog, selectedRecord){
                    me.copyRecords(records, selectedRecord);
                },
                scope: me
            }
        });
    },
    _copyRecord: function(record, parent){
        var deferred = Ext.create('Deft.Deferred');
        var fid = record.get('FormattedID');

        var artifactTree = Ext.create('Rally.technicalservices.ArtifactTree',{
            portfolioItemTypes: this.portfolioItemTypes,
            level1TemplateField: this.level3TemplateField,
            level2TemplateField: this.level2TemplateField,
            level3TemplateField: this.level1TemplateField,
            listeners: {
                treeloaded: function(tree){
                     tree.deepCopy(parent);
                },
                copycompleted: function(rootRecord){
                    deferred.resolve({record: record});
                },
                copyerror: function(errorMsg){
                    deferred.resolve({record: record, errorMessage: errorMsg});
                },
                statusupdate: function(done, total){
                    Rally.ui.notify.Notifier.showStatus({message:Ext.String.format("{0}: {1} of {2} Artifacts copied...", fid, done, total)});
                    this.fireEvent('statusupdate',done,total);
                },
                scope: this
            }
        });

        artifactTree.load(record, record.get('Parent'));

        return deferred;
    },
    copyRecords: function(records, parent){
        var promises= [],
            successfulRecords = [],
            unsuccessfulRecords = [];
        console.log('copyRecords', records.length, records);
        _.each(records, function(r){
            promises.push(function() {
                return this._copyRecord(r, parent);
            });
        }, this);

        Deft.Chain.sequence(promises, this).then({
            success: function(results){
                var errorMessage = '';
                _.each(results, function(r){
                    if (r.errorMessage){
                        errorMessage = r.errorMessage;
                        unsuccessfulRecords.push(r.record);
                    } else {
                        successfulRecords.push(r.record);
                    }
                });

                this.onSuccess(successfulRecords, unsuccessfulRecords, {parent: parent}, errorMessage);
            },
            failure: function(msg){

                this.onSuccess([], [], {parent: parent}, msg);
            },
            scope: this
        });

    },
    onSuccess: function (successfulRecords, unsuccessfulRecords, args, errorMessage) {

        var formattedID = args && args.parent.get('FormattedID'),
            message = successfulRecords.length + (successfulRecords.length === 1 ? ' item has ' : ' items have ');

        if(successfulRecords.length === this.records.length) {
            Rally.ui.notify.Notifier.show({
                message: message +  'been deep copied to ' + formattedID
            });
        } else {
            if (successfulRecords.length === 0){
               message = "0 items have been copied";
            }

            Rally.ui.notify.Notifier.showError({
                message: message + ', but ' + unsuccessfulRecords.length + ' failed: ' + errorMessage,
                saveDelay: 500
            });
        }

        Ext.callback(this.onActionComplete, null, [successfulRecords, unsuccessfulRecords]);
    }
});