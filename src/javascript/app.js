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
        {xtype:'container',itemId:'selector_box'},
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
            var store = this._loadFeatureStore(this.getCatalogPortfolioItem());
            this._addFeatureGrid(store);
        } else {
            this.down('#display_box').add({
                xtype: 'container',
                html: 'Please configure a Catalog Portfolio Item parent through the app settings.'
            });
        }
    },

    _loadFeatureStore: function(parentPortfolioItem){
        this.logger.log('_loadFeatureStore', parentPortfolioItem);

        //todo: make this adapatable to the type of portfolio item chosen
        var filters = [{
            property: 'Parent.Parent.Parent',
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

    _addFeatureGrid: function(store){
        var portfolioItemModel = this.portfolioItemTypes[0].typePath.toLowerCase(),
            portfolioItemParentModel = this.portfolioItemTypes[1].typePath.toLowerCase(),
            me = this;

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
                groupHeaderTpl: '{name} ({rows.length})'
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
