/**
 * Velum Luau Obfuscator
 * Two modes:
 *  - "standard" : Powerful non-VM obfuscation (smaller & faster)
 *  - "maximum"  : Full custom VM protection
 */

class LuauObfuscator {
  constructor(options = {}) {
    this.mode = options.mode === "maximum" ? "maximum" : "standard";
    this.key = this._bytes(32);
    this.varMap = new Map();
    this.counter = 0;
    this.reserved = new Set([
      "and","break","do","else","elseif","end","false","for","function",
      "goto","if","in","local","nil","not","or","repeat","return","then",
      "true","until","while","game","workspace","script","Instance","Vector3",
      "CFrame","Color3","UDim2","Enum","typeof","pairs","ipairs","next",
      "pcall","xpcall","type","tostring","tonumber","print","warn","error",
      "require","rawget","rawset","rawequal","select","unpack","table",
      "string","math","bit32","coroutine","debug","os","utf8","shared","_G",
      "tick","time","wait","spawn","delay","task","getfenv","setfenv"
    ]);
  }

  obfuscate(src) {
    src = String(src || "").trim();
    if (!src) return "";

    if (this.mode === "maximum") {
      return this._obfuscateVM(src);
    }
    return this._obfuscateStandard(src);
  }

  // =====================================================
  // STANDARD MODE (No VM) - Simple yet powerful
  // =====================================================

  _obfuscateStandard(code) {
    code = this._stripComments(code);
    code = this._encryptStrings(code);
    code = this._renameLocals(code);
    code = this._obfuscateNumbers(code);
    code = this._insertJunk(code);
    code = this._wrapControlFlow(code);
    return this._standardWrapper(code);
  }

  _stripComments(code) {
    return code
      .replace(/--\[\[[\s\S]*?\]\]/g, "")
      .replace(/--[^\n]*/g, "")
      .replace(/\n{3,}/g, "\n\n");
  }

  _encryptStrings(code) {
    return code.replace(/(["'])(?:\\.|(?!\1).)*?\1/g, (match) => {
      if (match.length <= 3) return match;

      let content = match.slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");

      const encrypted = [];
      for (let i = 0; i < content.length; i++) {
        const k = this.key[i % this.key.length];
        encrypted.push(content.charCodeAt(i) ^ k ^ ((i * 13) & 255));
      }

      return `_S({${encrypted.join(",")}})`;
    });
  }

  _renameLocals(code) {
    const localRegex = /\blocal\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)/g;

    code = code.replace(localRegex, (full, names) => {
      const newNames = names.split(",").map(n => {
        n = n.trim();
        if (this.reserved.has(n)) return n;
        if (!this.varMap.has(n)) {
          this.varMap.set(n, this._genName());
        }
        return this.varMap.get(n);
      });
      return "local " + newNames.join(",");
    });

    for (const [original, renamed] of this.varMap) {
      const re = new RegExp(`\\b${this._escape(original)}\\b`, "g");
      code = code.replace(re, renamed);
    }

    return code;
  }

  _obfuscateNumbers(code) {
    return code.replace(/\b(\d{2,})\b/g, (match, num) => {
      const n = parseInt(num, 10);
      if (!Number.isFinite(n) || n < 8 || n > 5000000) return match;

      const variants = [
        `(${n ^ 0x5A} + ${0x5A})`,
        `bit32.bxor(${n ^ 0x3C},${0x3C})`,
        `(${Math.floor(n / 2)}*2${n % 2 === 1 ? "+1" : ""})`,
        `select(-1,${n},${n})`
      ];

      return variants[Math.floor(Math.random() * variants.length)];
    });
  }

  _insertJunk(code) {
    const junk = [
      "local _j=math.random();if _j>2.1 then end",
      "pcall(function()end)",
      "do local _t={1,2};_t=nil end",
      "if false then error('x') end",
      "local _x=0;for _i=1,2 do _x=_x+_i end",
      "local function _n()end;_n=nil"
    ];

    const lines = code.split("\n");
    const out = [];

    for (const line of lines) {
      out.push(line);
      if (line.trim().length > 10 && Math.random() < 0.27) {
        out.push(junk[Math.floor(Math.random() * junk.length)]);
      }
    }
    return out.join("\n");
  }

  _wrapControlFlow(code) {
    return `local _s=0
while true do
  if _s==0 then
${code}
    _s=1
  elseif _s==1 then
    break
  end
end`;
  }

  _standardWrapper(code) {
    const k = this.key;
    return `--[[ Velum Standard ]]
local function _S(t)
  local k={${k.join(",")}}
  local r=""
  for i=1,#t do
    r=r..string.char(bit32.bxor(t[i],k[(i-1)%#k+1],bit32.band(i*13,255)))
  end
  return r
end

if not game or not game.GetService then return end
local _ok=pcall(function() return game:GetService("RunService") end)
if not _ok then return end

${code}
`;
  }

  // =====================================================
  // MAXIMUM MODE (Full VM)
  // =====================================================

  _obfuscateVM(src) {
    this.bc = [];
    this.consts = [];
    this.map = new Map();

    this._compileVM(src);

    let data = this.bc;
    for (let layer = 0; layer < 4; layer++) {
      data = this._encrypt(data, layer);
    }

    const hash = this._hash(data);
    const encConsts = this.consts.map(c =>
      typeof c === "string" ? this._encStr(c) : c
    );

    return this._buildVM(data, encConsts, hash);
  }

  _compileVM(src) {
    this.bc = [];
    this.consts = [];
    this.map.clear();

    const sIdx = this._const(src);
    const lIdx = this._const("loadstring");

    this._emit("NOP");
    this._emit("JUNK");
    this._emit("LOADK", 0, sIdx);
    this._emit("LOADK", 1, lIdx);
    this._emit("GETGLOBAL", 1, 1);
    this._emit("MOVE", 2, 0);
    this._emit("CALL", 1, 1, 2);
    this._emit("JUNK");
    this._emit("JUNK2");
    this._emit("CALL", 1, 0, 0);
    this._emit("RETURN", 0, 1);

    this._floodJunk();
  }

  _emit(op, a = 0, b = 0, c = 0) {
    const O = {
      NOP: 0x00, MOVE: 0x11, LOADK: 0x22, LOADBOOL: 0x23, LOADNIL: 0x24,
      GETGLOBAL: 0x33, SETGLOBAL: 0x34, GETTABLE: 0x35, SETTABLE: 0x36,
      ADD: 0x44, SUB: 0x45, MUL: 0x46, DIV: 0x47,
      CALL: 0x55, RETURN: 0x56, TAILCALL: 0x57,
      JMP: 0x66, EQ: 0x67, LT: 0x68, LE: 0x69, TEST: 0x6A,
      CLOSURE: 0x77, SELF: 0x78,
      JUNK: 0xA1, JUNK2: 0xA2, JUNK3: 0xA3, JUNK4: 0xA4,
      TRAP: 0xFE, HALT: 0xFF
    };
    this.bc.push(O[op] ?? 0x00, a & 255, b & 255, c & 255);
  }

  _floodJunk() {
    const out = [];
    for (let i = 0; i < this.bc.length; i += 4) {
      if (Math.random() < 0.55) {
        const t = ["JUNK", "JUNK2", "JUNK3", "JUNK4", "NOP"][Math.random() * 5 | 0];
        out.push(this._opVal(t), Math.random() * 220 | 0, Math.random() * 220 | 0, Math.random() * 220 | 0);
      }
      out.push(this.bc[i], this.bc[i + 1], this.bc[i + 2], this.bc[i + 3]);
    }
    this.bc = out;
  }

  _opVal(n) {
    const m = { NOP: 0x00, JUNK: 0xA1, JUNK2: 0xA2, JUNK3: 0xA3, JUNK4: 0xA4 };
    return m[n] || 0;
  }

  _const(v) {
    const k = typeof v + "|" + v;
    if (this.map.has(k)) return this.map.get(k);
    const i = this.consts.length;
    this.consts.push(v);
    this.map.set(k, i);
    return i;
  }

  _encrypt(data, layer) {
    const out = new Array(data.length);
    const k = this.key;
    for (let i = 0; i < data.length; i++) {
      let x = data[i];
      x ^= k[(i + layer * 19) % k.length];
      x = (x + i * 17 + layer * 47) & 255;
      x = this._rotl(x, (i + layer * 5) % 8);
      x ^= (i * 23 + layer * 31) & 255;
      x = this._rotl(x, layer % 5);
      out[i] = x;
    }
    return out;
  }

  _encStr(s) {
    const r = [];
    for (let i = 0; i < s.length; i++) {
      let x = s.charCodeAt(i);
      x ^= this.key[i % this.key.length];
      x = (x + i * 19) & 255;
      x ^= (i * 37) & 255;
      x = this._rotl(x, i % 7);
      r.push(x);
    }
    return r;
  }

  _hash(arr) {
    let h = 0x811c9dc5;
    for (let i = 0; i < arr.length; i++) {
      h ^= arr[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  _rotl(x, n) {
    n %= 8;
    return ((x << n) | (x >>> (8 - n))) & 255;
  }

  _buildVM(encBC, encConsts, expectHash) {
    const k = this.key;
    const cLit = encConsts.map(c =>
      Array.isArray(c) ? `{${c.join(",")}}` : JSON.stringify(c)
    ).join(",");

    return `--[[ Velum Maximum ]]
local _K={${k.join(",")}}

local function _D(t,l)
  local r={}
  for i=1,#t do
    local x=t[i]
    x=bit32.rrotate(x,l%5)
    x=bit32.bxor(x,(i*23+l*31)%256)
    x=bit32.rrotate(x,(i+l*5)%8)
    x=(x-(i*17+l*47))%256
    x=bit32.bxor(x,_K[(i+l*19)%#_K+1])
    r[i]=x
  end
  return r
end

local function _S(t)
  local r=""
  for i=1,#t do
    local x=t[i]
    x=bit32.rrotate(x,i%7)
    x=bit32.bxor(x,(i*37)%256)
    x=(x-i*19)%256
    x=bit32.bxor(x,_K[(i-1)%#_K+1])
    r=r..string.char(x)
  end
  return r
end

local _B={${encBC.join(",")}}
for l=3,0,-1 do _B=_D(_B,l) end

local h=0x811c9dc5
for i=1,#_B do
  h=bit32.bxor(h,_B[i])
  h=bit32.band(Math.imul(h,0x01000193),0xFFFFFFFF)
end
if h~=${expectHash} then return end

local _C={${cLit}}
for i=1,#_C do if type(_C[i])=="table" then _C[i]=_S(_C[i]) end end

local _R=table.create(320)
local _P=1
local _O,_A,_B,_C
local _T=0
local _ST=0

local function _chk()
  if type(game)~="userdata" and type(game)~="table" then return false end
  if not game.GetService then return false end
  local ok=pcall(function()
    local rs=game:GetService("RunService")
    if not rs then error() end
  end)
  if not ok then return false end
  return true
end
if not _chk() then return end

local function _VM()
  while true do
    _T=_T+1
    if _ST==0 then
      _ST = (bit32.band(_T,5)==0 and math.random()<0) and 2 or 1
    elseif _ST==2 then
      _ST=1
    end

    _O=_B[_P]
    _A=_B[_P+1]
    _B=_B[_P+2]
    _C=_B[_P+3]
    _P=_P+4

    if _O==0x00 or _O==0xA1 or _O==0xA2 or _O==0xA3 or _O==0xA4 then
      if _T%8==3 then local __=_T end
    elseif _O==0xFE then
      if math.random()>1.15 then error("protected") end
    elseif _O==0xFF then
      return
    elseif _O==0x11 then
      _R[_A+1]=_R[_B+1]
    elseif _O==0x22 then
      _R[_A+1]=_C[_B+1]
    elseif _O==0x33 then
      local e=getfenv and getfenv() or _ENV
      _R[_A+1]=e[_C[_B+1]]
    elseif _O==0x55 then
      local f=_R[_A+1]
      local n=_B
      local a={}
      for i=1,n do a[i]=_R[_A+1+i] end
      local r={f(table.unpack(a,1,n))}
      for i=1,#r do _R[_A+i]=r[i] end
    elseif _O==0x56 then
      return
    else
      if _T%11==7 then
        local x=0
        for i=1,3 do x=x+i end
      end
    end

    if _T%7==2 then
      local t={_T,_P}
      t=nil
    end
  end
end

_VM()
`;
  }

  // ====================== UTILS ======================

  _genName() {
    const pool = ["I", "l", "O", "0", "o"];
    let name = "_";
    const len = 4 + (this.counter % 3);
    for (let i = 0; i < len; i++) {
      name += pool[Math.floor(Math.random() * pool.length)];
    }
    return name + (this.counter++);
  }

  _bytes(n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(Math.random() * 256 | 0);
    return a;
  }

  _escape(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Export
if (typeof window !== "undefined") window.LuauObfuscator = LuauObfuscator;
if (typeof module !== "undefined" && module.exports) module.exports = LuauObfuscator;
