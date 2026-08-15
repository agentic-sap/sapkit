"use strict";

// src/cli/args.ts
var UsageError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
};
var ParsedArgs = class {
  constructor(positionals, values) {
    this.positionals = positionals;
    this.values = values;
  }
  bool(name) {
    return this.values.get(name) === true;
  }
  str(name, fallback) {
    const value = this.values.get(name);
    return typeof value === "string" ? value : fallback;
  }
  num(name, fallback) {
    const value = this.values.get(name);
    return typeof value === "number" ? value : fallback;
  }
};
function parseArgs(argv, spec) {
  const positionals = [];
  const values = /* @__PURE__ */ new Map();
  let terminated = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === void 0) continue;
    if (terminated || arg === "-" || !arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      terminated = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new UsageError(`unknown option '${arg}' \u2014 this CLI takes long options only (--name)`);
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);
    const kind = Object.prototype.hasOwnProperty.call(spec, name) ? spec[name] : void 0;
    if (kind === void 0) throw new UsageError(`unknown option '--${name}'`);
    if (kind === "boolean") {
      if (inline !== null) throw new UsageError(`option '--${name}' takes no value`);
      values.set(name, true);
      continue;
    }
    let raw = inline;
    if (raw === null) {
      const next = argv[i + 1];
      if (next === void 0) throw new UsageError(`option '--${name}' needs a value`);
      raw = next;
      i += 1;
    }
    if (kind === "number") {
      const parsed = Number(raw);
      if (raw.trim() === "" || !Number.isInteger(parsed)) {
        throw new UsageError(`option '--${name}' needs a whole number, got '${raw}'`);
      }
      values.set(name, parsed);
    } else {
      values.set(name, raw);
    }
  }
  return new ParsedArgs(positionals, values);
}

// src/core/token.ts
var TokenType = {
  Identifier: "Identifier",
  Comment: "Comment",
  /** 작은따옴표 'abc' 또는 백틱 `abc` 리터럴 */
  StringToken: "StringToken",
  /** 보간 없는 완결 템플릿 |abc| */
  StringTemplate: "StringTemplate",
  /** |begin{ */
  StringTemplateBegin: "StringTemplateBegin",
  /** }end| */
  StringTemplateEnd: "StringTemplateEnd",
  /** }middle{ */
  StringTemplateMiddle: "StringTemplateMiddle",
  /** 마침표와 쉼표 */
  Punctuation: "Punctuation",
  /** ##PRAGMA */
  Pragma: "Pragma",
  ParenLeft: "ParenLeft",
  ParenLeftW: "ParenLeftW",
  WParenLeft: "WParenLeft",
  WParenLeftW: "WParenLeftW",
  ParenRight: "ParenRight",
  ParenRightW: "ParenRightW",
  WParenRight: "WParenRight",
  WParenRightW: "WParenRightW",
  BracketLeft: "BracketLeft",
  BracketLeftW: "BracketLeftW",
  WBracketLeft: "WBracketLeft",
  WBracketLeftW: "WBracketLeftW",
  BracketRight: "BracketRight",
  BracketRightW: "BracketRightW",
  WBracketRight: "WBracketRight",
  WBracketRightW: "WBracketRightW",
  Dash: "Dash",
  DashW: "DashW",
  WDash: "WDash",
  WDashW: "WDashW",
  Plus: "Plus",
  PlusW: "PlusW",
  WPlus: "WPlus",
  WPlusW: "WPlusW",
  At: "At",
  AtW: "AtW",
  WAt: "WAt",
  WAtW: "WAtW",
  InstanceArrow: "InstanceArrow",
  InstanceArrowW: "InstanceArrowW",
  WInstanceArrow: "WInstanceArrow",
  WInstanceArrowW: "WInstanceArrowW",
  StaticArrow: "StaticArrow",
  StaticArrowW: "StaticArrowW",
  WStaticArrow: "WStaticArrow",
  WStaticArrowW: "WStaticArrowW"
};
var ARROW_TYPES = /* @__PURE__ */ new Set([
  TokenType.InstanceArrow,
  TokenType.InstanceArrowW,
  TokenType.WInstanceArrow,
  TokenType.WInstanceArrowW,
  TokenType.StaticArrow,
  TokenType.StaticArrowW,
  TokenType.WStaticArrow,
  TokenType.WStaticArrowW
]);
var PAREN_LEFT_TYPES = /* @__PURE__ */ new Set([
  TokenType.ParenLeft,
  TokenType.ParenLeftW,
  TokenType.WParenLeft,
  TokenType.WParenLeftW
]);
var PAREN_RIGHT_TYPES = /* @__PURE__ */ new Set([
  TokenType.ParenRight,
  TokenType.ParenRightW,
  TokenType.WParenRight,
  TokenType.WParenRightW
]);
function isArrowToken(token) {
  return ARROW_TYPES.has(token.type);
}
function isParenLeftToken(token) {
  return PAREN_LEFT_TYPES.has(token.type) || token.str === "(";
}
function isParenRightToken(token) {
  return PAREN_RIGHT_TYPES.has(token.type) || token.str === ")";
}

// src/core/lexer.ts
var SPLIT_CHARS = /* @__PURE__ */ new Set([" ", ":", ".", ",", "-", "+", "(", ")", "[", "]", "	", "\n"]);
var SOLO_CHARS = /* @__PURE__ */ new Set([".", ",", ":", "(", ")", "[", "]", "+", "@"]);
var WHITE_BEFORE_CHARS = /* @__PURE__ */ new Set([" ", "\n", "	", ":"]);
var WHITE_AFTER_CHARS = /* @__PURE__ */ new Set([" ", "\n", "	", ":", ",", ".", "", '"']);
var GO_SPACE_RUNES = /* @__PURE__ */ new Set([
  9,
  10,
  11,
  12,
  13,
  32,
  133,
  160,
  5760,
  8192,
  8193,
  8194,
  8195,
  8196,
  8197,
  8198,
  8199,
  8200,
  8201,
  8202,
  8232,
  8233,
  8239,
  8287,
  12288
]);
var UNREADABLE = { rune: -1, size: 1 };
function runeAt(bytes, index, end) {
  const lead = bytes.charCodeAt(index);
  if (lead < 128) return { rune: lead, size: 1 };
  let size;
  let rune;
  if (lead >= 194 && lead <= 223) {
    size = 2;
    rune = lead & 31;
  } else if (lead >= 224 && lead <= 239) {
    size = 3;
    rune = lead & 15;
  } else {
    return UNREADABLE;
  }
  if (index + size > end) return UNREADABLE;
  for (let k = 1; k < size; k++) {
    const next = bytes.charCodeAt(index + k);
    if ((next & 192) !== 128) return UNREADABLE;
    rune = rune << 6 | next & 63;
  }
  return { rune, size };
}
function runeBefore(bytes, start, end) {
  const tail = bytes.charCodeAt(end - 1);
  if (tail < 128) return { rune: tail, size: 1 };
  for (let back = 1; back <= 2; back++) {
    const index = end - 1 - back;
    if (index < start) break;
    if ((bytes.charCodeAt(index) & 192) === 128) continue;
    const decoded = runeAt(bytes, index, end);
    return decoded.rune >= 0 && index + decoded.size === end ? decoded : UNREADABLE;
  }
  return UNREADABLE;
}
function trimGoSpace(bytes) {
  let start = 0;
  let end = bytes.length;
  while (start < end) {
    const { rune, size } = runeAt(bytes, start, end);
    if (rune < 0 || !GO_SPACE_RUNES.has(rune)) break;
    start += size;
  }
  while (end > start) {
    const { rune, size } = runeBefore(bytes, start, end);
    if (rune < 0 || !GO_SPACE_RUNES.has(rune)) break;
    end -= size;
  }
  return bytes.slice(start, end);
}
function spacedVariant(whiteBefore, whiteAfter, bare, afterOnly, beforeOnly, both) {
  if (whiteBefore && whiteAfter) return both;
  if (whiteBefore) return beforeOnly;
  if (whiteAfter) return afterOnly;
  return bare;
}
function singleCharType(s, whiteBefore, whiteAfter) {
  const w = (bare, afterOnly, beforeOnly, both) => spacedVariant(whiteBefore, whiteAfter, bare, afterOnly, beforeOnly, both);
  switch (s) {
    case ".":
    case ",":
      return TokenType.Punctuation;
    case "[":
      return w(TokenType.BracketLeft, TokenType.BracketLeftW, TokenType.WBracketLeft, TokenType.WBracketLeftW);
    case "]":
      return w(
        TokenType.BracketRight,
        TokenType.BracketRightW,
        TokenType.WBracketRight,
        TokenType.WBracketRightW
      );
    case "(":
      return w(TokenType.ParenLeft, TokenType.ParenLeftW, TokenType.WParenLeft, TokenType.WParenLeftW);
    case ")":
      return w(TokenType.ParenRight, TokenType.ParenRightW, TokenType.WParenRight, TokenType.WParenRightW);
    case "-":
      return w(TokenType.Dash, TokenType.DashW, TokenType.WDash, TokenType.WDashW);
    case "+":
      return w(TokenType.Plus, TokenType.PlusW, TokenType.WPlus, TokenType.WPlusW);
    case "@":
      return w(TokenType.At, TokenType.AtW, TokenType.WAt, TokenType.WAtW);
    default:
      return TokenType.Identifier;
  }
}
function templateType(s, whiteBefore, whiteAfter) {
  const first = s.charAt(0);
  const last = s.charAt(s.length - 1);
  if (first === "|" && last === "|") return TokenType.StringTemplate;
  if (first === "|" && last === "{" && whiteAfter) return TokenType.StringTemplateBegin;
  if (first === "}" && last === "|" && whiteBefore) return TokenType.StringTemplateEnd;
  if (first === "}" && last === "{" && whiteAfter && whiteBefore) return TokenType.StringTemplateMiddle;
  return TokenType.Identifier;
}
var Lexer = class {
  /** 바이트 하나 = 글자 하나인 시점의 원문. */
  bytes;
  tokens = [];
  mode = "normal";
  buffer = "";
  /** 지금 보고 있는 바이트 자리. -1은 파일 앞의 가상 줄바꿈. */
  offset = -1;
  row = 0;
  col = 0;
  constructor(source) {
    this.bytes = Buffer.from(source.replace(/\r/g, ""), "utf8").toString("latin1");
  }
  run() {
    for (; ; ) {
      const current = this.currentChar();
      this.buffer += current;
      const ahead = this.byteAt(this.offset + 1);
      const ahead2 = this.bytes.slice(this.offset + 1, this.offset + 3);
      if (this.mode === "normal") {
        this.stepNormal(current, ahead, ahead2);
      } else if (this.mode === "pragma" && this.endsPragma(ahead)) {
        this.emit();
        this.mode = "normal";
      } else if (this.mode === "ping" && this.endsQuoted(current, ahead, ahead2, "`")) {
        this.emit();
        this.mode = ahead === '"' ? "comment" : "normal";
      } else if (this.mode === "template" && this.endsTemplate(current)) {
        this.emit();
        this.mode = "normal";
      } else if (this.mode === "template" && ahead === "}" && current !== "\\") {
        this.emit();
      } else if (this.mode === "str" && this.endsQuoted(current, ahead, ahead2, "'")) {
        this.emit();
        this.mode = ahead === '"' ? "comment" : "normal";
      } else if (ahead === "\n" && this.mode !== "template") {
        this.emit();
        this.mode = "normal";
      } else if (this.mode === "template" && current === "\n") {
        this.emit();
      }
      if (!this.advance()) break;
    }
    this.emit();
    return this.tokens;
  }
  /** 보통 모드의 끊기 판단. 순서가 곧 우선순위다. */
  stepNormal(current, ahead, ahead2) {
    if (ahead.length === 1 && SPLIT_CHARS.has(ahead)) {
      this.emit();
      return;
    }
    if (ahead === "'") {
      this.emit();
      this.mode = "str";
      return;
    }
    if (ahead === "|" || ahead === "}") {
      this.emit();
      this.mode = "template";
      return;
    }
    if (ahead === "`") {
      this.emit();
      this.mode = "ping";
      return;
    }
    if (ahead2 === "##") {
      this.emit();
      this.mode = "pragma";
      return;
    }
    if (ahead === '"' || ahead === "*" && current === "\n") {
      this.emit();
      this.mode = "comment";
      return;
    }
    if (ahead === "@" && trimGoSpace(this.buffer) === "") {
      this.emit();
      return;
    }
    if (ahead2 === "->" || ahead2 === "=>") {
      this.emit();
      return;
    }
    if (current === ">" && ahead !== " ") {
      const previous = this.byteAt(this.offset - 1);
      if (previous === "-" || previous === "=") {
        this.emit();
        return;
      }
    }
    if (this.buffer.length === 1 && (SOLO_CHARS.has(this.buffer) || this.buffer === "-" && ahead !== ">")) {
      this.emit();
    }
  }
  endsPragma(ahead) {
    return ahead === "," || ahead === ":" || ahead === "." || ahead === " " || ahead === "\n";
  }
  /**
   * 따옴표/백틱 리터럴의 끝인가. 두 겹(`''`, ` `` `)은 벗어난 것이므로 끝이 아니고,
   * 담개 안 따옴표 수가 짝수여야 진짜 닫힘이다.
   */
  endsQuoted(current, ahead, ahead2, quote) {
    return current === quote && this.buffer.length > 1 && ahead2 !== quote + quote && ahead !== quote && this.countIsEven(quote);
  }
  /** 템플릿 조각의 끝인가. 역슬래시로 벗어난 `\|`·`\{`는 끝이 아니다. */
  endsTemplate(current) {
    if (this.buffer.length <= 1) return false;
    if (current !== "|" && current !== "{") return false;
    const previous = this.byteAt(this.offset - 1);
    const previousPair = this.offset - 2 < 0 ? "" : this.bytes.slice(this.offset - 2, this.offset);
    return previous !== "\\" || previousPair === "\\\\";
  }
  countIsEven(ch) {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer.charAt(i) === ch) count++;
    }
    return count % 2 === 0;
  }
  /** 원문 밖은 빈 문자열. 가상 줄바꿈은 여기 없다 — `currentChar()`만 갖는다. */
  byteAt(index) {
    if (index < 0 || index >= this.bytes.length) return "";
    return this.bytes.charAt(index);
  }
  /** 지금 글자. 파일 앞(-1)에서는 가상 줄바꿈이다. */
  currentChar() {
    return this.offset < 0 ? "\n" : this.byteAt(this.offset);
  }
  /** 한 바이트 나아간다. 원문 끝을 넘어서면 false. */
  advance() {
    if (this.currentChar() === "\n") {
      this.col = 1;
      this.row++;
    }
    if (this.offset === this.bytes.length) {
      this.col--;
      return false;
    }
    this.col++;
    this.offset++;
    return true;
  }
  /** 담개에 쌓인 것을 토큰 하나로 내놓고 담개를 비운다. */
  emit() {
    const s = trimGoSpace(this.buffer);
    this.buffer = "";
    if (s.length === 0) return;
    const before = this.offset - s.length;
    const whiteBefore = before >= 0 && WHITE_BEFORE_CHARS.has(this.bytes.charAt(before));
    const whiteAfter = WHITE_AFTER_CHARS.has(this.byteAt(this.offset + 1));
    this.tokens.push({
      str: Buffer.from(s, "latin1").toString("utf8"),
      type: this.typeOf(s, whiteBefore, whiteAfter),
      row: this.row,
      col: this.col - s.length
    });
  }
  typeOf(s, whiteBefore, whiteAfter) {
    if (this.mode === "comment") return TokenType.Comment;
    if (this.mode === "ping" || this.mode === "str") return TokenType.StringToken;
    if (this.mode === "template") return templateType(s, whiteBefore, whiteAfter);
    if (s.length > 2 && s.slice(0, 2) === "##") return TokenType.Pragma;
    if (s.length === 1) return singleCharType(s, whiteBefore, whiteAfter);
    if (s.length === 2) {
      if (s === "->") {
        return spacedVariant(
          whiteBefore,
          whiteAfter,
          TokenType.InstanceArrow,
          TokenType.InstanceArrowW,
          TokenType.WInstanceArrow,
          TokenType.WInstanceArrowW
        );
      }
      if (s === "=>") {
        return spacedVariant(
          whiteBefore,
          whiteAfter,
          TokenType.StaticArrow,
          TokenType.StaticArrowW,
          TokenType.WStaticArrow,
          TokenType.WStaticArrowW
        );
      }
    }
    return TokenType.Identifier;
  }
};
function tokenize(source) {
  return new Lexer(source).run();
}

// src/core/statement.ts
function asciiUpper(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 97 && code <= 122 ? String.fromCharCode(code - 32) : s.charAt(i);
  }
  return out;
}
function concatTokens(stmt) {
  return stmt.tokens.map((t) => t.str).join(" ");
}
function firstTokenStr(stmt) {
  const first = stmt.tokens[0];
  return first === void 0 ? "" : asciiUpper(first.str);
}
function splitStatements(tokens) {
  const statements = [];
  let pending = [];
  let prefix = [];
  let colon = null;
  for (const token of tokens) {
    if (token.type === TokenType.Comment) {
      statements.push({ tokens: [token], pragmas: [], type: "Comment", colon: null });
      continue;
    }
    pending.push(token);
    if (token.str === ".") {
      statements.push(buildStatement(prefix, pending, colon));
      pending = [];
      prefix = [];
      colon = null;
    } else if (token.str === ",") {
      if (prefix.length > 0) {
        statements.push(buildStatement(prefix, pending, colon));
        pending = [];
      }
    } else if (token.str === ":") {
      pending.pop();
      if (colon === null) {
        colon = token;
        prefix = pending;
        pending = [];
      }
    }
  }
  if (pending.length > 0) {
    statements.push(buildStatement(prefix, pending, colon));
  }
  return applyNativeSql(statements);
}
function buildStatement(prefix, pending, colon) {
  const all = [...prefix, ...pending];
  const tokens = [];
  const pragmas = [];
  all.forEach((token, i) => {
    if (token.type === TokenType.Pragma && i < all.length - 1) pragmas.push(token);
    else tokens.push(token);
  });
  const only = tokens.length === 1 ? tokens[0] : void 0;
  const type = only !== void 0 && only.type === TokenType.Punctuation ? "Empty" : "Unknown";
  return { tokens, pragmas, type, colon };
}
function applyNativeSql(statements) {
  const result = [];
  let inSql = false;
  for (const stmt of statements) {
    if (!inSql) {
      if (isMethodByDatabase(stmt)) inSql = true;
      result.push(stmt);
      continue;
    }
    if (firstTokenStr(stmt) === "ENDMETHOD") {
      inSql = false;
      result.push(stmt);
      continue;
    }
    const split = splitTrailingEndMethod(stmt);
    if (split !== null) {
      result.push(...split);
      inSql = false;
      continue;
    }
    stmt.type = "NativeSQL";
    result.push(stmt);
  }
  return result;
}
function splitTrailingEndMethod(stmt) {
  const tokens = stmt.tokens;
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  const beforeLast = tokens[tokens.length - 2];
  if (last === void 0 || beforeLast === void 0) return null;
  if (last.type !== TokenType.Punctuation || last.str !== ".") return null;
  if (asciiUpper(beforeLast.str) !== "ENDMETHOD") return null;
  const sqlTokens = tokens.slice(0, tokens.length - 2);
  const endTokens = tokens.slice(tokens.length - 2);
  const out = [];
  if (sqlTokens.length > 0) {
    out.push({ tokens: sqlTokens, pragmas: [], type: "NativeSQL", colon: null });
  }
  out.push({ tokens: endTokens, pragmas: [], type: "Unknown", colon: null });
  return out;
}
function isMethodByDatabase(stmt) {
  return stmt.tokens.some((token, i) => {
    if (i < 2 || asciiUpper(token.str) !== "DATABASE") return false;
    const previous = stmt.tokens[i - 1];
    return previous !== void 0 && asciiUpper(previous.str) === "BY";
  });
}

// src/core/classifier.ts
function kw(word) {
  return { kind: "keyword", word };
}
var DASH = { kind: "tokenType", tokenType: TokenType.Dash };
var IDENT = { kind: "ident" };
var ANY = { kind: "any" };
var REST = { kind: "rest" };
var IDENT_PATTERN = /^[\w~/<>]+$/;
function keywordUpper(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return unicodeSimpleUpper(s);
  }
  return asciiUpper(s);
}
function unicodeSimpleUpper(s) {
  let out = "";
  for (const ch of s) {
    const upper = ch.toUpperCase();
    const first = upper.codePointAt(0);
    const isOneToOne = first !== void 0 && String.fromCodePoint(first).length === upper.length;
    out += isOneToOne ? upper : ch;
  }
  return out;
}
function pattern(type, ...steps) {
  return { type, steps };
}
var SOLO_KEYWORDS = [
  ["EndIf", "ENDIF"],
  ["EndLoop", "ENDLOOP"],
  ["EndDo", "ENDDO"],
  ["EndWhile", "ENDWHILE"],
  ["EndCase", "ENDCASE"],
  ["EndTry", "ENDTRY"],
  ["EndMethod", "ENDMETHOD"],
  ["EndClass", "ENDCLASS"],
  ["EndForm", "ENDFORM"],
  ["EndFunction", "ENDFUNCTION"],
  ["EndInterface", "ENDINTERFACE"],
  ["EndModule", "ENDMODULE"],
  ["Else", "ELSE"],
  ["Try", "TRY"],
  ["Return", "RETURN"],
  ["Continue", "CONTINUE"],
  ["Exit", "EXIT"]
];
var PATTERNS = [
  ...SOLO_KEYWORDS.map(([type, word]) => pattern(type, kw(word))),
  pattern("Report", kw("REPORT"), REST),
  pattern("Include", kw("INCLUDE"), REST),
  pattern("If", kw("IF"), REST),
  pattern("ElseIf", kw("ELSEIF"), REST),
  pattern("While", kw("WHILE"), REST),
  pattern("Do", kw("DO"), REST),
  pattern("Case", kw("CASE"), REST),
  pattern("WhenOthers", kw("WHEN"), kw("OTHERS")),
  pattern("When", kw("WHEN"), REST),
  pattern("Loop", kw("LOOP"), REST),
  pattern("Catch", kw("CATCH"), REST),
  pattern("Raise", kw("RAISE"), REST),
  pattern("Commit", kw("COMMIT"), REST),
  pattern("LeaveToTransaction", kw("LEAVE"), kw("TO"), kw("TRANSACTION"), REST),
  pattern("Leave", kw("LEAVE"), REST),
  pattern("Submit", kw("SUBMIT"), REST),
  pattern("Sort", kw("SORT"), REST),
  pattern("Assign", kw("ASSIGN"), REST),
  pattern("Unassign", kw("UNASSIGN"), REST),
  pattern("Clear", kw("CLEAR"), REST),
  pattern("Refresh", kw("REFRESH"), REST),
  pattern("Append", kw("APPEND"), REST),
  pattern("Condense", kw("CONDENSE"), REST),
  pattern("Translate", kw("TRANSLATE"), REST),
  pattern("Replace", kw("REPLACE"), REST),
  pattern("Find", kw("FIND"), REST),
  pattern("Split", kw("SPLIT"), REST),
  pattern("Concatenate", kw("CONCATENATE"), REST),
  pattern("Write", kw("WRITE"), REST),
  pattern("Message", kw("MESSAGE"), REST),
  pattern("Add", kw("ADD"), REST),
  pattern("Perform", kw("PERFORM"), REST),
  pattern("SelectOption", kw("SELECT"), DASH, kw("OPTIONS"), REST),
  pattern("Select", kw("SELECT"), REST),
  // 이름이 뒤따라야 선언이다 — `DATA.`만 있으면 여기 걸리지 않는다.
  pattern("Data", kw("DATA"), IDENT, REST),
  pattern("TypeBegin", kw("TYPES"), kw("BEGIN"), kw("OF"), REST),
  pattern("TypeEnd", kw("TYPES"), kw("END"), kw("OF"), REST),
  pattern("Type", kw("TYPES"), IDENT, REST),
  pattern("Constant", kw("CONSTANTS"), REST),
  pattern("ClassDeferred", kw("CLASS"), IDENT, kw("DEFINITION"), kw("DEFERRED"), REST),
  pattern("ClassDefinition", kw("CLASS"), IDENT, kw("DEFINITION"), REST),
  pattern("ClassImplementation", kw("CLASS"), IDENT, kw("IMPLEMENTATION"), REST),
  pattern("ClassData", kw("CLASS"), DASH, kw("DATA"), REST),
  pattern("MethodDef", kw("CLASS"), DASH, kw("METHODS"), REST),
  pattern("MethodImplementation", kw("METHOD"), REST),
  pattern("MethodDef", kw("METHODS"), REST),
  pattern("Interface", kw("INTERFACE"), IDENT, kw("PUBLIC"), REST),
  pattern("Interface", kw("INTERFACE"), IDENT),
  pattern("InterfaceDef", kw("INTERFACES"), REST),
  pattern("Form", kw("FORM"), REST),
  pattern("FunctionModule", kw("FUNCTION"), IDENT),
  pattern("FunctionPool", kw("FUNCTION"), DASH, kw("POOL"), REST),
  pattern("Public", kw("PUBLIC"), kw("SECTION")),
  pattern("Private", kw("PRIVATE"), kw("SECTION")),
  pattern("Protected", kw("PROTECTED"), kw("SECTION")),
  pattern("CreateObject", kw("CREATE"), kw("OBJECT"), REST),
  pattern("CreateData", kw("CREATE"), kw("DATA"), REST),
  pattern("CallFunction", kw("CALL"), kw("FUNCTION"), REST),
  pattern("CallTransaction", kw("CALL"), kw("TRANSACTION"), REST),
  pattern("CallTransformation", kw("CALL"), kw("TRANSFORMATION"), REST),
  pattern("CallScreen", kw("CALL"), kw("SCREEN"), REST),
  pattern("CallSelectionScreen", kw("CALL"), kw("SELECTION"), DASH, kw("SCREEN"), REST),
  pattern("ReadTable", kw("READ"), kw("TABLE"), REST),
  pattern("ReadTextpool", kw("READ"), kw("TEXTPOOL"), REST),
  pattern("InsertTextpool", kw("INSERT"), kw("TEXTPOOL"), REST),
  pattern("InsertInternal", kw("INSERT"), REST),
  pattern("DeleteInternal", kw("DELETE"), REST),
  pattern("FieldSymbol", kw("FIELD"), DASH, kw("SYMBOLS"), REST),
  pattern("Parameter", kw("PARAMETERS"), REST),
  pattern("SelectionScreen", kw("SELECTION"), DASH, kw("SCREEN"), REST),
  pattern("SetPFStatus", kw("SET"), kw("PF"), DASH, kw("STATUS"), REST),
  pattern("SetTitlebar", kw("SET"), kw("TITLEBAR"), REST),
  pattern("GetTime", kw("GET"), kw("TIME"), REST),
  pattern("Module", kw("MODULE"), REST),
  pattern("StartOfSelection", kw("START"), DASH, kw("OF"), DASH, kw("SELECTION")),
  pattern("NativeSQL", kw("DECLARE"), REST)
];
var BY_KEYWORD = (() => {
  const index = /* @__PURE__ */ new Map();
  for (const p of PATTERNS) {
    const first = p.steps[0];
    if (first === void 0 || first.kind !== "keyword") {
      throw new Error(`\uBB34\uB2AC\uC758 \uCCAB \uAC78\uC74C\uC740 \uD0A4\uC6CC\uB4DC\uC5EC\uC57C \uD55C\uB2E4: ${p.type}`);
    }
    const bucket = index.get(first.word);
    if (bucket === void 0) index.set(first.word, [p]);
    else bucket.push(p);
  }
  return index;
})();
function matches(steps, tokens) {
  let pos = 0;
  for (const step of steps) {
    if (step.kind === "rest") {
      pos = tokens.length;
      continue;
    }
    const token = tokens[pos];
    if (token === void 0) return false;
    if (step.kind === "keyword" && keywordUpper(token.str) !== step.word) return false;
    if (step.kind === "tokenType" && token.type !== step.tokenType) return false;
    if (step.kind === "ident" && !IDENT_PATTERN.test(token.str)) return false;
    pos++;
  }
  return pos === tokens.length;
}
function isCallStatement(tokens) {
  if (tokens.length === 0) return false;
  let hasArrow = false;
  let hasParenCall = false;
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === void 0) continue;
    if (isArrowToken(token)) {
      hasArrow = true;
    } else if (isParenLeftToken(token)) {
      depth++;
      hasParenCall = true;
    } else if (isParenRightToken(token)) {
      if (depth > 0) depth--;
    } else if (depth === 0 && (token.str === "=" || token.str === "?=")) {
      if (token.str === "=" && tokens[i + 1]?.str === ">") continue;
      return false;
    }
  }
  return hasArrow || hasParenCall;
}
var FALLBACKS = [
  ["Call", isCallStatement],
  ["Move", (tokens) => matches([ANY, REST], tokens)]
];
function classifyStatement(stmt) {
  if (stmt.type === "Comment" || stmt.type === "Empty") return stmt.type;
  let tokens = stmt.tokens;
  if (tokens.length === 0) return "Empty";
  const last = tokens[tokens.length - 1];
  if (last !== void 0 && last.type === TokenType.Punctuation) tokens = tokens.slice(0, -1);
  if (tokens.length === 0) return "Empty";
  const first = tokens[0];
  if (first === void 0) return "Empty";
  for (const candidate of BY_KEYWORD.get(keywordUpper(first.str)) ?? []) {
    if (matches(candidate.steps, tokens)) return candidate.type;
  }
  for (const [type, test] of FALLBACKS) {
    if (test(tokens)) return type;
  }
  return "Unknown";
}
function classifyStatements(statements) {
  for (const stmt of statements) {
    if (stmt.type === "Unknown") stmt.type = classifyStatement(stmt);
  }
}

// src/core/abap-file.ts
var AbapFile = class {
  filename;
  /** 손대지 않은 원문. */
  raw;
  tokens;
  statements;
  rawRows = null;
  constructor(filename, source) {
    this.filename = filename;
    this.raw = source;
    this.tokens = tokenize(source);
    this.statements = splitStatements(this.tokens);
    classifyStatements(this.statements);
  }
  /**
   * 원문 행. **줄바꿈으로만 자른다** — CR은 남는다(토큰 쪽만 CR을 뗀다).
   * 구 구현 승계이며, 행 길이를 재는 규칙은 이 차이를 알고 써야 한다.
   */
  getRawRows() {
    if (this.rawRows === null) this.rawRows = this.raw.split("\n");
    return this.rawRows;
  }
  getTokens() {
    return this.tokens;
  }
  /** 유형이 이미 확정된 문장들. */
  getStatements() {
    return this.statements;
  }
};

// src/rules/common.ts
function toByteView(s) {
  return Buffer.from(s, "utf8").toString("latin1");
}
function byteLength(s) {
  return Buffer.byteLength(s, "utf8");
}
function upperSimple(s) {
  return mapRunes(s, (ch) => ch.toUpperCase());
}
function lowerSimple(s) {
  return mapRunes(s, (ch) => ch.toLowerCase());
}
function isCodeStatement(stmt) {
  return stmt.type !== "Comment" && stmt.type !== "Empty" && stmt.tokens.length > 0;
}
function mapRunes(s, transform) {
  if (isAscii(s)) return transform(s);
  let out = "";
  for (const ch of s) {
    const mapped = transform(ch);
    out += [...mapped].length === 1 ? mapped : ch;
  }
  return out;
}
function isAscii(s) {
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

// src/rules/catch-cx-root.ts
var KEY = "catch_cx_root";
var TOO_BROAD = /* @__PURE__ */ new Set([
  "CX_ROOT",
  "CX_STATIC_CHECK",
  "CX_DYNAMIC_CHECK",
  "CX_NO_CHECK"
]);
function catchCxRootRule() {
  return {
    key: KEY,
    run(file) {
      const findings = [];
      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;
        const first = stmt.tokens[0];
        if (first === void 0 || upperSimple(first.str) !== "CATCH") continue;
        for (let i = 1; i < stmt.tokens.length; i += 1) {
          const token = stmt.tokens[i];
          if (token === void 0 || token.type === TokenType.Punctuation) break;
          if (!TOO_BROAD.has(upperSimple(token.str))) continue;
          findings.push({
            rule: KEY,
            row: token.row,
            col: token.col,
            severity: "Warning",
            message: `${token.str} swallows everything \u2014 catch the exception you can actually handle`
          });
          break;
        }
      }
      return findings;
    }
  };
}

// src/rules/colon-missing-space.ts
var KEY2 = "colon_missing_space";
function colonMissingSpaceRule() {
  return {
    key: KEY2,
    run(file) {
      const findings = [];
      file.getRawRows().forEach((row, index) => {
        const bytes = toByteView(row);
        for (let i = 0; i + 1 < bytes.length; i += 1) {
          if (bytes.charAt(i) !== ":" || bytes.charAt(i + 1) === " ") continue;
          if (insideLiteral(bytes, i)) continue;
          findings.push({
            rule: KEY2,
            row: index + 1,
            col: i + 1,
            severity: "Warning",
            message: "Put a space after the colon"
          });
          break;
        }
      });
      return findings;
    }
  };
}
function insideLiteral(bytes, position) {
  let inQuote = false;
  let inBacktick = false;
  for (let i = 0; i < position; i += 1) {
    const ch = bytes.charAt(i);
    if (ch === "'" && !inBacktick) inQuote = !inQuote;
    else if (ch === "`" && !inQuote) inBacktick = !inBacktick;
  }
  return inQuote || inBacktick;
}

// src/rules/commit-in-loop.ts
var KEY3 = "commit_in_loop";
var LOOP_OPENERS = /* @__PURE__ */ new Set(["LOOP", "DO", "WHILE"]);
var LOOP_CLOSERS = /* @__PURE__ */ new Set(["ENDLOOP", "ENDDO", "ENDWHILE"]);
function commitInLoopRule() {
  return {
    key: KEY3,
    run(file) {
      const findings = [];
      let depth = 0;
      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;
        const first = stmt.tokens[0];
        if (first === void 0) continue;
        const word = upperSimple(first.str);
        if (LOOP_OPENERS.has(word)) depth += 1;
        else if (LOOP_CLOSERS.has(word) && depth > 0) depth -= 1;
        if (depth === 0 || word !== "COMMIT") continue;
        const second = stmt.tokens[1];
        if (second === void 0 || upperSimple(second.str) !== "WORK") continue;
        findings.push({
          rule: KEY3,
          row: first.row,
          col: first.col,
          severity: "Error",
          message: "COMMIT WORK inside a loop breaks the unit of work into pieces"
        });
      }
      return findings;
    }
  };
}

// src/rules/double-space.ts
var KEY4 = "double_space";
var GO_SPACE = /* @__PURE__ */ new Set([
  9,
  10,
  11,
  12,
  13,
  32,
  133,
  160,
  5760,
  8192,
  8193,
  8194,
  8195,
  8196,
  8197,
  8198,
  8199,
  8200,
  8201,
  8202,
  8232,
  8233,
  8239,
  8287,
  12288
]);
var TRAILING_BLANK = /[ \t\r]+$/;
function doubleSpaceRule() {
  return {
    key: KEY4,
    run(file) {
      const findings = [];
      file.getRawRows().forEach((row, index) => {
        if (isCommentRow(row)) return;
        const col = firstDoubleSpace(codePart(toByteView(row)));
        if (col === null) return;
        findings.push({
          rule: KEY4,
          row: index + 1,
          col,
          severity: "Warning",
          message: "Collapse the repeated space"
        });
      });
      return findings;
    }
  };
}
function isCommentRow(row) {
  for (const ch of row) {
    const code = ch.codePointAt(0);
    if (code !== void 0 && GO_SPACE.has(code)) continue;
    return ch === "*" || ch === '"';
  }
  return false;
}
function codePart(bytes) {
  const trimmed = bytes.replace(TRAILING_BLANK, "");
  const quote = trimmed.indexOf('"');
  return quote > 0 ? trimmed.slice(0, quote) : trimmed;
}
function firstDoubleSpace(code) {
  let indentDone = false;
  for (let i = 0; i + 1 < code.length; i += 1) {
    const ch = code.charAt(i);
    if (!indentDone) {
      indentDone = ch !== " " && ch !== "	";
      continue;
    }
    if (ch === " " && code.charAt(i + 1) === " ") return i + 1;
  }
  return null;
}

// src/rules/dynamic-call-no-try.ts
var KEY5 = "dynamic_call_no_try";
function dynamicCallNoTryRule() {
  return {
    key: KEY5,
    run(file) {
      const findings = [];
      let tryDepth = 0;
      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;
        const first = stmt.tokens[0];
        if (first === void 0) continue;
        const word = upperSimple(first.str);
        if (word === "TRY") tryDepth += 1;
        else if (word === "ENDTRY" && tryDepth > 0) tryDepth -= 1;
        if (word !== "CALL") continue;
        const kind = stmt.tokens[1];
        const target = stmt.tokens[2];
        if (kind === void 0) continue;
        const called = upperSimple(kind.str);
        const dynamic = called === "METHOD" && target?.str === "(" || called === "FUNCTION" && target !== void 0 && target.type !== TokenType.StringToken;
        if (!dynamic || tryDepth > 0) continue;
        findings.push({
          rule: KEY5,
          row: first.row,
          col: first.col,
          severity: "Warning",
          message: `CALL ${called} resolves its target at runtime \u2014 wrap it in TRY so a missing target does not dump`
        });
      }
      return findings;
    }
  };
}

// src/rules/empty-statement.ts
var KEY6 = "empty_statement";
function emptyStatementRule() {
  return {
    key: KEY6,
    run(file) {
      const findings = [];
      for (const stmt of file.getStatements()) {
        if (stmt.type !== "Empty") continue;
        const token = stmt.tokens[0];
        if (token === void 0) continue;
        findings.push({
          rule: KEY6,
          row: token.row,
          col: token.col,
          severity: "Error",
          message: "Stray period \u2014 this statement carries nothing"
        });
      }
      return findings;
    }
  };
}

// src/rules/hardcoded-credentials.ts
var KEY7 = "hardcoded_credentials";
var CREDENTIAL_WORDS = [
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "auth_token",
  "access_token",
  "bearer_token",
  "refresh_token",
  "api_token"
];
var LITERAL_TYPES = /* @__PURE__ */ new Set([
  TokenType.StringToken,
  TokenType.StringTemplate,
  TokenType.StringTemplateBegin
]);
var TRIVIAL_LITERAL_BYTES = 3;
function hardcodedCredentialsRule() {
  return {
    key: KEY7,
    run(file) {
      const findings = [];
      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt) || stmt.tokens.length < 3) continue;
        const assign = stmt.tokens.findIndex((token, i) => i >= 1 && token.str === "=");
        if (assign < 1 || assign >= stmt.tokens.length - 1) continue;
        const name = stmt.tokens[assign - 1];
        const value = stmt.tokens[assign + 1];
        if (name === void 0 || value === void 0) continue;
        if (!looksLikeCredential(name.str)) continue;
        if (!LITERAL_TYPES.has(value.type)) continue;
        if (byteLength(value.str) <= TRIVIAL_LITERAL_BYTES) continue;
        findings.push({
          rule: KEY7,
          row: value.row,
          col: value.col,
          severity: "Error",
          message: `${name.str} is given a literal value \u2014 keep credentials out of the source`
        });
      }
      return findings;
    }
  };
}
function looksLikeCredential(name) {
  const lower = lowerSimple(name);
  return CREDENTIAL_WORDS.some((word) => lower.includes(word));
}

// src/rules/line-length.ts
var KEY8 = "line_length";
var DEFAULT_MAX_LINE_LENGTH = 120;
var ABSOLUTE_MAX = 255;
var FINDING_CAP = 10;
var TRAILING_CR = /\r+$/;
function lineLengthRule(maxLength = DEFAULT_MAX_LINE_LENGTH) {
  const max = maxLength > 0 ? maxLength : DEFAULT_MAX_LINE_LENGTH;
  return {
    key: KEY8,
    run(file) {
      const findings = [];
      const rows = file.getRawRows();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (row === void 0) continue;
        const width = byteLength(row.replace(TRAILING_CR, ""));
        if (width > ABSOLUTE_MAX) {
          findings.push({
            rule: KEY8,
            row: i + 1,
            col: 1,
            severity: "Error",
            message: `Line runs to ${width} bytes \u2014 ${ABSOLUTE_MAX} is the hard limit`
          });
        } else if (width > max) {
          findings.push({
            rule: KEY8,
            row: i + 1,
            col: 1,
            severity: "Warning",
            message: `Line runs to ${width} bytes \u2014 keep it within ${max}`
          });
        }
        if (findings.length >= FINDING_CAP) break;
      }
      return findings;
    }
  };
}

// src/rules/local-variable-names.ts
var KEY9 = "local_variable_names";
var OPENS_LOCAL_SCOPE = /* @__PURE__ */ new Set([
  "MethodImplementation",
  "Form",
  "FunctionModule"
]);
var CLOSES_LOCAL_SCOPE = /* @__PURE__ */ new Set([
  "EndMethod",
  "EndForm",
  "EndFunction"
]);
var LOCAL_NAME_PATTERNS = {
  data: "^[Ll][VvSsTtRrCc]_\\w+$",
  constant: "^[Ll][Cc]_\\w+$",
  fieldSymbol: "^<[Ll][VvSsTtRr]_\\w+>$"
};
function localVariableNamesRule(patterns = {}) {
  const checks = /* @__PURE__ */ new Map();
  addCheck(checks, "Data", 1, "Local variable", patterns.data);
  addCheck(checks, "Constant", 1, "Local constant", patterns.constant);
  addCheck(checks, "FieldSymbol", 2, "Field symbol", patterns.fieldSymbol);
  return {
    key: KEY9,
    run(file) {
      const findings = [];
      let inLocalScope = false;
      for (const stmt of file.getStatements()) {
        if (OPENS_LOCAL_SCOPE.has(stmt.type)) inLocalScope = true;
        else if (CLOSES_LOCAL_SCOPE.has(stmt.type)) inLocalScope = false;
        if (!inLocalScope) continue;
        const check = checks.get(stmt.type);
        if (check === void 0) continue;
        const token = stmt.tokens[check.index];
        if (token === void 0 || check.pattern.test(token.str)) continue;
        findings.push({
          rule: KEY9,
          row: token.row,
          col: token.col,
          severity: "Warning",
          message: `${check.what} name "${token.str}" is outside the agreed pattern ${check.pattern.source}`
        });
      }
      return findings;
    }
  };
}
function addCheck(into, type, index, what, pattern2) {
  if (pattern2 !== void 0 && pattern2 !== "") into.set(type, { index, what, pattern: new RegExp(pattern2, "iu") });
}

// src/rules/max-one-statement.ts
var KEY10 = "max_one_statement";
var NOT_COUNTED = /* @__PURE__ */ new Set(["Comment", "Empty", "NativeSQL"]);
function maxOneStatementRule() {
  return {
    key: KEY10,
    run(file) {
      const findings = [];
      const rowsWithEnd = /* @__PURE__ */ new Set();
      for (const stmt of file.getStatements()) {
        if (NOT_COUNTED.has(stmt.type) || stmt.colon !== null) continue;
        const first = stmt.tokens[0];
        const last = stmt.tokens[stmt.tokens.length - 1];
        if (first === void 0 || last === void 0) continue;
        if (rowsWithEnd.has(first.row)) {
          findings.push({
            rule: KEY10,
            row: first.row,
            col: first.col,
            severity: "Error",
            message: "Give this statement a line of its own"
          });
        }
        rowsWithEnd.add(last.row);
      }
      return findings;
    }
  };
}

// src/rules/obsolete-statement.ts
var KEY11 = "obsolete_statement";
var ALWAYS_OBSOLETE = /* @__PURE__ */ new Map([
  ["COMPUTE", "assign directly"],
  ["ADD", "use the += operator"],
  ["SUBTRACT", "use the -= operator"],
  ["MULTIPLY", "use the *= operator"],
  ["DIVIDE", "use the /= operator"],
  ["MOVE", "assign directly"]
]);
var REFRESH_ADVICE = "use CLEAR";
function obsoleteStatementRule(options) {
  return {
    key: KEY11,
    run(file) {
      const findings = [];
      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;
        const token = stmt.tokens[0];
        if (token === void 0) continue;
        const word = upperSimple(token.str);
        const advice = word === "REFRESH" && options.refresh ? REFRESH_ADVICE : ALWAYS_OBSOLETE.get(word);
        if (advice === void 0) continue;
        findings.push({
          rule: KEY11,
          row: token.row,
          col: token.col,
          severity: "Warning",
          message: `${word} is obsolete \u2014 ${advice}`
        });
      }
      return findings;
    }
  };
}

// src/rules/preferred-compare-operator.ts
var KEY12 = "preferred_compare_operator";
var CONDITIONALS = /* @__PURE__ */ new Set(["If", "ElseIf", "While"]);
var MODERN_FORM = /* @__PURE__ */ new Map([
  ["EQ", "="],
  ["NE", "<>"],
  ["><", "<>"],
  ["GT", ">"],
  ["LT", "<"],
  ["GE", ">="],
  ["LE", "<="]
]);
function preferredCompareOperatorRule() {
  return {
    key: KEY12,
    run(file) {
      const findings = [];
      for (const stmt of file.getStatements()) {
        if (!CONDITIONALS.has(stmt.type)) continue;
        for (const token of stmt.tokens) {
          const modern = MODERN_FORM.get(upperSimple(token.str));
          if (modern === void 0) continue;
          findings.push({
            rule: KEY12,
            row: token.row,
            col: token.col,
            severity: "Error",
            message: `Write ${modern} rather than ${token.str}`
          });
        }
      }
      return findings;
    }
  };
}

// src/rules/select-star.ts
var KEY13 = "select_star";
var SKIPPED_BEFORE_FIELDS = /* @__PURE__ */ new Set(["SINGLE", "DISTINCT"]);
function selectStarRule() {
  return {
    key: KEY13,
    run(file) {
      const findings = [];
      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;
        const first = stmt.tokens[0];
        if (first === void 0 || upperSimple(first.str) !== "SELECT") continue;
        let i = 1;
        while (i < stmt.tokens.length) {
          const token = stmt.tokens[i];
          if (token === void 0 || !SKIPPED_BEFORE_FIELDS.has(upperSimple(token.str))) break;
          i += 1;
        }
        const field = stmt.tokens[i];
        if (field === void 0 || field.str !== "*") continue;
        findings.push({
          rule: KEY13,
          row: field.row,
          col: field.col,
          severity: "Warning",
          message: "Name the columns you need instead of reading the whole row"
        });
      }
      return findings;
    }
  };
}

// src/rules/surfaces.ts
var ANALYZE_MAX_LINE_LENGTH = 130;
function lintRules(maxLength = DEFAULT_MAX_LINE_LENGTH) {
  return [
    lineLengthRule(maxLength),
    emptyStatementRule(),
    obsoleteStatementRule({ refresh: true }),
    maxOneStatementRule(),
    preferredCompareOperatorRule(),
    colonMissingSpaceRule(),
    localVariableNamesRule(LOCAL_NAME_PATTERNS)
  ];
}
function analyzeRules() {
  return [
    lineLengthRule(ANALYZE_MAX_LINE_LENGTH),
    emptyStatementRule(),
    maxOneStatementRule(),
    preferredCompareOperatorRule(),
    obsoleteStatementRule({ refresh: false }),
    colonMissingSpaceRule(),
    doubleSpaceRule(),
    localVariableNamesRule(),
    selectStarRule(),
    hardcodedCredentialsRule(),
    catchCxRootRule(),
    commitInLoopRule(),
    dynamicCallNoTryRule()
  ];
}
function runRules(rules, file) {
  return rules.flatMap((rule) => rule.run(file));
}
function analyzeSeverity(severity) {
  return severity === "Error" ? "high" : "medium";
}
var CATEGORY_BY_RULE = /* @__PURE__ */ new Map([
  ["select_star", "performance"],
  ["commit_in_loop", "performance"],
  ["hardcoded_credentials", "security"],
  ["catch_cx_root", "robustness"],
  ["dynamic_call_no_try", "robustness"]
]);
function analyzeCategory(key) {
  return CATEGORY_BY_RULE.get(key) ?? "quality";
}
function analyzeSuggestion(key) {
  return SUGGESTION_BY_RULE.get(key) ?? "";
}
var SUGGESTION_BY_RULE = /* @__PURE__ */ new Map([
  ["line_length", "Break the statement across lines so each one stays readable"],
  ["empty_statement", "Delete the stray period"],
  ["max_one_statement", "Put each statement on its own line"],
  ["preferred_compare_operator", "Switch to the symbol operators: = <> < > <= >="],
  ["obsolete_statement", "Rewrite with the modern equivalent (MOVE to assignment, ADD to +=)"],
  ["colon_missing_space", "Add a space after the colon that opens the chain"],
  ["double_space", "Leave a single space between tokens"],
  ["local_variable_names", "Name locals by the agreed prefixes (lv_, lt_, ls_, lc_)"],
  ["select_star", "List the columns the program actually reads"],
  ["hardcoded_credentials", "Read the credential from secure storage at runtime"],
  ["catch_cx_root", "Catch the specific exception classes the block can recover from"],
  ["commit_in_loop", "Commit once after the loop so one unit of work stays whole"],
  ["dynamic_call_no_try", "Wrap the dynamic call in TRY and handle CX_SY_DYN_CALL_ERROR"]
]);

// src/cli/io.ts
var import_node_fs = require("node:fs");
var InputError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
};
var STDIN_LABEL = "<stdin>";
function readSource(positionals, useStdin, usage) {
  if (useStdin) {
    if (positionals.length > 0) {
      throw new UsageError(`--stdin takes no file argument (got '${positionals.join(" ")}')`);
    }
    return { label: STDIN_LABEL, source: readStdin() };
  }
  const path = positionals[0];
  if (path === void 0) throw new UsageError(`usage: sapkit ${usage}`);
  if (positionals.length > 1) {
    throw new UsageError(`sapkit ${usage} takes exactly one file (got ${positionals.length})`);
  }
  return { label: path, source: readSourceFile(path) };
}
function readSourceFile(path) {
  try {
    return (0, import_node_fs.readFileSync)(path, "utf8");
  } catch (err) {
    throw new InputError(`cannot read '${path}': ${describe(err)}`);
  }
}
function readStdin() {
  try {
    return (0, import_node_fs.readFileSync)(0, "utf8");
  } catch (err) {
    throw new InputError(`cannot read standard input: ${describe(err)}`);
  }
}
function describe(err) {
  const code = err?.code;
  if (typeof code === "string") return code;
  return err instanceof Error ? err.message : String(err);
}

// src/cli/result.ts
var EXIT_OK = 0;
var EXIT_FINDINGS = 1;
var EXIT_USAGE = 2;

// src/cli/analyze.ts
var ANALYZE_USAGE = "analyze <file> | analyze --stdin  [--format json]";
var ANALYZE_MAX_SOURCE_BYTES = 500 * 1024;
function analyzeCommand(argv) {
  const args = parseArgs(argv, { stdin: "boolean", format: "string" });
  const format = args.str("format", "json");
  if (format !== "json") throw new UsageError(`option '--format' must be json (got '${format}')`);
  const { source } = readSource(args.positionals, args.bool("stdin"), ANALYZE_USAGE);
  return { stdout: `${JSON.stringify(analyzeSource(source), null, 2)}
`, stderr: "", code: EXIT_OK };
}
function analyzeSource(source) {
  if (Buffer.byteLength(source, "utf8") > ANALYZE_MAX_SOURCE_BYTES) return tooLarge();
  const rules = analyzeRules();
  const findings = runRules(rules, new AbapFile("source.abap", source)).map((f) => ({
    rule: f.rule,
    category: analyzeCategory(f.rule),
    severity: analyzeSeverity(f.severity),
    line: f.row,
    endLine: f.row,
    match: f.message,
    description: f.message,
    suggestion: analyzeSuggestion(f.rule)
  }));
  findings.sort((a, b) => a.line - b.line || compare(a.rule, b.rule));
  return {
    findings,
    summary: {
      totalFindings: findings.length,
      bySeverity: tally(findings.map((f) => f.severity)),
      byCategory: tally(findings.map((f) => f.category)),
      // 구 산식은 critical → warning → good 순으로 봤지만, 규칙 13종 중 `critical`을
      // 내는 것이 없어 그 갈래는 도달하지 않는다. 승계하되 도달점만 남긴다.
      score: findings.some((f) => f.severity === "high") ? "warning" : "good"
    },
    rulesApplied: rules.length
  };
}
function tooLarge() {
  const limitKb = ANALYZE_MAX_SOURCE_BYTES / 1024;
  return {
    findings: [
      {
        rule: "source_too_large",
        category: "quality",
        severity: "info",
        line: 1,
        endLine: 1,
        match: "",
        description: `Source is bigger than the ${limitKb}KB ceiling \u2014 nothing was inspected`,
        suggestion: ""
      }
    ],
    summary: {
      totalFindings: 1,
      bySeverity: { info: 1 },
      byCategory: { quality: 1 },
      score: "good"
    },
    rulesApplied: 0
  };
}
function tally(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const out = {};
  for (const key of [...counts.keys()].sort()) out[key] = counts.get(key) ?? 0;
  return out;
}
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// src/cli/check.ts
var import_node_fs2 = require("node:fs");
var CHECK_USAGE = "check <dir>";
var NAME_SUFFIXES = [".prog.abap", ".fugr.abap", ".abap"];
var PROJECT_NAMESPACE = ["Z", "Y", "$"];
var NOT_A_REFERENCE = ["STRUCTURE", "TYPE"];
function checkCommand(argv) {
  const args = parseArgs(argv, {});
  const root = readRoot(args.positionals);
  const files = listAbapFiles(root);
  const index = new Set(files.map((f) => lowerAscii(basenameOf(f))));
  const references = [];
  for (const file of files) {
    references.push(...collectIncludes(file, new AbapFile(file, readSourceFile(file)).getStatements()));
  }
  const unresolved = references.filter((ref) => !isResolved(ref.name, index));
  const defects = unresolved.filter(isDefect);
  const stdout = unresolved.map((ref) => `${formatReference(ref)}
`).join("");
  const stderr = `${root}: ${files.length} file(s), ${references.length} INCLUDE statement(s), ${unresolved.length} unresolved, ${defects.length} of them defects
`;
  return { stdout, stderr, code: defects.length > 0 ? EXIT_FINDINGS : EXIT_OK };
}
function readRoot(positionals) {
  const given = positionals[0];
  if (given === void 0) throw new UsageError(`usage: sapkit ${CHECK_USAGE}`);
  if (positionals.length > 1) {
    throw new UsageError(`sapkit ${CHECK_USAGE} takes exactly one directory (got ${positionals.length})`);
  }
  let isDirectory;
  try {
    isDirectory = (0, import_node_fs2.statSync)(given).isDirectory();
  } catch (err) {
    throw new InputError(`cannot read '${given}': ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isDirectory) throw new InputError(`'${given}' is not a directory \u2014 check inspects a project tree`);
  return given.replace(/\\/g, "/").replace(/\/+$/, "");
}
function listAbapFiles(root) {
  const out = [];
  const walk = (dir) => {
    const entries = (0, import_node_fs2.readdirSync)(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1);
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && lowerAscii(entry.name).endsWith(".abap")) out.push(path);
    }
  };
  walk(root);
  return out;
}
function collectIncludes(file, statements) {
  const out = [];
  for (const stmt of statements) {
    if (stmt.type !== "Include") continue;
    const name = stmt.tokens[1];
    if (name === void 0) continue;
    if (NOT_A_REFERENCE.includes(asciiUpper(name.str))) continue;
    out.push({ file, line: name.row, name: name.str, ifFound: hasIfFound(stmt) });
  }
  return out;
}
function hasIfFound(stmt) {
  return stmt.tokens.some((token, i) => {
    if (i < 2 || asciiUpper(token.str) !== "IF") return false;
    const next = stmt.tokens[i + 1];
    return next !== void 0 && asciiUpper(next.str) === "FOUND";
  });
}
function isResolved(name, index) {
  const base = lowerAscii(name).replace(/\//g, "#");
  return NAME_SUFFIXES.some((suffix) => index.has(`${base}${suffix}`));
}
function isDefect(ref) {
  return !ref.ifFound && PROJECT_NAMESPACE.includes(asciiUpper(ref.name).charAt(0));
}
function formatReference(ref) {
  const defect = isDefect(ref);
  const why = ref.ifFound ? "declared IF FOUND, so absence is allowed" : defect ? "the project owns the Z/Y/$ namespace, so the file belongs here" : "outside the Z/Y/$ namespace, so it is reported for information only";
  const name = asciiUpper(ref.name);
  return `${ref.file}:${ref.line}: ${defect ? "E" : "I"} [unresolved_include] INCLUDE ${name} has no file in this tree (${why})`;
}
function basenameOf(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}
function lowerAscii(s) {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : s.charAt(i);
  }
  return out;
}

// src/cli/lint.ts
var LINT_USAGE = "lint <file> | lint --stdin  [--max-length <n>]";
function lintCommand(argv) {
  const args = parseArgs(argv, { stdin: "boolean", "max-length": "number" });
  const maxLength = args.num("max-length", DEFAULT_MAX_LINE_LENGTH);
  const { label, source } = readSource(args.positionals, args.bool("stdin"), LINT_USAGE);
  const findings = runRules(lintRules(maxLength), new AbapFile(label, source));
  const errors = findings.filter((f) => f.severity === "Error").length;
  const stdout = findings.map((f) => `${formatFinding(label, f)}
`).join("");
  const stderr = findings.length === 0 ? `${label}: no findings
` : `${label}: ${findings.length} finding(s), ${errors} at Error level
`;
  return { stdout, stderr, code: errors > 0 ? EXIT_FINDINGS : EXIT_OK };
}
function formatFinding(label, finding) {
  const mark = finding.severity === "Error" ? "E" : "W";
  return `${label}:${finding.row}:${finding.col}: ${mark} [${finding.rule}] ${finding.message}`;
}

// src/cli/parse.ts
var PARSE_USAGE = "parse <file> | parse --stdin  [--format text|json|summary]";
var FORMATS = ["text", "json", "summary"];
var TEXT_TYPE_WIDTH = 20;
var SUMMARY_TYPE_WIDTH = 25;
function parseCommand(argv) {
  const args = parseArgs(argv, { stdin: "boolean", format: "string" });
  const format = readFormat(args.str("format", "text"));
  const { label, source } = readSource(args.positionals, args.bool("stdin"), PARSE_USAGE);
  const file = new AbapFile(label, source);
  const statements = file.getStatements();
  const stdout = format === "json" ? renderJson(statements) : format === "summary" ? renderSummary(label, file.getTokens().length, statements) : renderText(statements);
  return { stdout, stderr: "", code: EXIT_OK };
}
function readFormat(raw) {
  const found = FORMATS.find((f) => f === raw);
  if (found === void 0) throw new UsageError(`option '--format' must be one of ${FORMATS.join(", ")} (got '${raw}')`);
  return found;
}
function statementLine(stmt) {
  return stmt.tokens[0]?.row ?? 0;
}
function renderText(statements) {
  return statements.map((s) => `${s.type.padEnd(TEXT_TYPE_WIDTH)} ${concatTokens(s)}
`).join("");
}
function renderJson(statements) {
  const rows = statements.map((s) => ({
    type: s.type,
    line: statementLine(s),
    tokens: s.tokens.map((t) => t.str)
  }));
  return `${JSON.stringify(rows)}
`;
}
function renderSummary(label, tokenCount, statements) {
  const counts = /* @__PURE__ */ new Map();
  for (const stmt of statements) counts.set(stmt.type, (counts.get(stmt.type) ?? 0) + 1);
  const head = [`File: ${label}`, `Tokens: ${tokenCount}`, `Statements: ${statements.length}`, "---"];
  const rows = [...counts.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([type, count]) => `  ${type.padEnd(SUMMARY_TYPE_WIDTH)} ${count}`);
  return `${[...head, ...rows].join("\n")}
`;
}

// src/cli/version.ts
var SAPKIT_CLI_VERSION = "0.1.0";

// src/cli/main.ts
var USAGE = [
  "sapkit \u2014 offline ABAP inspector (no SAP connection, no MCP mode)",
  "",
  "usage:",
  `  sapkit ${LINT_USAGE}`,
  `  sapkit ${PARSE_USAGE}`,
  `  sapkit ${ANALYZE_USAGE}`,
  `  sapkit ${CHECK_USAGE}`,
  "",
  "  sapkit --help | --version",
  "",
  "exit: 0 clean \xB7 1 defects found \xB7 2 usage or input error",
  ""
].join("\n");
var COMMANDS = {
  lint: lintCommand,
  parse: parseCommand,
  analyze: analyzeCommand,
  check: checkCommand
};
function run(argv) {
  if (argv.includes("--help")) return { stdout: USAGE, stderr: "", code: EXIT_OK };
  if (argv.includes("--version")) return { stdout: `${SAPKIT_CLI_VERSION}
`, stderr: "", code: EXIT_OK };
  try {
    const name = argv[0];
    if (name === void 0) throw new UsageError("no command given");
    const command = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : void 0;
    if (command === void 0) throw new UsageError(`unknown command '${name}'`);
    return command(argv.slice(1));
  } catch (err) {
    if (err instanceof UsageError) return { stdout: "", stderr: `sapkit: ${err.message}

${USAGE}`, code: EXIT_USAGE };
    if (err instanceof InputError) return { stdout: "", stderr: `sapkit: ${err.message}
`, code: EXIT_USAGE };
    throw err;
  }
}

// src/cli/entry.ts
try {
  const result = run(process.argv.slice(2));
  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exitCode = result.code;
} catch (err) {
  process.stderr.write(`sapkit: internal error \u2014 ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
  process.exitCode = EXIT_USAGE;
}
