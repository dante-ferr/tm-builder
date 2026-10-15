import assert from 'node:assert/strict';
import {test} from 'node:test';
import {boundsInSvg, centerInSvg} from '../src/lib/graph-geometry';

class Matrix {
  constructor(readonly scale: number, readonly x: number, readonly y: number) {}
  inverse() {return new Matrix(1 / this.scale, -this.x / this.scale, -this.y / this.scale);}
}
function point(x = 0, y = 0) {
  return {x, y, matrixTransform(matrix: Matrix) {return point(this.x * matrix.scale + matrix.x, this.y * matrix.scale + matrix.y);}};
}
test('graph anchors cancel camera zoom and pan without dropping the Graphviz group translation', () => {
  for (const scale of [.1, 1, 3.5, 20]) {
    const camera = new Matrix(scale, -140, 80);
    const svg = {createSVGPoint: () => point(), getScreenCTM: () => camera,
      getCTM: () => {throw new Error('Local CTMs cannot be mixed with CSS camera coordinates.');}} as unknown as SVGSVGElement;
    const node = {getBBox: () => ({x: 10, y: -80, width: 40, height: 60}),
      getScreenCTM: () => new Matrix(scale, 21 * scale - 140, 141 * scale + 80)} as unknown as SVGGraphicsElement;
    const center = centerInSvg(svg, node), bounds = boundsInSvg(svg, node);
    assert.ok(Math.abs(center.x - 51) < 1e-9);
    assert.ok(Math.abs(center.y - 91) < 1e-9);
    assert.ok(Math.abs(bounds.height - 60) < 1e-9);
  }
});
