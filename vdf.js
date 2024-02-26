/*Copyright (c) 2014 Rossen Georgiev
https://github.com/rossengeorgiev

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.*/



function parse(text) {
    if(typeof text != "string") {
        throw new TypeError("VDF.parse: Expecting parameter to be a string");
    }

    lines = text.split("\n");

    var obj = new Map();
    var stack = [obj];
    var expect_bracket = false;
    var name = "";

    var re_kv = new RegExp(
        '^("((?:\\\\.|[^\\\\"])+)"|([a-z0-9\\-\\_]+))' +
        '([ \t]*(' +
        '"((?:\\\\.|[^\\\\"])*)(")?' +
        '|([a-z0-9\\-\\_]+)' +
        '))?'
        );

    var i = 0, j = lines.length;
    for(; i < j; i++) {
        line = lines[i].trim();

        // skip empty and comment lines
        if( line == "" || line[0] == '/') { continue; }

        // one level deeper
        if( line[0] == "{" ) {
            expect_bracket = false;
            continue;
        }

        if(expect_bracket) {
            throw new SyntaxError("VDF.parse: invalid syntax on line " + (i+1));
        }

        // one level back
        if( line[0] == "}" ) {
            stack.pop();
            continue;
        }

        // parse keyvalue pairs
        while(true) {
            m = re_kv.exec(line);

            if(m === null) {
                throw new SyntaxError("VDF.parse: invalid syntax on line " + (i+1));
            }

            // qkey = 2
            // key = 3
            // qval = 6
            // vq_end = 7
            // val = 8
            var key = (m[2] !== undefined) ? m[2] : m[3];
            var val = (m[6] !== undefined) ? m[6] : m[8];

            if(val === undefined) {
                // chain (merge) duplicate key
                if (!stack[stack.length-1].has(key) || !(stack[stack.length-1].get(key) instanceof Map)) {
					stack[stack.length - 1].set(key, new Map());
				}


                stack.push(stack[stack.length-1].get(key));
                expect_bracket = true;
            }
            else {
                if(m[7] === undefined && m[8] === undefined) {
                    line += "\n" + lines[++i];
                    continue;
                }

                stack[stack.length - 1].set(key, val);
            }

            break;
        }
    }

    if(stack.length != 1) throw new SyntaxError("VDF.parse: open parentheses somewhere");
	
    return obj;
}

function stringify(obj,pretty) {
    if( typeof obj != "object") {
            throw new TypeError("VDF.stringify: First input parameter is not an object");
    }

    pretty = ( typeof pretty == "boolean" && pretty) ? true : false;

    return _dump(obj,pretty,0);
}

function _dump(obj,pretty,level) {
    if( typeof obj != "object" ) {
        throw new TypeError("VDF.stringify: a key has value of type other than string or object");
    }

    var indent = "\t";
    var buf = "";
    var line_indent = "";


    if(pretty) {
        for(var i = 0; i < level; i++ ) {
            line_indent += indent;
        }
    }

    for (let [key, value] of obj.entries()) {
		if (value instanceof Map) {
			buf += [line_indent, '"', key, '"\n', line_indent, '{\n', _dump(value, pretty, level + 1), line_indent, "}\n"].join('');
		} else {
			buf += [line_indent, '"', key, '"\t\t"', String(value), '"\n'].join('');
		}
	}

    return buf;
}

exports.parse = parse;
exports.stringify = stringify;
exports.dump = stringify;