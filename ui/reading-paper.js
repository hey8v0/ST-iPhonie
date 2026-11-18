// Keep the part of the rectangle on one side of a moving crease.
function clippedPage(corners, distance) {
  const result = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const da = distance(a), db = distance(b);
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}

export function paperTurn(win, pane, article, page, step) {
  const doc = pane.ownerDocument, sheet = doc.createElement('div');
  sheet.className = 'reading-leaf';
  sheet.dataset.direction = step > 0 ? 'next' : 'prev';
  sheet.setAttribute('aria-hidden','true'); sheet.inert = true;
  const front = doc.createElement('div'), back = doc.createElement('div');
  front.className = 'reading-leaf-front'; back.className = 'reading-leaf-back';
  const face = article.cloneNode(true);
  face.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  face.style.transition = 'none';
  const width = pane.clientWidth, height = pane.clientHeight;
  face.style.transform = `translateX(${-page * width}px)`;
  front.append(face); sheet.append(front,back); pane.append(sheet);
  const corners = [[0,0],[width,0],[width,height],[0,height]];
  let progress = 0, frame = 0, done;
  const polygon = points => points.length < 3 ? 'polygon(0 0,0 0,0 0)' :
    'polygon(' + points.map(([x,y]) => x.toFixed(2)+'px '+y.toFixed(2)+'px').join(',') + ')';
  function move(value) {
    progress = Math.max(0,Math.min(1,value));
    // A slightly angled fold narrows to a vertical edge at either end of the gesture.
    const angle = .12 * Math.sin(Math.PI * progress);
    const nx = Math.cos(angle) * Math.sign(step), ny = Math.sin(angle);
    const start = step > 0 ? width : 0;
    const k = start - width * progress + ny * height / 2;
    const distance = ([x,y]) => nx*x + ny*y - k;
    front.style.clipPath = polygon(clippedPage(corners,distance));
    const folded = clippedPage(corners,p => -distance(p)).map(p => {
      const d = 2 * distance(p);
      return [p[0]-d*nx,p[1]-d*ny];
    });
    back.style.clipPath = polygon(folded);
    // The crease carries the highlight with it; the exposed reverse grows darker toward its free edge.
    const crease = k + Math.max(0,-nx*width) + Math.max(0,-ny*height);
    back.style.backgroundImage = `linear-gradient(${Math.atan2(nx,-ny)*180/Math.PI}deg,transparent ${crease-14}px,#0002 ${crease}px,transparent ${crease+1}px)`;
  }
  function remove() { win.cancelAnimationFrame(frame); sheet.remove(); done?.(); done = null; }
  move(0);
  return {step,move,remove,attach:nextPane=>nextPane.append(sheet),finish(commit) {
    const from = progress, to = commit ? 1 : 0, start = win.performance.now();
    const ms = 110 + 205 * Math.abs(to-from);
    return new Promise(resolve => {
      done = resolve;
      function advance(now) {
        const t = Math.min(1,(now-start)/ms);
        move(from + (to-from)*(1-(1-t)**3));
        if (t===1) remove(); else frame=win.requestAnimationFrame(advance);
      }
      frame=win.requestAnimationFrame(advance);
    });
  }};
}
