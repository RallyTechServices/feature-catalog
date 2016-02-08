Ext.define('Rally.technicalservices.CatalogCombobox',{
    extend: 'Rally.ui.combobox.ComboBox',
    alias: 'widget.rallycatalogcombobox',

    config: {
        name: 'Catalog Items',

        storeConfig: {
            fetch: ["Name", "ObjectID", "FormattedID"],
            remoteFilter: true,
            autoLoad: true
        },

        listConfig: {
            emptyText: 'No Items to select from',
            minWidth: 500
        },
        //width: 500,
        //minWidth: 3,
        matchFieldWidth: true,
        queryMode: 'local',
        showArrows: true,
        labelAlign: 'right',

    },

    constructor: function(config) {
        this.mergeConfig(config);

        this.plugins = (this.plugins || []);
        this.plugins.push({
            ptype: 'rallycomboboxpreviousnextarrows',
            arrowUserAction: 'Program change via arrow button'
        });

        this.callParent([this.config]);

        if (this.comboBoxPreviousNextArrowsPlugin) {
            if (this.rendered) {
                this.comboBoxPreviousNextArrowsPlugin.enableDisableArrows();
            } else {
                this.on('afterrender', function() {
                    this.comboBoxPreviousNextArrowsPlugin.enableDisableArrows();
                }, this);
            }
        }
    },
    setDefaultValue: function() {
        this.callParent(arguments);
        if(this.isDestroyed) {
            return;
        }
        this.setValue(this.store.getAt(0).get(this.valueField));
    }
});