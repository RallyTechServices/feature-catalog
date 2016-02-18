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

        margin: '3 9 0 0',
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
            return {
                xtype: 'rallycatalogcombobox',
                fieldLabel: this.fieldLabel,
                labelAlign: 'right',
                allowBlank: false,
                storeConfig: this.storeConfig || {},
                displayField: 'Name',
                valueField: 'ObjectID',
                margin: 5,
                listeners: {
                    scope: this,
                    change: me._applyFilter
                }
            };
        },
        _applyFilter: function(cb) {

            var parent = cb.getRecord() && cb.getRecord().get('_ref');
            if (parent){
                var filters = [{
                    property: 'Parent',
                    value: parent
                }],
                filterArgs = {
                    types: this.types,
                    filters: filters
                };
                this.cmp.applyCustomFilter(filterArgs);
            }
        }
    });
