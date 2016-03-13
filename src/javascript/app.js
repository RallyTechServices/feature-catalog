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
            this._buildTreeStore();
        } else {
            this.down('#display_box').add({
                xtype: 'container',
                html: 'Please configure a Catalog Portfolio Item parent through the app settings.'
            });
        }
    },
    _getTreeModels: function(){
        return [this.portfolioItemTypes[1].typePath.toLowerCase(),this.portfolioItemTypes[0].typePath.toLowerCase(),'hierarchicalrequirement'];
    },
    _getParentFilters: function(){
        var parentPortfolioItem = this.getCatalogPortfolioItem(),
            regex = new RegExp("^/(portfolioitem/.+)/","i"),
            parentType = parentPortfolioItem.match(regex)[1],
            types = _.map(this.portfolioItemTypes, function(p){return p.typePath.toLowerCase(); });

        this.logger.log('_getParentFilters', parentType, types);
        var idx = _.indexOf(types, parentType);

        var parentFiltersProperty = _.range(idx-1).map(function(p){return "Parent";}).join("."),
            parentFilters = [{
                property: parentFiltersProperty,
                operator: "!=",
                value: parentPortfolioItem
            }];
            
        this.logger.log('filters:', parentFilters);
        return parentFilters;
    },
    _buildTreeStore: function(){
        this.logger.log('_buildTreeStore', this._getTreeModels());

        var models= [this._getTreeModels()[0]];

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: models,
            enableHierarchy: true,
            autoLoad: true,
            fetch: ['FormattedID','Name','Project','Parent','Parent']
        }).then({
            success: this._createTreeGrid,
            scope: this
        });
    },
    _createTreeGrid: function(store){

        if (this.down('rallygridboard')){
            this.down('rallygridboard').destroy();
        }

        var portfolioItemParentModel = this.portfolioItemTypes[1].typePath.toLowerCase(),
            parentFilters = this._getParentFilters();

        this.add({
            xtype: 'rallygridboard',
            context: this.getContext(),
            modelNames: [this._getTreeModels()[0]],
            toggleState: 'grid',
            gridConfig: {
                store: store,
                storeConfig: {
                    pageSize: 200
                },
                columnCfgs: [
                    'Name',
                    'Project'
                ],
                bulkEditConfig: {
                    items: [{
                        xtype: 'rallyrecordmenuitembulkdeepcopy' ,
                        portfolioItemType: portfolioItemParentModel,
                        portfolioItemTypes: _.map(this.portfolioItemTypes, function(p){ return p.typePath; }),
                        typesToCopy: [this.portfolioItemTypes[0].typePath, 'hierarchicalrequirement','task'],
                        parentFilters: parentFilters,
                        level1TemplateField: this.getSetting('level1TemplateField') || null,
                        level2TemplateField: this.getSetting('level2TemplateField') || null,
                        level3TemplateField: this.getSetting('level3TemplateField') || null
                    }]
                }
            },
            plugins: this._getPlugins(),
            height: this.getHeight()
        });
    },
    _getPlugins: function(){
        var plugins = [];

        var parentPortfolioItem = this.getCatalogPortfolioItem(),
            regex = new RegExp("^/(portfolioitem/.+)/","i"),
            parentType = parentPortfolioItem.match(regex)[1],
            types = _.map(this.portfolioItemTypes, function(p){return p.typePath.toLowerCase(); });

        this.logger.log('_getPlugins', parentType, types);
        var idx = _.indexOf(types, parentType);

        if (idx > 2) {
            var property = _.range(idx - 2).map(function (p) {
                return "Parent";
            }).join(".");
            this.logger.log('property', types, property, types[idx - 1]);
            var filters = [{
                property: property,
                value: parentPortfolioItem
            }, {
                property: 'DirectChildrenCount',
                operator: '>',
                value: 0
            }];

            plugins.push({
                ptype: 'tscatalogpickerplugin',
                fieldLabel: this.portfolioItemTypes[2].name,
                storeConfig: {
                    model: types[2],
                    filters: filters
                },
                types: [this.portfolioItemTypes[1].typePath]
            });
        }
        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: this._getTreeModels(),
            stateful: true,
            stateId: this.getContext().getScopedStateId('catalog-columns')
        });
        return plugins;
    },
    getSettingsFields: function(){

        var model = this.portfolioItemTypes && this.portfolioItemTypes[0].typePath,
            fields = [],
            width = 500,
            labelWidth = 150;

        if (model){
            fields = [{
                xtype: 'rallyfieldcombobox',
                name: 'level3TemplateField',
                fieldLabel: 'FCID01 Capability Field',
                model: model,
                width: width,
                labelWidth: labelWidth
            }, {
                xtype: 'rallyfieldcombobox',
                name: 'level2TemplateField',
                fieldLabel: 'FCID02 Feature Field',
                model: model,
                width: width,
                labelWidth: labelWidth
            }, {
                xtype: 'rallyfieldcombobox',
                name: 'level1TemplateField',
                fieldLabel: 'FCID03 Sub-Feature Field',
                model: model,
                width: width,
                labelWidth: labelWidth
            }];
        }
         fields.push({
                    xtype: 'chartportfolioitempicker',
                    name: 'catalogPortfolioItem',
                    fieldLabel: '',
                    margin: '25 0 0 0'
                });

        return fields;
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
