export function browserSpeech(win) {
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  return Recognition?.available && win.AudioContext && 'processLocally' in Recognition.prototype ? Recognition : null;
}

export async function transcribeInBrowser(win, blob, signal, lang = 'zh-CN') {
  const Recognition = browserSpeech(win);
  if (!Recognition) throw Error('这个浏览器未提供设备端转写。可使用转写服务或手动填写。');
  const audio = new win.AudioContext();
  let track, source, recognition;
  try {
    await audio.resume();
    const settings = {langs:[lang], processLocally:true};
    const status = await Recognition.available(settings);
    if (signal.aborted) throw signal.reason;
    if (['downloadable', 'downloading'].includes(status)) {
      if (!Recognition.install || !await Recognition.install(settings)) throw Error('浏览器语言包未能安装，可重试或使用转写服务。');
    } else if (status !== 'available') throw Error('浏览器没有此语言的设备端转写能力。');
    const data = await audio.decodeAudioData(await blob.arrayBuffer());
    if (signal.aborted) throw signal.reason;
    const destination = audio.createMediaStreamDestination();
    track = destination.stream.getAudioTracks()[0];
    if (!track) throw Error('浏览器无法读取这段录音的音轨。');
    source = audio.createBufferSource();
    source.buffer = data;
    source.connect(destination);
    recognition = new Recognition();
    recognition.lang = lang;
    recognition.processLocally = true;
    recognition.continuous = true;
    return await new Promise((resolve, reject) => {
      const words = [];
      const abort = () => finish(signal.reason);
      function finish(error) {
        signal.removeEventListener('abort', abort);
        recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
        source.onended = null;
        const text = words.join('').trim();
        if (error || !text) reject(error || Error('浏览器没有识别出文字，可重试或使用转写服务。'));
        else resolve(text.slice(0, 4000));
      }
      signal.addEventListener('abort', abort, {once:true});
      recognition.onstart = () => { try { source.start(); } catch (error) { finish(error); } };
      source.onended = () => recognition.stop();
      recognition.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) words[i] = event.results[i][0].transcript;
        }
      };
      recognition.onerror = event => finish(Error(`浏览器转写未完成（${event.error}），可重试或使用转写服务。`));
      recognition.onend = () => finish();
      try { recognition.start(track); } catch (error) { finish(error); }
    });
  } finally {
    try { recognition?.abort(); } catch {}
    try { source?.stop(); } catch {}
    track?.stop();
    await audio.close().catch(() => {});
  }
}
