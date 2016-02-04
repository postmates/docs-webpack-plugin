#!/usr/bin/env node

var optionator = require("optionator"),
    glob = require("glob"),
    shell = require("shelljs"),
    fs = require('fs'),
    parser = require('../src/parse'),
    chalk = require('chalk');

var exitCode = 0,
    options = optionator({
        prepend: "docs-cli [options] file.js [file.js] [dir]",
        concatRepeatedArrays: true,
        mergeRepeatedObjects: true,
        options: [
            {
                heading: "Basic configuration"
            },
            {
                option: "ext",
                type: "[String]",
                default: ".js",
                description: "Specify JavaScript file extensions"
            }
        ]
    });

function processPath(extensions) {
    var suffix = "/**";

    if (extensions) {
        if (extensions.length === 1) {
            suffix += "/*." + extensions[0];
        } else {
            suffix += "/*.{" + extensions.join(",") + "}";
        }
    }

    return function(pathname) {
        var newPath = pathname;

        if (shell.test("-d", pathname)) {
            newPath = pathname.replace(/[\/\\]$/, "") + suffix;
        }

        return newPath.replace(/\\/g, "/").replace(/^\.\//, "");
    };
}

function patternToFile(globPatterns) {
    var files = [],
        added = {};

    function addFile(filename) {
        filename = fs.realpathSync(filename);
        if (added[filename]) {
            return;
        }
        files.push(filename);
        added[filename] = true;
    }

    globPatterns.forEach(function(pattern) {
        if (shell.test("-f", pattern)) {
            addFile(pattern);
        } else {
            glob.sync(pattern, { nodir: true }).forEach(addFile);
        }
    });

    return files;
}

function printError(e) {
    console.log(chalk.bold.red('Error in ') + e.file);
    console.log(chalk.red(e.message));
}

function run() {
    try {
        currentOptions = options.parse(process.argv);
    } catch (error) {
        console.log(error.message);
        return 1;
    }

    files = currentOptions._;

    if (currentOptions.help || !files.length) {
        console.log(options.generateHelp());
        return 0;
    }

    var extensions = (currentOptions.ext || [".js"])
            .map(function(ext) {
                return ext.charAt(0) === "." ? ext.substr(1) : ext;
            }),
        docs = [],
        errors = [];

    patternToFile(files.map(processPath(extensions)))
        .map(function(file) {
            try {
                parser('' + fs.readFileSync(file)).forEach(function(doc) {
                    doc.file = file;
                    docs.push(doc);
                });
            } catch (e) {
                errors.push({
                    file: file,
                    message: e.message
                });
            }
        });

    if (errors.length) {
        errors.forEach(printError);
        return 1;
    }

    return 0;
}

exitCode = run();

process.on("exit", function() {
    process.exit(exitCode);
});
