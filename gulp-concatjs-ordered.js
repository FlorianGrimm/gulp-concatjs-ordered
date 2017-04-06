/* jshint node:true */
'use strict';

var os = require("os");
var path = require("path");
var gutil = require("gulp-util");
var extend = require("lodash.assign");
var through = require("through2");
var combine = require("stream-combiner2");
var gulpif = require("gulp-if");
var ConcatWithSourcemaps = require("concat-with-sourcemaps");
var defaults = {
    sep: os.EOL,    
    process: false,
    passthrough: false,
    passthroughKnown: false,
    passthroughUnknown: false,
    addUnknown: false,
    verbose:false
};
var PluginError = gutil.PluginError;
var gutilFile = gutil.File;
function gulpconcatjsordered(name, sortFileNames, config) {
    var options = extend({}, defaults, config || {});
    var concat, firstFile, fileName;
    var mapNamesToInput = {};
    var inputTuple = (sortFileNames || []).map(function (value, idx) {
        var resolved = path.resolve(value);
        if (options.verbose){            
            console.log("value:"+value+" resolved:"+resolved);
        }
        mapNamesToInput[resolved] = idx;
        return [];
    });
    //
    function parsePath(p) {
        var extname = path.extname(p);
        return {
            dirname: path.dirname(p),
            basename: path.basename(p, extname),
            extname: extname,
            sep: path.sep
        };
    }
    function addFn(file, encoding, next) {
        // Ignore empty files
        if (file.isNull()) {
            next();
            return;
        }
        // Streams not supported
        if (file.isStream()) {
            this.emit('error', new PluginError('gulp-concatjs-ordered', 'Streaming not supported'));
            next();
            return;
        }
        var idx = mapNamesToInput[file.path];

        var tuple;
        if (options.addUnknown){
            if (typeof (idx) === "undefined") {
                tuple = [];
                inputTuple.push(tuple);
                tuple.push(file);
                if (options.passthrough || options.passthroughUnknown){
                    this.push(file);
                    if (options.verbose){            
                        console.log("unknown but concat and passthrough: "+file.path);
                    }
                } else {
                    if (options.verbose){            
                        console.log("unknown but concat: "+file.path);
                    }
                }
            }
            else {
                tuple = inputTuple[idx];
                tuple.push(file);
                
                if (options.passthrough || options.passthroughKnown){
                    this.push(file);
                    if (options.verbose){            
                        console.log("known so concat and passthrough: "+file.path);
                    }
                } else {
                    if (options.verbose){            
                        console.log("known so concat: "+file.path);
                    }
                }
            }
        } else {
            if (typeof (idx) === "undefined") {
                if (options.passthrough || options.passthroughUnknown){
                    if (options.verbose){            
                        console.log("unknown so passthrough: "+file.path);
                    }
                    this.push(file);
                } else {
                    if (options.verbose){            
                        console.log("unknown ignore: "+file.path);
                    }
                }
            }
            else {
                tuple = inputTuple[idx];
                tuple.push(file);
                if (options.passthrough) {
                    this.push(file);
                }
                if (options.passthrough || options.passthroughKnown){
                    if (options.verbose){            
                        console.log("known so concat and passthrough: "+file.path);
                    }
                    this.push(file);
                } else {
                    if (options.verbose){            
                        console.log("known so concat: "+file.path);
                    }
                }
            }
        }
        next();
    }
    function doneFn(next) {
        // Forward support for newLine option from gulp-concat
        if (typeof options.newLine !== 'undefined') {
            options.sep = options.newLine;
        }
        var idx, file;
        for (idx = 0; idx < inputTuple.length; idx++) {
            file = inputTuple[idx][0];
            if (!firstFile) {
                firstFile = file;
                if (!name || typeof name === 'string') {
                    // Default path to first file basename
                    fileName = name || path.basename(file.path);
                }
                else if (typeof name.path === 'string') {
                    // Support path as a function
                    fileName = path.basename(name.path);
                }
                else if (typeof name === 'function') {
                    // Support path as a function
                    var parsedPath = parsePath(file.path);
                    var result = name(parsedPath) || parsedPath;
                    fileName = typeof result === 'string' ? result : result.basename + result.extname;
                }
                else {
                    throw new PluginError('gulp-concatjs-ordered', 'Missing path');
                }
                // Initialize concat
                concat = new ConcatWithSourcemaps(!!file.sourceMap, fileName, options.sep);
            }
            var contents = file.contents;
            // Support process as a function
            if (typeof options.process === 'function') {
                contents = new Buffer(options.process.call(file, contents.toString(), file.path));
                // Support process as an object fed to gutil.template
            }
            else if (typeof options.process === 'object') {
                contents = new Buffer(gutil.template(contents, extend({ file: file }, options.process)));
            }
            concat.add(file.relative, contents.toString(), file.sourceMap);
            // if(options.passthrough) {
            //     /* jshint validthis:true */
            //     this.push(file);
            // }
        }
        if (firstFile) {
            var joinedFile = firstFile.clone({ contents: false });
            joinedFile.path = path.join(options.cwd || firstFile.base, fileName);
            joinedFile.base = options.base || firstFile.base;
            joinedFile.contents = new Buffer(concat.content);
            joinedFile.__concat = true;
            if (concat.sourceMapping) {
                joinedFile.sourceMap = JSON.parse(concat.sourceMap);
            }
            /* jshint validthis:true */
            this.unshift(joinedFile);
        }
        next();
    }
    return through.obj(addFn, doneFn);
}
;
module.exports = gulpconcatjsordered;
function header(header, encoding) {
    return through.obj(function (file, encoding, next) {
        file.contents = Buffer.concat([new Buffer(gutil.template(header, extend({ file: file }, encoding))), file.contents]);
        next(null, file);
    });
}
;
module.exports.header = header;
function footer(footer, encoding) {
    return through.obj(function (file, encoding, next) {
        file.contents = Buffer.concat([file.contents, new Buffer(gutil.template(footer, extend({ file: file }, encoding)))]);
        next(null, file);
    });
}
;
module.exports.footer = footer;
function processJsSource(src) {
    /* jshint validthis:true */
    return os.EOL + '// Source: ' + this.relative + os.EOL + src.trim().replace(/(^|\n)[ \t]*('use strict'|"use strict");?\s*/g, '$1');
}
module.exports.scripts = function (name, sortFileNames, options) {
    if (!options)
        options = {};
    options.process = processJsSource;
    return combine.obj(gulpconcatjsordered(name, sortFileNames, options), gulpif(function (file) { return file.__concat; }, header(['(function(window, document, undefined) {', os.EOL, '\'use strict\';', os.EOL].join(''))), gulpif(function (file) { return file.__concat; }, footer([os.EOL, os.EOL, '})(window, document);', os.EOL].join(''))));
};
