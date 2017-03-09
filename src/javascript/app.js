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
        {xtype:'container',itemId:'display_box'}
    ],
    
    launch: function() {        
        Rally.technicalservices.Toolbox.fetchPortfolioItemTypes().then({
            success: function(portfolioItemTypes){

                this.portfolioItemTypes = portfolioItemTypes;
                Rally.data.ModelFactory.getModel({
                    type: portfolioItemTypes[1].typePath,
                    //type: portfolioItemTypes[0].typePath,
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
        var value = this.getSetting('portfolioItemPicker');
        if ( Ext.isEmpty(value) ) {
            return null;
        }
        
        if (/}/.test(value) ) {
            value = Ext.JSON.decode(value);
        }
        
        return value;
    },

    getCatalogPortfolioItemRef: function(){
        var value = this.getCatalogPortfolioItem();
        if ( Ext.isEmpty(value) ) {
            return null;
        }
        
        if ( Ext.isObject(value) ) {
            return value._ref;
        }
        return value;
    },

    updateDisplay: function(){
        this.down('#display_box').removeAll();
        if (this.getCatalogPortfolioItemRef()){
            this._buildTreeStore();
        } else {
            this.down('#display_box').add({
                xtype: 'container',
                html: 'Please configure a Catalog Portfolio Item parent through the app settings.'
            });
        }
    },
    _getTreeModels: function(){
        if('Feature' == this.getSetting('piLevelType')){
            return [this.portfolioItemTypes[1].typePath.toLowerCase(),this.portfolioItemTypes[0].typePath.toLowerCase(),'hierarchicalrequirement'];
        }else{
            return [this.portfolioItemTypes[3].typePath.toLowerCase(),this.portfolioItemTypes[2].typePath.toLowerCase(),this.portfolioItemTypes[1].typePath.toLowerCase(),this.portfolioItemTypes[0].typePath.toLowerCase(),'hierarchicalrequirement'];
        }
    },
    _getParentFilters: function(){
        var parentPortfolioItem = this.getCatalogPortfolioItemRef(),
            regex = new RegExp("^/(portfolioitem/.+)/","i"),
            parentType = parentPortfolioItem.match(regex)[1],
            types = _.map(this.portfolioItemTypes, function(p){return p.typePath.toLowerCase(); });

        
        this.logger.log('_getParentFilters', parentType, types);
        var idx = _.indexOf(types, parentType);

        var idxRange = 'Feature' == this.getSetting('piLevelType') ? idx-1:idx-3;


        // var parentFiltersProperty = _.range(idx-1).map(function(p){return "Parent";}).join("."),
        var parentFiltersProperty = _.range(idxRange).map(function(p){return "Parent";}).join("."),
            parentFilters = [{
                property: parentFiltersProperty,
                operator: "!=",
                value: parentPortfolioItem
            }];
        
        var descendent_level_count = parentFiltersProperty.split('\.').length;
        var root_index = idx - descendent_level_count;
        if ( root_index < 0 ) { root_index = 0; }
        
        this.rootType = this.portfolioItemTypes[root_index];
        
        this.logger.log('parentFilters:', parentFilters);
        return parentFilters;
    },
    _buildTreeStore: function(){
        this.logger.log('_buildTreeStore', this._getTreeModels());

        var models= [this._getTreeModels()[0]];
        
        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: models,
            enableHierarchy: true,
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
        
        var typesToCopy = [],
            portfolioItemParentModel;

        if('Feature' == this.getSetting('piLevelType')){
            portfolioItemParentModel = this.portfolioItemTypes[1].typePath.toLowerCase();
            typesToCopy = [this.portfolioItemTypes[0].typePath, 'hierarchicalrequirement','task'];
        }else{
            portfolioItemParentModel = this.portfolioItemTypes[3].typePath.toLowerCase();
            typesToCopy = [this.portfolioItemTypes[2].typePath,this.portfolioItemTypes[1].typePath,this.portfolioItemTypes[0].typePath, 'hierarchicalrequirement','task'];           
        }

        var parentFilters = this._getParentFilters();


        this.add({
            xtype: 'rallygridboard',
            context: this.getContext(),
            modelNames: [this._getTreeModels()[0]],
            parentTypes: [this._getTreeModels()[0]],            
            // modelNames: [this._getTreeModels()[2]],
            // parentTypes: [this._getTreeModels()[2]],
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
                        typesToCopy: typesToCopy,
                        parentFilters: parentFilters,
                        level1TemplateField: this.getSetting('level1TemplateField') || null
                       // level2TemplateField: this.getSetting('level2TemplateField') || null,
                        // level3TemplateField: this.getSetting('level3TemplateField') || null
                    }]
                }
            },
            plugins: this._getPlugins(),
            height: this.getHeight()
        });
    },
    _getPlugins: function(){
        var plugins = [];

        var parentPortfolioItem = this.getCatalogPortfolioItemRef(),
            regex = new RegExp("^/(portfolioitem/.+)/","i"),
            parentType = parentPortfolioItem.match(regex)[1],
            types = _.map(this.portfolioItemTypes, function(p){return p.typePath.toLowerCase(); });

        this.logger.log('_getPlugins', parentType, types);
        var idx = _.indexOf(types, parentType);
        
        var level = 'Feature' == this.getSetting('piLevelType') ? 2:4;

        var filters = [{
            property: 'DirectChildrenCount',
            operator: '>',
            value: 0
        }];


        // if (idx > 2) {
        if (idx > level) {
            // var property = _.range(idx - 2).map(function (p) {
            var property = _.range(idx - level).map(function (p) {
                return "Parent";
            }).join(".");
            this.logger.log('property', types, property, types[idx - 1]);

            if('Feature' == this.getSetting('piLevelType')){
                filters.push({
                    property: property,
                    value: parentPortfolioItem
                });
            }

        }

        plugins.push({
            ptype: 'tscatalogpickerplugin',
            // fieldLabel: this.portfolioItemTypes[2].name,
            fieldLabel: this.portfolioItemTypes[level].name,
            storeConfig: {
                // model: types[2],
                model: types[level],
                filters: filters
            },
            // types: [this.portfolioItemTypes[1].typePath]
            types: [this.portfolioItemTypes[level-1].typePath]
        });

        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: this._getTreeModels(),
            stateful: true,
            stateId: this.getContext().getScopedStateId('catalog-columns')
        });
        
        // var lowest_level_pi_type_name = this.portfolioItemTypes[0].typePath;
        var lowest_level_pi_type_name = this.portfolioItemTypes[level-2].typePath;
        
        plugins.push({
            ptype: 'rallygridboardcustomfiltercontrol',
            headerPosition: 'left',
            filterControlConfig: {
                modelNames: [lowest_level_pi_type_name],
                stateful: false,
                stateId: this.getContext().getScopedStateId('catalog-grid-filter')
            }
        });
        return plugins;
    },
    
    getSettingsFields: function(){
        var level = 'Feature' == this.getSetting('piLevelType') ? 2:4;
        //var model = this.portfolioItemTypes && this.portfolioItemTypes[0].typePath,
        var model = this.portfolioItemTypes && this.portfolioItemTypes[level-2].typePath,
            fields = [],
            width = 500,
            labelWidth = 150;

        var piLevelType = this.getPILevelType();
        if (model){
            fields = [
            //{
            //    xtype: 'rallyfieldcombobox',
            //    name: 'level3TemplateField',
            //    fieldLabel: 'FCID01 Capability Field',
            //    model: model,
            //    width: width,
            //    labelWidth: labelWidth
            //}, {
            //    xtype: 'rallyfieldcombobox',
            //    name: 'level2TemplateField',
            //    fieldLabel: 'FCID02 Feature Field',
            //    model: model,
            //    width: width,
            //    labelWidth: labelWidth
            //},

            {
                xtype: 'rallyfieldcombobox',
                name: 'level1TemplateField',
                fieldLabel: 'FCID03 Sub-Feature Field',
                model: model,
                width: width,
                _isNotHidden: function(field) {
                    if (field.hidden || field.readOnly || field.constrained){
                        return false;
                    }
                    if (field.attributeDefinition && ((field.attributeDefinition.AttributeType === 'STRING') ||
                        (field.attributeDefinition.AttributeType === 'TEXT'))){
                        return true;
                    }
                    return false;
                },
                labelWidth: labelWidth
            },
            {
                xtype      : 'fieldcontainer',
                fieldLabel : 'PI Level to Copy',
                defaultType: 'radiofield',
                stateful: true,
                stateId:'radiofield_xx',
                width: 300,
                defaults: {
                    flex: 1
                },
                layout: 'hbox',                   
                items: [
                    {
                        boxLabel  : 'Program',
                        name      : 'piLevelType',
                        inputValue: 'Program',
                        id        : 'radio1',
                        checked: piLevelType === 'Program',
                        bubbleEvents: ['radioFieldChange']
                    }, {
                        boxLabel  : 'Feature',
                        name      : 'piLevelType',
                        inputValue: 'Feature',
                        id        : 'radio2',
                        checked: piLevelType === 'Feature',
                        bubbleEvents: ['radioFieldChange'],
                        listeners: {
                            ready: function(rb) {
                                //console.log('radioFieldChange Fired!');
                                this.fireEvent('radioFieldChange',rb);
                            },
                            change: function(rb) {
                                //console.log('radioFieldChange Fired!');
                                this.fireEvent('radioFieldChange',rb);
                            }
                        }
                    }
                ]
            }
            ];
        }
        
        fields.push({
            xtype: 'chartportfolioitempicker',
            name: 'catalogPortfolioItem',
            fieldLabel: '',
            margin: '25 0 0 0',
            hidden: piLevelType === 'Program',
            portfolioItem: this.getCatalogPortfolioItem(),
            handlesEvents: {
                radioFieldChange: function(chk){
                    console.log('radioFieldChange',chk);
                    if(chk.getValue()){
                        this.show();
                    }else{
                        this.hide();
                    }
                }
            },
        });

        return fields;
    },


    getPILevelType : function(){
        return this.getSetting('piLevelType');
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
