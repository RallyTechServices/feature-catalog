Ext.define('Rally.technicalservices.plugin.CatalogPickerPlugin', {
        alias: 'plugin.tscatalogpickerplugin',
        extend:'Ext.AbstractPlugin',
        mixins: ['Rally.ui.gridboard.plugin.GridBoardControlShowable'],

        /**
         * @cfg {String[]}
         * the names of the models displayed on the board.
         */
        modelNames: [],

        stateful: true,

        showInGridMode: true,
        headerPosition: 'left',

        init: function(cmp) {
            this.callParent(arguments);
            this.cmp = cmp;

            this.stateId = this.stateId || this.cmp.getContext().getScopedStateId('catalog-picker');
            var state = Ext.state.Manager.get(this.stateId);

            this.showControl();
        },
        
        getControlCmpConfig: function() {
            var me = this;
            console.log('getControlCmpConfig storeConfig', this.storeConfig);
            
            return {
                xtype: 'rallycatalogcombobox',
                fieldLabel: this.fieldLabel,
                labelAlign: 'right',
                allowBlank: false,
                storeConfig: this.storeConfig || {},
                displayField: 'Name',
                valueField: 'ObjectID',
                margin: '3 25 0 0',
                listeners: {
                    scope: this,
                    change: me._applyFilter
                }
            };
        },
        
        _applyFilter: function(cb) {
            var record = this.record;
            if ( !Ext.isEmpty(cb) ) {
                var record = cb.getRecord();
                this.record = record;
            } 
            var parent = record && record.get('_ref');
            if (parent){
                console.log('parent:', parent);
                
                var filters = [{
                    property: 'Parent',
                    value: parent
                }],
                filterArgs = {
                    types: this.types,
                    filters: filters
                };
                this.cmp.defineFilter(filterArgs);
                
                this.cmp.applyCustomFilter(filterArgs);
                
            }
        }
    });
