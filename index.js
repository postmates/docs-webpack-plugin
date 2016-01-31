var parser = require('./src/parse.js'),
	fs = require('fs');

function extend() {
	var out = {},
		i, j;

	for (i = 0; i < arguments.length; i++) {
		if (Object.prototype.toString.call(arguments[i]) !== '[object Object]') {
			continue;
		}

		for (j in arguments[i]) {
			out[j] = arguments[i][j];
		}
	}

	return out;
}

function DocParser(options) {
	this.options = extend({
		file: 'docs.json'
	}, options);
}

DocParser.prototype.apply = function(compiler) {
	var docs = [],
		outFile = this.options.file;

	compiler.plugin('compilation', function(compilation) {
		compilation.plugin('normal-module-loader', function(loaderContext, module) {
			if (/node_modules/.test(module.resource)) {
				return;
			}

			if (!/\.jsx?$/.test(module.resource)) {
				return;
			}

			try {
				parser('' + fs.readFileSync(module.resource))
					.forEach(function(_doc) {
						_doc.file = module.resource;
						docs.push(_doc);
					});
			} catch (e) {
				compilation.errors.push(
					new Error(module.resource + '\n' + e.message)
				);
			}
		});
	});

	compiler.plugin('emit', function(compilation, callback) {
		json = JSON.stringify(docs, null, 2);

		compilation.assets[outFile] = {
			source: function() {
				return json;
			},
			size: function() {
				return json.length;
			}
		};

		callback();
	});
};

module.exports = DocParser;
