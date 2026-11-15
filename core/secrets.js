// Redact complete values before shortening text; shortening first can leave a recognizable key prefix.
export const credentialField = name => /^(?:authorization|cookie|set-cookie|password|passwd|secret|client_secret|key|api[-_]?key|token|(?:access|refresh|id)[-_]?token|code[-_]?verifier|csrf(?:[-_]?token)?)$/i.test(name);
const query = text => String(text).replace(/([?&]([^=&#\s]+)=)([^&#\s]*)/g, (all, prefix, name) => {
  try { name = decodeURIComponent(name); } catch {}
  return credentialField(name) ? prefix + '[已隐藏]' : all;
});
export function redactSecrets(text, keys = []) {
  let out = String(text ?? '').replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [已隐藏]');
  for (const key of keys.filter(k => typeof k === 'string' && k)) out = out.split(key).join('[已隐藏]').split(encodeURIComponent(key)).join('[已隐藏]');
  out = query(out);
  // Tavern proxy targets may encode the complete URL, including its query separators and parameter names.
  out = out.replace(/(\/proxy\/)([^\s"'<>]+)/gi, (_all, prefix, target) => {
    let decoded = target;
    for (let n = 0; n < 3; n++) { try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } catch { break; } }
    const clean = query(decoded);
    return prefix + (clean === decoded ? target : encodeURIComponent(clean));
  });
  return out;
}
