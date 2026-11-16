// One resource per key while an app is open. Reads share their in-flight promise;
// a read finishing after disposal must not create another browser resource.
export function objectURLs(win) {
  const urls = new Map(), pending = new Map(), owned = new Set();
  let closed = false;
  return {
    get: id => urls.get(id),
    load(id, read) {
      if (closed) return Promise.resolve('');
      if (urls.has(id)) return Promise.resolve(urls.get(id));
      if (pending.has(id)) return pending.get(id);
      const work = Promise.resolve().then(read).then(value => {
        if (closed) return '';
        const url = !value ? '' : typeof value === 'string' ? value : win.URL.createObjectURL(value);
        if (url && typeof value !== 'string') owned.add(url);
        urls.set(id, url);
        return url;
      }).finally(() => pending.delete(id));
      pending.set(id, work);
      return work;
    },
    dispose() {
      closed = true;
      for (const url of owned) win.URL.revokeObjectURL(url);
      owned.clear(); urls.clear(); pending.clear();
    },
  };
}
