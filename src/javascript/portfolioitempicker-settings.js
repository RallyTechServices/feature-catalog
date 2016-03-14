(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.PortfolioItemPicker", {
        extend: "Ext.form.FieldContainer",
        alias: "widget.chartportfolioitempicker",

        settingsParent: undefined,
        requestContext: undefined,
        height: 345,
        mixins: [
            'Ext.form.field.Field'
        ],

        emptyText: '<p>No portfolio items match your search criteria.</p>',

        items: [
            {
                xtype: "label",
                text: "Catalog Portfolio Item",
                cls: "settingsLabel"
            },
            {
                xtype: "container",
                name: "portfolioItemPicker",
                layout: {
                    type: "hbox"
                },
                items: [
                    {

                        xtype: 'rallybutton',
                        text: 'Choose',
                        itemId: 'portfolioItemButton',
                        cls: 'piButton primary small'
                    },
                    {
                        xtype: 'container',
                        cls: 'piDisplayField',
                        items: [
                            {
                                xtype: 'displayfield',
                                itemId: 'portfolioItemDisplay',
                                value: "&nbsp;"
                            }
                        ]
                    }

                ]
            }
        ],

        initComponent: function () {
            this.callParent(arguments);
            this._addTestClass();
        },

        _addTestClass: function () {
            this.addCls(Rally.util.Test.toBrowserTestCssClass('buttonChooser'));
        },

        beforeRender: function () {
            this._configureButton();
            this._configurePicker();
        },

        _configureButton: function () {
            this.down('#portfolioItemButton').on('click', this._onButtonClick, this);
        },

        _configurePicker: function () {
            this._setValueFromSettings();
            this._setupRequestContext();
            this._loadPortfolioItem();
            this._configureChooser();
        },

        _setupRequestContext: function () {
            //this.requestContext = {
            //    workspace: this.settingsParent.app.context.getWorkspaceRef(),
            //    project: null
            //};
        },
        sendSettingsChange: function(artifact) {
            if (this.settingsParent) {
                this.settingsParent.sendSettingsChange(artifact, this);
            }
        },
        _setValueFromSettings: function () {
            this._setDisplayValue();
            //var newSettingsValue = this.settingsParent.app.getSetting("portfolioItemPicker"),
            //    oldSettingsValue = this.settingsParent.app.getSetting("buttonchooser");
            //
            //if (this._isSettingValid(newSettingsValue)) {
            //    this.setValue(newSettingsValue);
            //} else if (this._isSettingValid(oldSettingsValue)) {
            //    this.setValue(Ext.JSON.decode(oldSettingsValue).artifact._ref);
            //} else {
            //    this.setValue("&nbsp;");
            //}
        },

        _isSettingValid: function (value) {
            return value && value !== "undefined";
        },

        _loadPortfolioItem: function () {
            if (this._isSavedValueValid()) {
                this._createPortfolioItemStore();
            }
        },

        _createPortfolioItemStore: function () {
            Ext.create("Rally.data.wsapi.Store", {
                model: Ext.identityFn("Portfolio Item"),
                filters: [
                    {
                        property: "ObjectID",
                        operator: "=",
                        value: Rally.util.Ref.getOidFromRef(this.value)
                    }
                ],
                context: this.requestContext,
                autoLoad: true,
                listeners: {
                    load: this._onPortfolioItemRetrieved,
                    scope: this
                }
            });
        },

        _isSavedValueValid: function () {
            return typeof this.value === "string" && this.value !== "undefined";
        },

        _onPortfolioItemRetrieved: function (store) {
            var storeData = store.getAt(0);
            this._handleStoreResults(storeData);
        },

        _setDisplayValue: function () {
            this.down("#portfolioItemDisplay").setValue(this._getPortfolioItemDisplay());
        },

        _onButtonClick: function () {
            this._destroyChooser();

            this.dialog = Ext.create("Rally.ui.dialog.ChooserDialog", this.chooserConfig);
            this.dialog.show();
        },

        _destroyChooser: function () {
            if (this.dialog) {
                this.dialog.destroy();
            }
        },

        _getPortfolioItemDisplay: function () {
            if ( Ext.isEmpty(this.portfolioItem) || !Ext.isObject(this.portfolioItem) ) {
                return '';
            }
            return this.portfolioItem.FormattedID + ': ' + this.portfolioItem.Name;
        },

        _onPortfolioItemChosen: function (resultStore) {
            this._handleStoreResults(resultStore);
            this._destroyChooser();
        },

        _handleStoreResults: function(store) {
            if (store && store.data) {
                this.portfolioItem = store.data;
                this._setDisplayValue();
                this.setValue(this.portfolioItem._ref);
                this.sendSettingsChange(this.portfolioItem);
            }
        },

        _configureChooser: function () {
            this.chooserConfig = {
                artifactTypes: ['portfolioitem'],
                title: 'Choose a Portfolio Item',
                closeAction: 'destroy',
                selectionButtonText: 'Select',
                listeners: {
                    artifactChosen: this._onPortfolioItemChosen,
                    scope: this
                },
                storeConfig: {
                    project: null,
                    context: this.requestContext,
                    fetch: ['ObjectID','Project','WorkSpace','FormattedID','Name','ActualStartDate','PlannedStartDate','ActualEndDate','PlannedEndDate']
                },
                gridConfig: {
                    viewConfig: {
                        emptyText: Rally.ui.EmptyTextFactory.getEmptyTextFor(this.emptyText)
                    }
                }
            };
        },

        setValue: function (value) {
            console.log('set value', value);
            
            if ( Ext.isEmpty(value) ) {
                value = this.settingsParent.app.getSetting("portfolioItemPicker");
            }
            
            if ( /{/.test(value) ) {
                value = Ext.JSON.decode(value);
            }
            
            if ( Ext.isObject(value) ) {
                this.value = value._ref;
                this.portfolioItem = value;
                this._setDisplayValue();
            }
            
            this.value = value;
        },

        getSubmitData: function () {
            var returnObject = {};

            if (this.portfolioItem) {
                this.setValue(this.portfolioItem._ref);
                returnObject.portfolioItemPicker = Ext.JSON.encode({
                    '_ref': this.portfolioItem._ref,
                    'FormattedID': this.portfolioItem.FormattedID,
                    'Name': this.portfolioItem.Name
                });
            }
            else {
                returnObject.portfolioItemPicker = "";
            }

            return returnObject;
        }
    });
}());