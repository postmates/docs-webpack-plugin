{
  var indentStack = [],
    indent = "";
}

start
  = GARBAGE?
    EMPTYLINE*
    INDENT? c:(COMMAND)+
    .*
    { return c; }

COMMAND
  = SAMEDENT
    d:DEFINITION
    _?
    t:MESSAGE
    EOL?
    {
      d.message = t.message || '';
      d.children = t.children || [];
      return d;
    }

MESSAGE
  = (
      c:STRING
      { return { message: c }; }
    ) / (
      EOL?
      INDENT
      c:(
        (
          d:(COMMAND)+
          { return { children: d }; }
        ) / (
          j:(SAMEDENT y:STRING EOL? { return y; })+
          { return { message: j.join(' ') }; }
        )
      )
      DEDENT
      { return c; }
    )

DEFINITION
  = t:(
      _ i:DECLARATION _
      m:(
        '[' _ [\'\"]? _ k:TYPE _ [\'\"]? _ ']' { return k }
      )?
      _? ':'
      { return { command: i, type: m }; }
    )
    { return t }

DECLARATION
  = t:(!EOL c:[^\[: \t] { return c; })+
    { return t.join(''); }

TYPE
  = j:(!EOL c:[^\] \t \'\"]{ return c })+
    { return j.join(''); }

STRING
  = t:(!EOL c:. { return c; })+
    { return t.join(''); }

SAMEDENT
  = i:[ \t]*
    &{ return i.join("") === indent; }

INDENT
  = &(
      i:[ \t]+ &{ return i.length > indent.length; }
      {
        indentStack.push(indent);
        indent = i.join("");
      }
    )

DEDENT
  = !{ indent = indentStack.pop(); }

GARBAGE
  = [^\n]* [\n]

EMPTYLINE
  = [ \w]*[\n]

EOL
  = "\r\n" / "\n"

_
  = [ \t]*
