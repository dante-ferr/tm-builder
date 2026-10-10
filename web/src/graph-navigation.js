// Keep the diagram in a fixed viewport so navigation also works when it fits.
export const FOLLOW_ZOOM = 0.85;

export function mountGraphNavigation(graph, signal, onFollowStop = () => {}) {
  let svg = null, scale = 1, offsetX = 0, offsetY = 0;
  let followedNode = null;
  function stopFollowing(manual = false) {
    const wasFollowing = Boolean(followedNode);
    followedNode = null;
    if (manual && wasFollowing) onFollowStop();
  }
  function centerFollowedNode() {
    if (!svg || !followedNode) return;
    const bounds = followedNode.getBBox();
    const point = svg.createSVGPoint();
    point.x = bounds.x + bounds.width / 2;
    point.y = bounds.y + bounds.height / 2;
    // Graphviz places states inside a translated graph group. Convert back to
    // root SVG coordinates before applying our viewport transform.
    const center = point.matrixTransform(followedNode.getCTM()).matrixTransform(svg.getCTM().inverse());
    offsetX = graph.clientWidth / 2 - (center.x - svg.viewBox.baseVal.x) * scale;
    offsetY = graph.clientHeight / 2 - (center.y - svg.viewBox.baseVal.y) * scale;
    updateView();
  }
  function updateView() {
    if (!svg) return;
    const {width, height} = svg.viewBox.baseVal;
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  function fit() {
    if (!svg) return;
    const {width, height} = svg.viewBox.baseVal;
    scale = Math.min(2, Math.max(.02, Math.min((graph.clientWidth - 60) / width, (graph.clientHeight - 60) / height)));
    offsetX = (graph.clientWidth - width * scale) / 2;
    offsetY = (graph.clientHeight - height * scale) / 2;
    updateView();
  }
  function zoom(factor, anchorX, anchorY) {
    if (!svg) return;
    const rect = graph.getBoundingClientRect();
    const x = anchorX === undefined ? graph.clientWidth / 2 : anchorX - rect.left;
    const y = anchorY === undefined ? graph.clientHeight / 2 : anchorY - rect.top;
    const nextScale = Math.max(.02, Math.min(20, scale * factor));
    const ratio = nextScale / scale;
    offsetX = x - (x - offsetX) * ratio;
    offsetY = y - (y - offsetY) * ratio;
    scale = nextScale;
    if (followedNode) centerFollowedNode();
    else updateView();
  }
  const navigationEvents = {signal};
  graph.addEventListener('wheel', event => {
    if (!svg || !event.deltaY) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? graph.clientHeight : 1);
    zoom(Math.exp(-Math.max(-1000, Math.min(1000, delta)) / 500), event.clientX, event.clientY);
  }, {...navigationEvents, passive: false});
  let pan = null;
  function stopPan() {
    const pointerId = pan?.pointerId;
    pan = null;
    graph.classList.remove('panning');
    if (pointerId !== undefined && graph.hasPointerCapture(pointerId)) graph.releasePointerCapture(pointerId);
  }
  graph.addEventListener('pointerdown', event => {
    if (!svg || event.button !== 1) return;
    event.preventDefault();
    graph.focus({preventScroll: true});
    pan = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: offsetX, top: offsetY};
    graph.setPointerCapture(event.pointerId);
    graph.classList.add('panning');
  }, navigationEvents);
  graph.addEventListener('pointermove', event => {
    if (!pan || event.pointerId !== pan.pointerId) return;
    if (!(event.buttons & 4)) { stopPan(); return; }
    if (followedNode && event.clientX === pan.x && event.clientY === pan.y) return;
    stopFollowing(true);
    offsetX = pan.left + event.clientX - pan.x;
    offsetY = pan.top + event.clientY - pan.y;
    updateView();
  }, navigationEvents);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    graph.addEventListener(event, stopPan, navigationEvents);
  window.addEventListener('blur', stopPan, navigationEvents);
  graph.addEventListener('auxclick', event => {
    if (event.button === 1) event.preventDefault();
  }, navigationEvents);
  graph.addEventListener('keydown', event => {
    if (!svg || event.ctrlKey || event.metaKey || event.altKey) return;
    const directions = {
      ArrowLeft: [40, 0], a: [40, 0], A: [40, 0],
      ArrowRight: [-40, 0], d: [-40, 0], D: [-40, 0],
      ArrowUp: [0, 40], w: [0, 40], W: [0, 40],
      ArrowDown: [0, -40], s: [0, -40], S: [0, -40],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    stopFollowing(true);
    offsetX += direction[0];
    offsetY += direction[1];
    updateView();
  }, navigationEvents);
  return {
    fit() { stopFollowing(true); fit(); },
    resize() { if (followedNode) centerFollowedNode(); else fit(); },
    zoom,
    startFollowing(node) {
      if (!svg || !node) return;
      stopPan();
      followedNode = node;
      scale = FOLLOW_ZOOM;
      centerFollowedNode();
    },
    follow(node) { if (followedNode && node) { followedNode = node; centerFollowedNode(); } },
    stopFollowing,
    setDiagram(diagram) { stopPan(); stopFollowing(); svg = diagram; fit(); },
    stopPan,
  };
}
