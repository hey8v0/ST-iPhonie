// The little of MessagePack NovelAI's image stream uses: read only, maps as plain objects, bin as Uint8Array.
export function unpack(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), text = new TextDecoder();
  let at = 0;
  const need = n => { if (at + n > bytes.length) throw Error('MessagePack 数据不完整'); };
  const str = n => { need(n); const s = text.decode(bytes.subarray(at, at + n)); at += n; return s; };
  const bin = n => { need(n); const b = bytes.slice(at, at + n); at += n; return b; };
  const list = n => { const out = []; for (let i = 0; i < n; i++) out.push(read()); return out; };
  const map = n => { const out = {}; for (let i = 0; i < n; i++) { const key = read(); out[String(key)] = read(); } return out; };
  const num = (size, get) => { need(size); const v = get(at); at += size; return v; };
  const u8 = () => num(1, p => view.getUint8(p)), u16 = () => num(2, p => view.getUint16(p)), u32 = () => num(4, p => view.getUint32(p));
  function read() {
    const b = u8();
    if (b < 0x80) return b;
    if (b < 0x90) return map(b & 0x0f);
    if (b < 0xa0) return list(b & 0x0f);
    if (b < 0xc0) return str(b & 0x1f);
    if (b >= 0xe0) return b - 256;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(u8());
      case 0xc5: return bin(u16());
      case 0xc6: return bin(u32());
      case 0xc7: { const n = u8(); at += 1; return bin(n); }
      case 0xc8: { const n = u16(); at += 1; return bin(n); }
      case 0xc9: { const n = u32(); at += 1; return bin(n); }
      case 0xca: return num(4, p => view.getFloat32(p));
      case 0xcb: return num(8, p => view.getFloat64(p));
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xcf: return Number(num(8, p => view.getBigUint64(p)));
      case 0xd0: return num(1, p => view.getInt8(p));
      case 0xd1: return num(2, p => view.getInt16(p));
      case 0xd2: return num(4, p => view.getInt32(p));
      case 0xd3: return Number(num(8, p => view.getBigInt64(p)));
      case 0xd4: at += 1; return bin(1);
      case 0xd5: at += 1; return bin(2);
      case 0xd6: at += 1; return bin(4);
      case 0xd7: at += 1; return bin(8);
      case 0xd8: at += 1; return bin(16);
      case 0xd9: return str(u8());
      case 0xda: return str(u16());
      case 0xdb: return str(u32());
      case 0xdc: return list(u16());
      case 0xdd: return list(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
      default: throw Error('MessagePack 数据不对');
    }
  }
  return read();
}
