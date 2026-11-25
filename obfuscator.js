/**
 * Velum Luau Obfuscator - Final
 * Maximum practical protection in pure JavaScript
 * Multi-layer VM • Integrity • Anti-analysis
 */

class LuauObfuscator {
  constructor() {
    this.key = this._bytes(40);
    this.bc = [];
    this.consts = [];
    this.map = new Map();
  }

  obfuscate(src) {
    src = String(src || "").trim();
    if (!src) return "";

    this._compile(src);

    // 4-layer encryption
    let data = this.bc;
    for (let layer = 0; layer < 4; layer++) {
      data = this._encrypt(data, layer);
    }

    const hash = this._hash(data);
    const encConsts = this.consts.map(c =>
      typeof c === "string" ? this._encStr(c) : c
    );

    return this._vm(data, encConsts, hash);
  }

  // ====================== COMPILER ======================

  _compile(src) {
    this.bc = [];
    this.consts = [];
    this.map.clear();

    const sIdx = this._const(src);
    const lIdx = this._const("loadstring");

    this._op("NOP");
    this._op("JUNK");
    this._op("LOADK", 0, sIdx);
    this._op("LOADK", 1, lIdx);
    this._op("GETGLOBAL", 1, 1);
    this._op("MOVE", 2, 0);
    this._op("CALL", 1, 1, 2);
    this._op("JUNK");
    this._op("JUNK2");
    this._op("CALL", 1, 0, 0);
    this._op("RETURN", 0, 1);

    this._floodJunk();
  }

  _op(name, a = 0, b = 0, c = 0) {
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
    this.bc.push(O[name] ?? 0x00, a & 255, b & 255, c & 255);
  }

  _floodJunk() {
    const out = [];
    for (let i = 0; i < this.bc.length; i += 4) {
      if (Math.random() < 0.6) {
        const t = ["JUNK", "JUNK2", "JUNK3", "JUNK4", "NOP"][Math.random() * 5 | 0];
        out.push(this._opVal(t), Math.random() * 220 | 0, Math.random() * 220 | 0, Math.random() * 220 | 0);
      }
      if (Math.random() < 0.2) {
        out.push(this._opVal("TEST"), Math.random() * 40 | 0, 0, 0);
        out.push(this._opVal("JMP"), Math.random() * 4 | 0, 0, 0);
      }
      out.push(this.bc[i], this.bc[i + 1], this.bc[i + 2], this.bc[i + 3]);
    }
    this.bc = out;
  }

  _opVal(n) {
    const m = { NOP: 0x00, JUNK: 0xA1, JUNK2: 0xA2, JUNK3: 0xA3, JUNK4: 0xA4, TEST: 0x6A, JMP: 0x66 };
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

  // ====================== ENCRYPTION ======================

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

  // ====================== VM ======================

  _vm(encBC, encConsts, expectHash) {
    const k = this.key;
    const cLit = encConsts.map(c =>
      Array.isArray(c) ? `{${c.join(",")}}` : JSON.stringify(c)
    ).join(",");

    return `--[[ Velum Ultimate ]]
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
  if getrawmetatable then
    local mt=getrawmetatable(game)
    if mt and rawget(mt,"__namecall") then end
  end
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

  _bytes(n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(Math.random() * 256 | 0);
    return a;
  }
}

// Export for browser & Node
if (typeof window !== "undefined") window.LuauObfuscator = LuauObfuscator;
if (typeof module !== "undefined" && module.exports) module.exports = LuauObfuscator;
