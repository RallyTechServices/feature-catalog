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
        {xtype:'container',itemId:'selector_box',layout:{type:'hbox'}},
        {xtype:'container',itemId:'display_box'}
    ],
    
    launch: function() {        
        Rally.technicalservices.Toolbox.fetchPortfolioItemTypes().then({
            success: function(portfolioItemTypes){

                this.portfolioItemTypes = portfolioItemTypes;
                Rally.data.ModelFactory.getModel({
                    type: portfolioItemTypes[1].typePath,
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
        if('UserStory' == this.getSetting('piLevelType')){
            return [this.portfolioItemTypes[0].typePath.toLowerCase(),'hierarchicalrequirement'];
        }else if('Feature' == this.getSetting('piLevelType')){
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

        var idxRange;

        if('UserStory' == this.getSetting('piLevelType')){
            idxRange =  idx;
        }else if('Feature' == this.getSetting('piLevelType')){
            idxRange = idx-1;
        }else{
            idxRange = idx-3;
        }

        var parentFilters = [];
            var parentFiltersProperty = _.range(idxRange).map(function(p){return "Parent";}).join(".");
            parentFilters = [{
                property: parentFiltersProperty,
                operator: "!=",
                value: parentPortfolioItem
            }];

        this.logger.log('parentFilters:', parentFilters);
        return parentFilters;
    },
    _buildTreeStore: function(){
        this.logger.log('_buildTreeStore', this._getTreeModels());

        var models= [this._getTreeModels()[0]];
        
        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: models,
            enableHierarchy: true,
            fetch: ['FormattedID','Name','Project','Parent','Parent','Feature']
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
        if('UserStory' == this.getSetting('piLevelType')){
            portfolioItemParentModel = this.portfolioItemTypes[0].typePath.toLowerCase();//'hierarchicalrequirement';
            typesToCopy = ['hierarchicalrequirement','task'];
        }else if('Feature' == this.getSetting('piLevelType')){
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
        
        var level;

        if('UserStory' == this.getSetting('piLevelType')){
            level = 1;
        }else if('Feature' == this.getSetting('piLevelType')){
            level = 2;
        }else{
            level = 4;           
        }

        var filters = [{
            property: 'DirectChildrenCount',
            operator: '>',
            value: 0
        }];


        if (idx > level) {
            var property = _.range(idx - level).map(function (p) {
                return "Parent";
            }).join(".");
            this.logger.log('property', types, property, types[idx - 1]);

            if('UserStory' == this.getSetting('piLevelType')){
                filters.push({
                    property: 'Parent',
                    value: parentPortfolioItem
                });
            }else if('Feature' == this.getSetting('piLevelType')){
                filters.push({
                    property: property,
                    value: parentPortfolioItem
                });
            }
        }

        console.log('_getPlugins',filters);

        plugins.push({
            ptype: 'tscatalogpickerplugin',
            fieldLabel: this.portfolioItemTypes[level].name,
            storeConfig: {
                model: types[level],
                filters: filters
            },
            types: [this.portfolioItemTypes[level-1].typePath]
        });

        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: this._getTreeModels(),
            stateful: true,
            stateId: this.getContext().getScopedStateId('catalog-columns')
        });
        
        var lowest_level_pi_type_name = this.portfolioItemTypes[level-1].typePath;
        plugins.push({
            ptype: 'rallygridboardinlinefiltercontrol',
            inlineFilterButtonConfig: {
                stateful: true,
                stateId: this.getContext().getScopedStateId('kanban-filter'),
                modelNames: [lowest_level_pi_type_name]
                ,
                //margin: '3 9 3 30',
                inlineFilterPanelConfig: 
                {
                    collapsed: false,
                    quickFilterPanelConfig: {
                        defaultFields: ['Owner']
                    }
                }
            }
        });

        return plugins;
    },
    

    getSettingsFields: function(){
        var model;
        if('UserStory' == this.getSetting('piLevelType')){
            model = 'hierarchicalrequirement';          
        }else if('Feature' == this.getSetting('piLevelType')){
            model = this.portfolioItemTypes && this.portfolioItemTypes[0].typePath;  
        }else{
            model = this.portfolioItemTypes && this.portfolioItemTypes[2].typePath;            
        }

        var fields = [],
            width = 500,
            labelWidth = 150;

        var piLevelType = this.getPILevelType();
        if (model){
            fields = [

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
                    }, {
                        boxLabel  : 'Feature',
                        name      : 'piLevelType',
                        inputValue: 'Feature',
                        id        : 'radio2',
                        checked: piLevelType === 'Feature',
                        bubbleEvents: ['radioFieldChange']
                    }, {
                        boxLabel  : 'User Story',
                        name      : 'piLevelType',
                        inputValue: 'UserStory',
                        id        : 'radio3',
                        checked: piLevelType === 'UserStory',
                        bubbleEvents: ['radioFieldChange']
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
                    if(chk.getValue()){
                        this.hide();
                    }else{
                        this.show();
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
