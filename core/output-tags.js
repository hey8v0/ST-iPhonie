// Apply only to shipped templates. User rules and history are kept verbatim.
export function pictureTemplate(settings, text, key, block = 'draw-story') {
  if (!settings.general?.shortTags || settings.promptRules?.[block]?.parts?.[key] !== undefined) return text;
  return text.replaceAll('<img>', '<i-img>').replaceAll('</img>', '</i-img>');
}
