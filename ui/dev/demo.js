var ko = require('knockout');
var TreeNode = require('../components/tree/tree-viewmodel').TreeNode;

TreeNode.prototype.getDoc = function () {
    var doc = ko.observable().extend({ codeEditorDoc: true });
    setTimeout(function () {
        doc(this.name);
        doc.notifySubscribers(doc(), 'ready');
    }.bind(this), 1000);
    return doc;
};

TreeNode.prototype.nodeLimit = 5;

TreeNode.prototype.loadChildren = function (options) {
    if (this.path.childrenLoadError) {
        setTimeout(
            options.error.bind(this, this.path.childrenLoadError),
            100
        );
    } else {
        setTimeout(
            options.success.bind(
                this,
                this.path.children || []
            ),
            500
        );
    }
};

module.exports = {
    myQueriesStorage: window.sessionStorage,
    databases: [
        database('postgres', [
            schema('information_schema'),
            schema('pg_catalog'),
            schema('public'),
        ]),

        database('database', [
            schema('information_schema'),
            schema('pg_catalog'),
            schema('public'),
            schema('schema1'),
            schema('schema2'),
            schema('schema3'),
            schema('schema4'),
            schema('schema5'),
            schema('schema6'),
            schema('schema7'),
            schema('schema8'),
            schema('schema9'),
            schema('schema10'),
        ]),

        {
            name: 'unexisting',
            typ: 'database',
            can_have_children: true,
            path: { childrenLoadError: 'Database not found.' }
        },

        {
            name: 'nonetwork',
            typ: 'database',
            can_have_children: true,
            path: { childrenLoadError: 'Network error occured.' }
        },

        schema('schema', [
        ]),

        extension('extension', [
            table('table', [
                pkcolumn('id : int'),
                column('message : text'),
                fkcolumn('foreign_id: int'),
            ]),

            func('function'),
            agg('aggregate'),
        ]),

        table('table', [
            pkcolumn('id : int'),
            column('message : text'),
            fkcolumn('foreign_id: int'),
        ]),

        view('view'),
        matview('materialized view'),
        foreigntable('foreign table'),

        pkcolumn('primary key column'),
        fkcolumn('foreign key column'),
        column('regular column : type'),

        index('index'),
        trigger('trigger'),
        foreignkey('foreignkey'),
        check('check constraint'),
        unique('unique constraint'),

        func('function'),
        agg('aggregate'),


    ],
    initialCode: 'demo'
};

// window.addEventListener('click', function (e) {
//     if (e.target.classList.contains('codeform__exec-table')) {
//         e.target.form.action = 'output/table/table-demo.html';
//     }

//     if (e.target.classList.contains('codeform__exec-map')) {
//         e.target.form.action = 'output/map/map-demo.html';
//     }
// }, true);

function database(name, children) {
    return {
        name: name,
        typ: 'database',
        can_have_children: true,
        path: { children: children }
    };
}

function schema(name, children) {
    return {
        name: name,
        typ: 'schema',
        can_have_children: true,
        path: { children: children }
    };
}

function extension(name, children) {
    return {
        name: name,
        typ: 'extension',
        can_have_children: true,
        path: { children: children }
    };
}

function table(name, children) {
    return {
        name: name,
        typ: 'table',
        can_have_children: true,
        path: { children: children }
    };
}

function view(name, children) {
    return {
        name: name,
        typ: 'view',
        can_have_children: true,
        path: { children: children }
    };
}

function matview(name, children) {
    return {
        name: name,
        typ: 'matview',
        can_have_children: true,
        path: { children: children }
    };
}

function foreigntable(name, children) {
    return {
        name: name,
        typ: 'foreigntable',
        can_have_children: true,
        path: { children: children }
    };
}

function pkcolumn(name, children) {
    return {
        name: name,
        typ: 'pkcolumn',
        can_have_children: false,
        path: { children: children }
    };
}

function fkcolumn(name, children) {
    return {
        name: name,
        typ: 'fkcolumn',
        can_have_children: false,
        path: { children: children }
    };
}

function column(name, children) {
    return {
        name: name,
        typ: 'column',
        can_have_children: false,
        path: { children: children }
    };
}

function index(name, children) {
    return {
        name: name,
        typ: 'index',
        can_have_children: false,
        path: { children: children }
    };
}

function trigger(name, children) {
    return {
        name: name,
        typ: 'trigger',
        can_have_children: false,
        path: { children: children }
    };
}

function foreignkey(name, children) {
    return {
        name: name,
        typ: 'foreignkey',
        can_have_children: false,
        path: { children: children }
    };
}

function check(name, children) {
    return {
        name: name,
        typ: 'check',
        can_have_children: false,
        path: { children: children }
    };
}

function unique(name, children) {
    return {
        name: name,
        typ: 'unique',
        can_have_children: false,
        path: { children: children }
    };
}

function func(name, children) {
    return {
        name: name,
        typ: 'func',
        can_have_children: false,
        path: { children: children }
    };
}

function agg(name, children) {
    return {
        name: name,
        typ: 'agg',
        can_have_children: false,
        path: { children: children }
    };
}
