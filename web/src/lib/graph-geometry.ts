/** Convert through screen space so SVG group and CSS camera transforms cancel. */
export function boundsInSvg(svg: SVGSVGElement, node: SVGGraphicsElement): {x: number; y: number; width: number; height: number} {
  const bounds = node.getBBox();
  const nodeToScreen = node.getScreenCTM(), svgToScreen = svg.getScreenCTM();
  if (!nodeToScreen || !svgToScreen) throw new Error('Cannot locate the selected graph item.');
  const screenToSvg = svgToScreen.inverse();
  const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]]
    .map(([x, y]) => {
      const point = svg.createSVGPoint(); point.x = x; point.y = y;
      return point.matrixTransform(nodeToScreen).matrixTransform(screenToSvg);
    });
  const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y));
  return {x, y, width: Math.max(...corners.map(point => point.x)) - x,
    height: Math.max(...corners.map(point => point.y)) - y};
}
export function centerInSvg(svg: SVGSVGElement, node: SVGGraphicsElement): {x: number; y: number} {
  const bounds = boundsInSvg(svg, node);
  return {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2};
}
