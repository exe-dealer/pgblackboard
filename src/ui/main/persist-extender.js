var ko = require('knockout');

module.exports = function (target, key) {
    var storage = window.localStorage;
    target(ko.utils.parseJson(storage.getItem(key)));
    target.subscribe(function (newValue) {
        if (newValue === undefined || newValue === null) {
            storage.removeItem(key);
        } else {
            storage.setItem(key, ko.toJSON(target));
        }
    });

    ko.utils.registerEventHandler(window, 'storage', function (e) {
        if (e.storageArea === storage && e.key === key) {
            target(ko.utils.parseJson(e.newValue));
        }
    });
};