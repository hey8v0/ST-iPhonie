// A whole reply as one audio file: each line's audio decoded to mono at one sample rate, put one after another with a
// short pause, and written as a 16-bit WAV (plays everywhere, no encoder needed). Only audio that already exists is used.

export const JOIN_RATE = 44100;
const FADE = 0.006; // seconds faded in and out at each clip's edges, so the joins do not click

/** Mono samples of a decoded buffer (channels averaged). */
export function mono(buffer) {
  const channels = buffer.numberOfChannels, out = new Float32Array(buffer.length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / channels;
  }
  return out;
}

/** Decodes an audio blob with the page's decoder, resampled to `rate`, as mono samples. */
export async function decodeMono(win, blob, rate = JOIN_RATE) {
  const Offline = win.OfflineAudioContext || win.webkitOfflineAudioContext;
  if (!Offline) throw Error('这个浏览器不支持拼接音频');
  try { return mono(await new Offline(1, 1, rate).decodeAudioData(await blob.arrayBuffer())); }
  catch { throw Error('有一段音频读不出来，没法拼接'); }
}

/** Clips one after another with `gap` seconds of silence between them. */
export function joinClips(clips, rate = JOIN_RATE, gap = 0.45) {
  const pause = Math.round(gap * rate), fade = Math.max(1, Math.round(FADE * rate));
  const out = new Float32Array(clips.reduce((n, c) => n + c.length, 0) + pause * Math.max(0, clips.length - 1));
  let at = 0;
  clips.forEach((clip, k) => {
    const edge = Math.min(fade, Math.floor(clip.length / 2));
    for (let i = 0; i < clip.length; i++) {
      const gain = i < edge ? i / edge : i >= clip.length - edge ? (clip.length - 1 - i) / edge : 1;
      out[at + i] = clip[i] * gain;
    }
    at += clip.length + (k < clips.length - 1 ? pause : 0);
  });
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples, rate = JOIN_RATE) {
  const data = samples.length * 2, view = new DataView(new ArrayBuffer(44 + data));
  const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + data, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view.buffer], {type: 'audio/wav'});
}

/** One line's audio from its parts (said in parts because the service takes no more at once), a short breath between. */
export async function joinAudio(blobs, win = globalThis, rate = 24000) {
  const clips = [];
  for (const blob of blobs) clips.push(await decodeMono(win, blob, rate));
  return encodeWav(joinClips(clips, rate, 0.2), rate);
}
