// Sound as bytes: what came back (by its first bytes), unpacked when it is still packed for the way, and why it
// cannot be played when it cannot.
/** What the bytes are, from their first bytes: mp3 | wav | ogg | flac | m4a | webm | gzip | zstd | text | '' (not known). */
export function audioKind(bytes) {
 const b = bytes, at = (i, ...x) => x.every((v, k) => b[i + k] === v);
 if (!b?.length) return '';
 if (at(0, 0x49, 0x44, 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
 if (at(0, 0x52, 0x49, 0x46, 0x46)) return 'wav';
 if (at(0, 0x4f, 0x67, 0x67, 0x53)) return 'ogg';
 if (at(0, 0x66, 0x4c, 0x61, 0x43)) return 'flac';
 if (at(4, 0x66, 0x74, 0x79, 0x70)) return 'm4a';
 if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'webm';
 if (at(0, 0x1f, 0x8b)) return 'gzip';
 if (at(0, 0x28, 0xb5, 0x2f, 0xfd)) return 'zstd';
 const head = [...b.subarray(0, 64)];
 if (head.every(x => x === 9 || x === 10 || x === 13 || x >= 32)) return 'text';
 return '';
}
/**
 * Sound still packed for the way: a tavern older than 2026-09 forwards Fish's /v1/tts (drama-3) as the server packed it
 * (zstd, when the browser says it takes zstd), and its proxy does not unpack that. Unpacked here when the browser can;
 * null when it cannot.
 */
export async function unpacked(bytes, kind = audioKind(bytes), Stream = globalThis.DecompressionStream) {
 if (!['gzip', 'zstd'].includes(kind) || !Stream) return null;
 try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream(kind))).arrayBuffer()); }
 catch { return null; }
}
/**
 * An MP3 from its first whole frame: some browsers (Safari) refuse an MP3 that starts with a tag or a broken frame.
 * null when there is nothing to cut.
 */
export function mp3FromFrame(bytes) {
 let i = 0;
 if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && bytes.length > 10) i = 10 + ((bytes[6] & 0x7f) << 21 | (bytes[7] & 0x7f) << 14 | (bytes[8] & 0x7f) << 7 | (bytes[9] & 0x7f)) + (bytes[5] & 0x10 ? 10 : 0);
 // A frame header: sync, MPEG version not reserved, layer III, bitrate and sample rate not reserved.
 const frame = j => bytes[j] === 0xff && (bytes[j + 1] & 0xe6) === 0xe2 && (bytes[j + 1] & 0x18) !== 0x08 && (bytes[j + 2] & 0xf0) !== 0xf0 && (bytes[j + 2] & 0xf0) !== 0 && (bytes[j + 2] & 0x0c) !== 0x0c;
 for (; i < bytes.length - 4; i++) if (frame(i)) return i ? bytes.slice(i) : null;
 return null;
}
const KIND_NAMES = {mp3: 'MP3', wav: 'WAV', ogg: 'Ogg（Opus/Vorbis）', flac: 'FLAC', m4a: 'M4A/AAC', webm: 'WebM'};
/** Why a sound could not be decoded, said by what came back. */
export function undecodable(bytes) {
 const kind = audioKind(bytes);
 if (kind === 'text') {
  const said = new TextDecoder().decode(bytes.subarray(0, 600)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return `语音接口返回的不是声音，而是一段文字：「${said}」。多半是密钥、余额、转发或模型出了问题，不是音频格式的事`;
 }
 if (kind === 'gzip' || kind === 'zstd') return `收到的声音还是压缩着的（${kind}），这个浏览器解不开：酒馆的转发把它原样传了过来，2026 年 9 月以前的酒馆会这样（drama-3 要借酒馆转发）。更新酒馆，或者在 Fish 引擎里填一个中转，就好了`;
 if (kind === 'mp3') return `收到的确实是 MP3（${Math.round(bytes.length / 1024)} KB），但这个浏览器解不开它；换成 WAV 再试，并把这条提示告诉作者`;
 if (kind === 'ogg') return '收到的是 Ogg 格式，这个浏览器（多见于旧版 iPhone）解不开：在引擎配置里改选 MP3 或 WAV';
 if (kind) return `收到的是 ${KIND_NAMES[kind]} 格式，这个浏览器解不开：在引擎配置里改选 MP3 或 WAV`;
 const hex = [...bytes.subarray(0, 12)].map(x => x.toString(16).padStart(2, '0')).join(' ');
 return `浏览器解不开收到的声音（${bytes.length} 字节，开头是 ${hex || '空的'}）：在引擎配置里改选 MP3 或 WAV 再试，仍不行把这条提示告诉作者`;
}
