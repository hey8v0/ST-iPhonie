import test from 'node:test';
import assert from 'node:assert/strict';
import {checkWorkflow, fillWorkflow, workflowPlaceholders} from '../core/image-engines.js';

const graph = (positive, negative = '%negative_prompt%') => JSON.stringify({
  139: {class_type: 'CLIPTextEncode', inputs: {text: positive, clip: ['197:145', 0]}},
  140: {class_type: 'CLIPTextEncode', inputs: {text: negative, clip: ['197:145', 0]}},
  '197:145': {class_type: 'CLIPLoader', inputs: {clip_name: 'example.safetensors'}}
});

test('imports an API workflow whose prompt fields have extra quotes', () => {
  const normalized = checkWorkflow(graph('"%prompt%"', '"%negative_prompt%"'));
  const data = JSON.parse(normalized);
  assert.equal(data[139].inputs.text, '%prompt%');
  assert.equal(data[140].inputs.text, '%negative_prompt%');
  assert.deepEqual(workflowPlaceholders(normalized).sort(), ['negative_prompt', 'prompt']);
  const filled = JSON.parse(fillWorkflow(normalized, {prompt: 'smiling "cat"', negative_prompt: 'blurry'}));
  assert.equal(filled[139].inputs.text, 'smiling "cat"');
  assert.equal(filled[140].inputs.text, 'blurry');
  assert.deepEqual(filled[139].inputs.clip, ['197:145', 0]);
});

test('leaves already valid API workflows unchanged', () => {
  const original = graph('%prompt%');
  assert.equal(checkWorkflow(original), original);
});

test('only changes whole quoted placeholders, not prompt prose or model inputs', () => {
  const original = JSON.stringify({
    1: {class_type: 'CLIPTextEncode', inputs: {text: "'%prompt%'", note: 'Write "%prompt%" on paper'}},
    2: {class_type: 'UNETLoader', inputs: {unet_name: 'models\\anima.safetensors'}}
  });
  const data = JSON.parse(checkWorkflow(original));
  assert.equal(data[1].inputs.text, '%prompt%');
  assert.equal(data[1].inputs.note, 'Write "%prompt%" on paper');
  assert.equal(data[2].inputs.unet_name, 'models\\anima.safetensors');
});

test('still rejects a workflow without a positive placeholder', () => {
  assert.throws(() => checkWorkflow(graph('plain tags')), /工作流里没有 %prompt%/);
});

test('still rejects editor-only and invalid JSON', () => {
  assert.throws(() => checkWorkflow('{'), /有效的 JSON/);
  assert.throws(() => checkWorkflow(JSON.stringify({nodes: [], links: []})), /界面格式/);
});
