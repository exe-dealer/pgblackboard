var fs = require('fs'),
    autoprefixer = require('autoprefixer-core'),
    csso = require('csso'),
    uglifyJs = require('uglify-js'),
    bundleIndex = require('./bundle-index');

task('default', ['dist/index.html', 'dist/bundle-index.js'], function () {

});

file('dist/index.html', ['loader/loader.min.css'], function () {
    // var loaderCss = processCss(
    //      fs.readFileSync(this.source).toString());

    var indexHtml = fs.readFileSync('index.html').toString();
    indexHtml = indexHtml.replace(
        '<link href="loader/loader.css" rel="stylesheet" />',
        '<style>' + fs.readFileSync('loader/loader.min.css') + '</style>');

    fs.writeFileSync(this.name, indexHtml);
});


file('dist/bundle-index.js', ['bundle-index.js'].concat(bundleIndex.jsLib), function () {
    var js = bundleIndex.jsLib
        .map(function (filename) { return fs.readFileSync(filename).toString(); })
        .join('');

    fs.writeFileSync(this.name, js);
});

rule('.min.css', '.css', function () {
    var css;
    css = fs.readFileSync(this.source).toString();
    css = autoprefixer.process(css).css;
    css = csso.justDoIt(css);
    fs.writeFileSync(this.name, css);
});

rule('.min.js', '.js', function () {
    var minifiedJs = uglifyJs.minify(this.source)
    fs.writeFileSync(this.name, minifiedJs);
});


function processCss(css) {
    css = autoprefixer.process(css).css;
    css = csso.justDoIt(css);
    return css;
}
