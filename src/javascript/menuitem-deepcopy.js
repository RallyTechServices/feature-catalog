Ext.define('Rally.ui.menu.bulk.DeepCopy', {
    alias: 'widget.rallyrecordmenuitembulkdeepcopy',
    extend: 'Rally.ui.menu.bulk.MenuItem',
    requires: ['Rally.ui.notify.Notifier'],

    config: {
        text: 'Copy to Parent...',
        handler: function() {
            this._onBulkCopyToParentClicked();
        },
        predicate: function(records) {
            return _.every(records, function(record) {
                return record.self.isArtifact() || record.self.isTimebox();
            });
        },

        saveRecords: function(records, args) {

            var promises = _.map(records, function(record){
                return this._saveRecord(record, args);
            }, this);

            Deft.Promise.all(promises).then({
                scope: this,
                success: function(results){
                    var successfulRecords = [],
                        unsuccessfulRecords = [],
                        errorMessage= '';

                    _.each(results, function(r){
                        if (r.successfulRecord){
                            successfulRecords.push(r.successfulRecord);
                        } else {
                            unsuccessfulRecords.push(r.unsuccessfulRecord);
                            errorMessage = r.operation && r.operation.error && r.operation.error.errors.join(',') || "Error updating record " + r.unsuccessfulRecord.get('FormattedID');
                        }

                    });
                    this.onSuccess(successfulRecords, unsuccessfulRecords, args, errorMessage);
                }
            });


        }
    },
    _saveRecord: function(record, args){
        var deferred = Ext.create('Deft.Deferred');

        record.set(args.field.name, args.value);

        record.save({
            callback: function(result, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve({successfulRecord: record, unsuccessfulRecord: null});
                } else {
                    deferred.resolve({successfulRecord: null, unsuccessfulRecord: record, operation: operation});
                }
            }
        });
        return deferred;
    },
    _onBulkCopyToParentClicked: function() {
        var numRecords = this.records.length;

        //todo add filters so that records cannot be copied to children of the template portfolio item 

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
                fetch: ['FormattedID','Name','Project']
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
                    console.log('selectedRecord', selectedRecord);
                    Rally.ui.notify.Notifier.show({
                        message: numRecords + ' child records copied to parent ' + selectedRecord.get('FormattedID')
                    });
                    //Ext.Msg.alert('Chooser', selectedRecord.get('Name') + ' was chosen');
                },
                scope: this
            }
        });
    },

    _onEdit: function(dialog, args) {
        if (this.onBeforeAction(this.records) === false) {
            return;
        }
        //this.saveRecords(this.records, args);
    },

    /**
     * @override
     * @inheritdoc
     */
    onSuccess: function (successfulRecords, unsuccessfulRecords, args, errorMessage) {

        var message = successfulRecords.length + (successfulRecords.length === 1 ? ' item has' : ' items have');


        message += ' had ' + args.displayName;
        if (args.value === null || args.value === '') {
            message += ' removed';
        } else {
            message += ' changed to "' + (args.displayValue || args.value) + '"';
        }

        if(successfulRecords.length === this.records.length) {
            Rally.ui.notify.Notifier.show({
                message: message + '.'
            });
        } else {
            Rally.ui.notify.Notifier.showWarning({
                message: message + ', but ' + unsuccessfulRecords.length + ' failed: ' + errorMessage
            });
        }

        var changes = {};
        changes[args.field.name] = args.value;
        Ext.callback(this.onActionComplete, null, [successfulRecords, unsuccessfulRecords, changes]);
    }
});