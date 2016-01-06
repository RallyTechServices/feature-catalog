Ext.define("feature-catalog", {
    extend: 'Rally.app.App',

    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            portfolioItemPicker: null
        }
    },

    items: [
        {xtype:'container',itemId:'selector_box', layout: {type: 'hbox'}},
        {xtype:'container',itemId:'display_box'}
    ],
    
    launch: function() {
        Rally.technicalservices.Toolbox.fetchPortfolioItemTypes().then({
            success: function(portfolioItemTypes){
                this.logger.log('success', portfolioItemTypes)
                this.portfolioItemTypes = portfolioItemTypes;
                Rally.data.ModelFactory.getModel({
                    type: portfolioItemTypes[0].typePath,
                    success: function(model) {

                        this.portfolioItemModel = model;
                        this.updateDisplay();
                    },
                    scope: this
                });
            },
            failure: function(msg){
                Rally.ui.notify.Notifier.showError('Error retrieving portfolio item types:  ' + msg);
            },
            scope: this
        });
    },

    getCatalogPortfolioItem: function(){
        return this.getSetting('portfolioItemPicker') || null;
    },

    updateDisplay: function(){
        this.down('#display_box').removeAll();
        if (this.getCatalogPortfolioItem()){
            this._addSecondLevelPicker(this.getCatalogPortfolioItem());
        } else {
            this.down('#display_box').add({
                xtype: 'container',
                html: 'Please configure a Catalog Portfolio Item parent through the app settings.'
            });
        }
    },
    _addSecondLevelPicker: function(parentPortfolioItem){
        this.down('#selector_box').removeAll();

        var regex = new RegExp("^/(portfolioitem/.+)/","i"),
            parentType = parentPortfolioItem.match(regex)[1],
            types = _.map(this.portfolioItemTypes, function(p){return p.typePath.toLowerCase(); });

        this.logger.log('_addSecondLevelPicker', parentType, types);
        var idx = _.indexOf(types, parentType);

        var parentFiltersProperty = _.range(idx-1).map(function(p){return "Parent";}).join("."),
            parentFilters = [{
                property: parentFiltersProperty,
                operator: "!=",
                value: parentPortfolioItem
            }];


        if (idx > 2){
            var property = _.range(idx-2).map(function(p){return "Parent";}).join(".");
            this.logger.log('property', types, property, types[idx-1]);
            var filters = [{
                property: property,
                value: parentPortfolioItem
            },{
                property: 'DirectChildrenCount',
                operator: '>',
                value: 0
            }];

            this.down('#selector_box').add({
                xtype: 'rallycatalogcombobox',
                fieldLabel: this.portfolioItemTypes[2].name,
                labelAlign: 'right',
                allowBlank: false,
                storeConfig: {
                    model: types[2],
                    filters: filters
                },
                displayField: 'Name',
                valueField: 'ObjectID',
                margin: 5,
                listeners: {
                    scope: this,
                    change: function(cb){
                        this.logger.log('Parent.Parent Combo change', cb.getRecord());
                        if (cb.getValue()){
                            var store = this._loadFeatureStore(cb.getRecord().get('_ref'));
                            this._addFeatureGrid(store, parentFilters);
                        }
                    }
                }
            });

        } else {
            var store = this._loadFeatureStore(this.getCatalogPortfolioItem());
            this._addFeatureGrid(store,parentFilters);
        }
    },
    _loadFeatureStore: function(parentPortfolioItem){
        this.logger.log('_loadFeatureStore', parentPortfolioItem);

        if (this.down('rallygrid')){
            this.down('rallygrid').destroy();
        }

        //todo: make this adapatable to the type of portfolio item chosen
        var filters = [{
            property: 'Parent.Parent',
            value: parentPortfolioItem
        }];


        var store = Ext.create('Rally.data.wsapi.Store',{
            model: this.portfolioItemTypes[0].typePath,
            groupField: 'Parent',
            groupDir: 'ASC',
            filters: filters,
            fetch: ['FormattedID','Name','Parent'],
            getGroupString: function(record) {
                var parent = record.get('Parent');
                return (parent && parent._refObjectName) || 'No Parent';
            }
        });
        return store;
    },

    _addFeatureGrid: function(store, parentFilters){
        var portfolioItemModel = this.portfolioItemTypes[0].typePath.toLowerCase(),
            portfolioItemParentModel = this.portfolioItemTypes[1].typePath.toLowerCase(),
            me = this;


        this.down('#display_box').removeAll();
        this.logger.log('_addFeatureGrid', portfolioItemModel, portfolioItemParentModel);

        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: [
                'FormattedID',
                'Name'
            ],
            plugins: [{
                ptype: 'tsgridfieldpicker',
                models: [this.portfolioItemModel],
                headerContainer: this.down('#selector_box'),
                context: this.getContext()
            }],
            bulkEditConfig: {
                items: [{
                    xtype: 'rallyrecordmenuitembulkdeepcopy' ,
                    portfolioItemType: portfolioItemParentModel,
                    portfolioItemTypes: _.map(this.portfolioItemTypes, function(p){ return p.typePath; }),
                    typesToCopy: [this.portfolioItemTypes[0].typePath, 'hierarchicalrequirement','task'],
                    parentFilters: parentFilters,
                    listeners: {
                        statusupdate: function(done, total){
                            console.log('app status update', done, total);
                        }
                    }
                }]
            },
            context: this.getContext(),
            features: [{
                ftype: 'groupingsummary',
                groupHeaderTpl: '{name} ({rows.length})',
                startCollapsed: true
            }],
            enableBulkEdit: true
        });
    },
    _copyToParent: function(records, parent){
        this.logger.log('_copyToParent', records, parent);
    },
    getSettingsFields: function(){
        return [{
            xtype: 'chartportfolioitempicker',
            name: 'catalogPortfolioItem',
            fieldLabel: ''
        }];
    },

    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        Ext.apply(this, settings);
        this.updateDisplay();
    }
});
