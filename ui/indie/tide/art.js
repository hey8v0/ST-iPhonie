// Shared prop images, decoded once. A failed asset keeps its procedural fallback.
const FILES = {lighthouse:'lighthouse.webp',office:'post-office.webp',tree:'coastal-tree.webp',cottage:'coastal-cottage.webp',boat:'postal-boat.webp'};
export function loadTideArt(win) {
 const images = Object.create(null);
 const ready = Promise.all(Object.entries(FILES).map(([id,file]) => new Promise(resolve => {
  const image = new win.Image(); image.decoding = 'async';
  image.onload = async () => { try { await image.decode(); } catch {} images[id] = image; resolve(true); };
  image.onerror = () => resolve(false);
  image.src = new URL('./assets/'+file, import.meta.url).href;
 })));
 return {images,ready};
}
