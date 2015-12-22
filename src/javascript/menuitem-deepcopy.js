Ext.define('Rally.ui.menu.bulk.DeepCopy', {
    alias: 'widget.rallyrecordmenuitembulkdeepcopy',
    extend: 'Rally.ui.menu.bulk.MenuItem',

    config: {
        text: 'Copy to Parent...',
        handler: function () {
            this._onBulkCopyToParentClicked();
        },
        predicate: function (records) {
            return _.every(records, function (record) {
                return record.self.isArtifact() || record.self.isTimebox();
            });
        }
    },
     _onBulkCopyToParentClicked: function() {
        var records = this.records,
            me = this;
        console.log('_showParentPicker');
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
                    console.log('artifactchosen');
                    me.copyRecords(records, selectedRecord);
                },
                scope: me
            }
        });
    },
    copyRecords: function(records, parent){
        console.log('copyRecrds');
        var artifactTree = Ext.create('Rally.technicalservices.ArtifactTree',{
            rootArtifact: records[0],
            portfolioItemTypes: this.portfolioItemTypes,
            listeners: {
                treeloaded: function(tree){
                    console.log('treeloaded',tree);
                    tree.deepCopy(parent);
                }
            }
        });
        artifactTree.load(records[0]);

        //Ext.create('Rally.technicalservices.DeepCopier',{
        //    portfolioItemTypes: this.portfolioItemTypes,
        //    typesToCopy: this.typesToCopy,
        //    records: records,
        //    overrides: {Parent: parent.get('_ref')},
        //    listeners: {
        //        copycompleted: function(successCount, totalCount, results){
        //            console.log('copycompleted');
        //            var msg = Ext.String.format("{0} or {1} items copied successfully to {2}: {3}", successCount, totalCount, parent.get('FormattedID'), parent.get('Name'));
        //            Rally.ui.notify.Notifier.showMessage({message: msg});
        //        },
        //        copyerror: function(error){
        //            console.log('copyerror');
        //        }
        //    }
        //});
    },
    _copyAllRecords: function(records, parent, deepCopier){
        console.log('_copyAllRecords', deepCopier, parent, records);
    }
});