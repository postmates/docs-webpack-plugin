var babylon = require('babylon').parse,
    traverse = require('babel-traverse').default,
    PEG = require('pegjs'),
    fs = require('fs'),

    parser = PEG.buildParser('' + fs.readFileSync(__dirname + '/lang.js')),
    propBlacklist = /^(hasOwnProperty|children)$/;

function processDocProps(props) {
    var out = {};

    if (!props || !props.children) {
        return null;
    }

    props.children.forEach(function(prop) {
        out[prop.command] = {
            type: prop.type,
            description: prop.message
        };
    });

    return out;
}

function processDocs(doc) {
    var out = {},
        tmp = {};

    (doc || []).forEach(function(cmd) {
        tmp[cmd.command] = cmd;
    });

    if (tmp.hasOwnProperty('title')) {
        out.name = tmp.title.message;
    }

    if (tmp.hasOwnProperty('category')) {
        out.category = tmp.category.message;
    }

    if (tmp.hasOwnProperty('props')) {
        out.props = processDocProps(tmp.props);
    }

    if (tmp.hasOwnProperty('description')) {
        out.description = tmp.description.message;
    }

    return out;
}

function findMismatch(one, two) {
    var _one = one.slice(0).sort(),
        _two = two.slice(0).sort(),
        out = [],
        ni = 0,
        no = 0;

    while (ni < _one.length && no < _two.length) {
        if (_one[ni] === _two[no]) {
            ni++;
            no++;
            continue;
        }

        if (_one[ni] < _two[no]) {
            out.push(_one[ni]);
            ni++;
        } else {
            out.push(_two[no]);
            no++;
        }
    }

    while (ni < _one.length) {
        out.push(_one[ni++]);
    }

    while (no < _two.length) {
        out.push(_two[no++]);
    }

    return out;
}

function generateDescriptor(def) {
    var PROP_MISMATCH = def.name +
            ': Mismatch of React properties between documentation and code',
        NAME_MISMATCH = def.name +
            ': Mismatch of class name between documentation and code',
        MODEL_MISSSING = def.name +
            ': Model definition is required',
        mismatch;

    def.props = Object.keys(def.props);

    if (def.props.length) {
        if (
            def.super === 'ModelListener' &&
            (
                !def.props ||
                def.props.indexOf('model') < 0
            )
        ) {
            throw new Error(MODEL_MISSSING);
        }

        if (
            (!def.docs || !def.docs.props) ||
            (def.props.length !== Object.keys(def.docs.props).length) ||
            (def.props.slice(0).sort().join(',') !== Object.keys(def.docs.props).slice(0).sort().join(','))
        ) {
            mismatch = findMismatch(def.props, Object.keys(def.docs.props || {}));

            if (def.super === 'ModelListener' && mismatch.indexOf('model') > -1) {
                mismatch.splice(mismatch.indexOf('model'), 1);
            }

            if (mismatch.length) {
                throw new Error(
                    PROP_MISMATCH + '\n\t' +
                    mismatch.join('\n\t')
                );
            }
        }

        def.props = def.docs.props;
        delete def.docs.props;
    } else if (def.docs && (def.docs.props || []).length) {
        throw new Error(PROP_MISMATCH);
    }

    if (Object.keys(def.docs).length) {
        if (def.docs.name !== def.name) {
            throw new Error(NAME_MISMATCH);
        }

        delete def.docs.name;

        def.description = def.docs.description;
    }

    if (def.model) {
        delete def.model;
    }

    delete def.buildProp;
    delete def.docs;

    return def;
}

function unwrapClass(curr) {
    if (curr.type === 'Identifier') {
        return curr.name;
    }

    return unwrapClass(curr.object) + '.' + curr.property.name;
}

function processClass(node) {
    var out = {
        name: node.id.name,
        super: '',
        docs: [],
        props: {},

        buildProp: (function() {
            var curr_id = null;

            return function(id) {
                if (curr_id === 'props') {
                    if (!propBlacklist.test(id)) {
                        out.props[id] = true;
                    }

                    curr_id = null;
                    return;
                }

                if (
                    (curr_id === 'this' && id === 'props') ||
                    (curr_id === null && id === 'this')
                ) {
                    curr_id = id;
                    return;
                }

                curr_id = null;
            }
        })()
    };

    if (node.superClass) {
        if (node.superClass.type === 'Identifier') {
            out.super = node.superClass.name;
        } else if (node.superClass.type === 'MemberExpression') {
            out.super = unwrapClass(node.superClass);
        }
    }

    node.leadingComments = (node.leadingComments||[]).map(function(c) {
            return c.value;
        }).join('\n');

    if (node.leadingComments.length && !/(eslint)/.test(node.leadingComments)) {
        out.docs = processDocs(parser.parse(node.leadingComments));
    } else {
        throw new Error(out.name + ': No documentation');
    }

    out.category = out.docs.category || 'class';
    delete out.docs.category;

    return out;
}

module.exports = function parse(src) {
    var ast = babylon(src, {
            sourceType: 'module',
            allowImportExportEverywhere: 'true',
            plugins: [
                'jsx',
                'flow',
                'objectRestSpread',
                'classProperties'
            ]
        }),
        propBlacklist = /^(hasOwnProperty|children)/,
        classes = [],
        curr_class,
        name, top,
        lastPropId = null;

    ast.program.comments = ast.comments;

    traverse(ast, {
        enter(path) {
            if (path.node.type === 'ClassDeclaration') {
                if (curr_class) {
                    classes.push(curr_class);
                }

                curr_class = processClass(path.node);
            }

            if (path.node.type === 'ThisExpression' && curr_class) {
                curr_class.buildProp('this');
            }

            if (path.node.type === 'Identifier' && curr_class) {
                curr_class.buildProp(path.node.name);
            }

            if (path.node.type === 'ClassProperty' && path.node.key.name === 'defaultProps') {
                path.node.value.properties.forEach(function(prop) {
                    curr_class.props[prop.key.name] = true;

                    if (prop.key.name === 'model') {
                        curr_class.model = prop.value.value || prop.value.name;
                    }
                });
            }
        }
    });

    if (curr_class) {
        classes.push(curr_class);
        curr_class = null;
    }

    classes.forEach(generateDescriptor);

    return classes;
};
