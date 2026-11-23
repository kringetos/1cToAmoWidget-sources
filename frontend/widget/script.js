define(['./app.js?v=' + Math.random()], function () {
    var Widget = function () {
        var self = this;
        self.system = this.system();
        self.langs = this.langs;

        var getCore = function () {
            if (window.AmoWidgetReact && window.AmoWidgetReact.default) {
                return window.AmoWidgetReact.default;
            } else if (window.AmoWidgetReact) {
                return window.AmoWidgetReact;
            }
            return null;
        };

        this.callbacks = {
            render: function () {
                var core = getCore();
                if (core && core.render) core.render(self);
                return true;
            },
            init: function () {
                var core = getCore();
                if (core && core.init) core.init(self);
                return true;
            },
            bind_actions: function () {
                var core = getCore();
                if (core && core.bind_actions) core.bind_actions(self);
                return true;
            },
            settings: function () {
                var core = getCore();
                if (core && core.settings) core.settings(self);
                return true;
            },
            onSave: function () {
                var core = getCore();
                if (core && core.onSave) core.onSave(self);
                return true;
            },
            destroy: function () {
                var core = getCore();
                if (core && core.destroy) core.destroy(self);
                return true;
            }
        };

        return this;
    };

    return Widget;
});