/**
 * Created by kcorkan on 1/6/16.
 */
Ext.override(Ext.grid.feature.Grouping, {

    onReconfigure: function(grid, store, columns, oldStore, oldColumns) {
        var me = grid;
        if (store && store !== oldStore) {
            // Grouping involves injecting a dataSource in early
            if (oldStore && store.buffered !== oldStore.buffered) {
                Ext.Error.raise('Cannot reconfigure grouping switching between buffered and non-buffered stores');
            }
            if (store.buffered) {
                me.bindStore(store);
                me.dataSource.processStore(store);
            }
        }
    }

});