const {endianness} = require('node:os');
const maxFrame = 512 * 1024;
const little = endianness() === 'LE';

function writeFrame(stream, message) {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > maxFrame) throw new Error('frame-too-large');
  const frame = Buffer.alloc(4 + body.length);
  if (little) frame.writeUInt32LE(body.length);
  else frame.writeUInt32BE(body.length);
  body.copy(frame, 4);
  return stream.write(frame);
}

function readFrames(stream, receive, fail) {
  let buffer = Buffer.alloc(0);
  let failed = false;
  stream.on('data', chunk => {
    if (failed) return;
    buffer = Buffer.concat([buffer, chunk]);
    try {
      while (buffer.length >= 4) {
        const size = little ? buffer.readUInt32LE() : buffer.readUInt32BE();
        if (!size || size > maxFrame) throw new Error('invalid-frame');
        if (buffer.length < size + 4) return;
        const message = JSON.parse(buffer.toString('utf8', 4, size + 4));
        buffer = buffer.subarray(size + 4);
        receive(message);
      }
    } catch {
      failed = true;
      fail();
    }
  });
}

module.exports = {writeFrame, readFrames};
