var closureCompiler = require('closurecompiler');
var autoprefixer    = require('autoprefixer-core');
var csso            = require('csso');
var fs              = require('fs');
var path            = require('path');
var zlib            = require('zlib');
var crypto          = require('crypto');


function getJsSources(moduleName, jsSources) {
    jsSources = jsSources || {};
    jsSources[moduleName] = true;
    var baseDir = path.dirname(moduleName);
    var pat = /require\('([^']+)'\)/g;
    var moduleContent = fs.readFileSync(path.join(moduleName));
    var match;
    while (match = pat.exec(moduleContent)) {
        var requiredModuleName = match[1];
        if (!path.extname(requiredModuleName)) {
            requiredModuleName += '.js';
        }
        if (requiredModuleName.slice(0, 2) === './' ||
            requiredModuleName.slice(0, 3) === '../')
        {
            requiredModuleName = path.join(baseDir, requiredModuleName);
            getJsSources(requiredModuleName, jsSources)
        } else {
            jsSources[path.join('lib', requiredModuleName)] = true;
        }
    }
    return Object.keys(jsSources);
}

var jsSources = getJsSources('app.js');

var libs = {};
jsSources.forEach(function (jsFilename) {
    var js = fs.readFileSync(jsFilename).toString();
    var resources = js.split('\n')
        .filter(function (line) { return line.slice(0, 3) === '///'; })
        .map(function (line) { return line.slice(3).trim(); });

    resources.filter(RegExp.prototype.test.bind(/\.js$/))
        .forEach(function (libFileName) { libs[libFileName] = true; });
});

libs = Object.keys(libs);


var jsExterns = [
    'lib/knockout.extern.js',
    'lib/codemirror.extern.js',
    'lib/leaflet.extern.js'
];

var cssFiles = [
    'node_modules/codemirror/lib/codemirror.css',
    'main/main.css',
    'nav/nav.css',
    'tree/tree.css',
    'myqueries/myqueries.css',
    'splitpanel/splitpanel.css',
    'codeform/codeform.css',
    'codeform/codemirror/codeeditor.css',
];

var outdir = process.env.OUT_DIR || 'dist';
var cachedir = path.join(outdir, 'cache');

jake.mkdirP(cachedir);

task('default', [
    path.join(outdir, 'index.html'),
    path.join(outdir, 'bundle-index.js.gz'),
    path.join(outdir, 'bundle-index.js.md5'),
    path.join(outdir, 'bundle-map.js.gz'),
    path.join(outdir, 'bundle-map.js.md5'),
    path.join(outdir, 'favicon.ico'),
    path.join(outdir, 'favicon.ico.md5'),
    path.join(outdir, 'err.html')
]);

task('clean', function () {
    jake.rmRf(outdir);
});

file(path.join(outdir, 'favicon.ico'), ['favicon.ico'], function () {
    jake.cpR('favicon.ico', this.name);
});

var indexPrereqs = [
    'index.html',
     path.join(cachedir, 'loading-indicator.css')
];

file(path.join(outdir, 'index.html'), indexPrereqs, function () {
    var indexHtml = fs.readFileSync('index.html').toString();

    // embedding loading indicator styles
    indexHtml = indexHtml.replace(
        '<link href="loading-indicator/loading-indicator.css" rel="stylesheet" />',
        embeddedStyle(fs.readFileSync(path.join(cachedir, 'loading-indicator.css')))
    );

    fs.writeFileSync(this.name, indexHtml);
});

file(path.join(cachedir, 'app.css'),
    cssFiles,
    processCssTarget);

file(path.join(outdir, 'err.html'),
    ['err/err.html',
     path.join(cachedir, 'err.css')],
    function () {

    var errHtml = readTextFromFile('err/err.html');
    errHtml = errHtml.replace(
        '<link rel="stylesheet" href="err.css" />',
        embeddedStyle(
            readTextFromFile(path.join(cachedir, 'err.css'))
                .replace(/\{/g, '{{')
                .replace(/\}/g, '}}')
        )
    );
    fs.writeFileSync(this.name, errHtml);
});

file(path.join(cachedir, 'err.css'),
    ['err/err.css'],
    processCssTarget);

var appjsPrereqs = jsSources.concat(jsExterns);
file(path.join(cachedir, 'app.js'), appjsPrereqs, { async: true }, function () {
    jake.logger.log("Compiling JavaScript ...");
    var targetFileName = this.name;
    closureCompiler.compile(jsSources, {
        compilation_level: 'ADVANCED_OPTIMIZATIONS',
        warning_level: 'VERBOSE',
        formatting: 'PRETTY_PRINT',
        language_in: 'ECMASCRIPT6_STRICT',
        language_out: 'ECMASCRIPT5_STRICT',
        process_common_js_modules: true,
        common_js_entry_module: 'app.js',
        common_js_module_path_prefix: 'lib/',
        output_wrapper: '(function(){%output%})();',
        export_local_property_definitions: true,
        generate_exports: true,

        // If you specify a directory here, all files inside are used
        externs: jsExterns,
    },
    function (errorsAndWarnings, result) {
        if (result) {
            fs.writeFileSync(targetFileName, result);
            jake.logger.log(errorsAndWarnings);
            complete();
        } else {
            jake.logger.error(errorsAndWarnings);
            fail('Failed to compile JavaScript.');
        }
    });
});

var mapjsPrereqs = [
    'output/map/map.js',
    'lib/leaflet.extern.js'
];

file(path.join(cachedir, 'map.js'), mapjsPrereqs, { async: true }, function () {
    var targetFileName = this.name;
    closureCompiler.compile(['output/map/map.js'], {
        compilation_level: 'ADVANCED_OPTIMIZATIONS',
        warning_level: 'VERBOSE',
        formatting: 'PRETTY_PRINT',
        language_in: 'ECMASCRIPT6_STRICT',
        language_out: 'ECMASCRIPT5_STRICT',
        // process_common_js_modules: true,
        // common_js_entry_module: 'app.js',
        // common_js_module_path_prefix: 'lib/',
        output_wrapper: '(function(){%output%})();',

        // If you specify a directory here, all files inside are used
        externs: ['lib/leaflet.extern.js'],
    },
    function (errorsAndWarnings, result) {
        if (result) {
            fs.writeFileSync(targetFileName, result);
            jake.logger.log(errorsAndWarnings);
            complete();
        } else {
            jake.logger.error(errorsAndWarnings);
            fail('Failed to compile map.js');
        }
    });
});

rule('.gz', '', { async: true }, function () {
    fs.createReadStream(this.source)
        .pipe(zlib.createGzip())
        .pipe(fs.createWriteStream(this.name))
        .on('finish', function () { complete(); });
});

rule('.md5', '', function () {
    var content = fs.readFileSync(this.source);
    var hash = crypto.createHash('md5').update(content).digest('hex');
    fs.writeFileSync(this.name, hash);
});

var indexBundlePrereqs = [
    path.join(cachedir, 'app.js'),
    path.join(cachedir, 'app.css'),
    path.join(cachedir, 'table.css')]
    .concat(libs);

file(path.join(outdir, 'bundle-index.js'), indexBundlePrereqs, function () {
    var bundleOutput = '';
    bundleOutput += documentWrite(embeddedStyle(
        fs.readFileSync(path.join(cachedir, 'app.css'))
          .toString()));
    bundleOutput += libs.map(readTextFromFile).join('\n');
    bundleOutput += '\n';

    bundleOutput += 'window.pgBlackboard=' + JSON.stringify({
        tableCss: readTextFromFile(path.join(cachedir, 'table.css'))
    }) + ';';

    bundleOutput += readTextFromFile(path.join(cachedir, 'app.js'));
    fs.writeFileSync(this.name, bundleOutput);
});

file(path.join(cachedir, 'table.css'),
    ['output/queryplan/queryplan.css',
     'output/table/table.css'],
    processCssTarget);

file(path.join(cachedir, 'loading-indicator.css'),
    ['loading-indicator/loading-indicator.css'],
    processCssTarget);

file(path.join(outdir, 'bundle-map.js'),
    ['node_modules/leaflet/dist/leaflet.js',
     path.join(cachedir, 'map.js'),
     path.join(cachedir, 'map.css')],
    function () {

    var bundle = '';

    bundle += documentWrite(embeddedStyle(
        readTextFromFile(path.join(cachedir, 'map.css'))
    ));

    bundle += readTextFromFile('node_modules/leaflet/dist/leaflet.js');
    bundle += readTextFromFile(path.join(cachedir, 'map.js'));

    fs.writeFileSync(this.name, bundle);
});

file(path.join(cachedir, 'map.css'),
    ['node_modules/leaflet/dist/leaflet.css',
     'output/map/map.css'],
     processCssTarget);

rule('.min.css', '.css', function () {
    var css = fs.readFileSync(this.source).toString();
    css = autoprefixer.process(css).css;
    css = csso.justDoIt(css);
    fs.writeFileSync(this.name, css);
});

rule('.min.js', '.js', { async: true }, function () {
    var targetFileName = this.name;
    closureCompiler.compile([this.source], {
        compilation_level: 'SIMPLE_OPTIMIZATIONS',
        jscomp_off: 'checkVars'
    },
    function (errorsAndWarnings, result) {
        if (result) {
            fs.writeFileSync(targetFileName, result);
            jake.logger.log(errorsAndWarnings);
            complete();
        } else {
            jake.logger.error(errorsAndWarnings);
            fail('Failed to minify js');
        }
    });
});



function processCssTarget() {
    var css = this.prereqs.map(readCssFileAndProcessInlinings).join('');
    css = autoprefixer.process(css).css;
    css = csso.justDoIt(css);
    fs.writeFileSync(this.name, css);

    function readCssFileAndProcessInlinings(cssFileName) {
        var cssSource = readTextFromFile(cssFileName);
        return cssSource.replace(/url\('(\.[^']+)'\)/, function (_, embeddingUrl) {
            embeddingUrl = path.join(path.dirname(cssFileName), embeddingUrl);
            var b64content = fs.readFileSync(embeddingUrl).toString('base64');
            return 'url(data:application/font-woff;base64,' + b64content + ')';
        });
    }

}

function readTextFromFile(fileName) {
    return fs.readFileSync(fileName)
             .toString();
}

function embeddedStyle(css) {
    return '<style>' + css + '</style>';
}

function documentWrite(html) {
    return 'document.write(' +
        JSON.stringify(html) +
        ');\n';
}