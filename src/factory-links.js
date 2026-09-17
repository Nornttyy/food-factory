// One port contract shared by simulation, line drawing and conveyor rendering.
export const LINK_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const opposite = direction => (direction + 2) % 4;
export function directionBetween(from, to) {
  return LINK_DIRS.findIndex(([dx, dy]) => to.x - from.x === dx && to.y - from.y === dy);
}
export function outputDirections(building) {
  if (!building || building.type === 'depot') return [];
  return building.type === 'splitter' ? [building.dir, (building.dir + 1) % 4] : [building.dir];
}
export function acceptsSide(building, side) {
  if (!building || side < 0 || side > 3 || ['flour_hopper', 'fruit_hopper'].includes(building.type)) return false;
  return !outputDirections(building).includes(side);
}
export function canLink(from, to) {
  if (!from || !to) return false;
  const dir = directionBetween(from, to);
  return dir >= 0 && outputDirections(from).includes(dir) && acceptsSide(to, opposite(dir));
}
export function connectedPorts(building, at) {
  return LINK_DIRS.flatMap(([dx, dy], side) => {
    const neighbor = at(building.x + dx, building.y + dy);
    if (canLink(building, neighbor)) return [{ side, output: true }];
    if (canLink(neighbor, building)) return [{ side, output: false }];
    return [];
  });
}
export function nextBeltCell(from, target, building) {
  const candidates = [];
  if (target.x !== from.x) candidates.push({ x: from.x + Math.sign(target.x - from.x), y: from.y });
  if (target.y !== from.y) candidates.push({ x: from.x, y: from.y + Math.sign(target.y - from.y) });
  // Fast diagonal strokes must leave a machine along its fixed outlet first.
  const exits = building && building.type !== 'belt' ? outputDirections(building) : [];
  return candidates.find(cell => exits.includes(directionBetween(from, cell))) || candidates[0] || null;
}
export function conveyorPorts(building, at) {
  const outputs = outputDirections(building);
  const incoming = connectedPorts(building, at).filter(port => !port.output).map(port => port.side);
  // Only a completely unconnected belt needs a default rear inlet for its icon.
  // A real side inlet replaces that stub, so an L stays an L instead of a T.
  const inputs = incoming.length ? incoming : [opposite(building.dir)];
  const ports = [...new Set([...inputs, ...outputs])];
  const blockedEnds = ports.filter(dir => {
    const [dx, dy] = LINK_DIRS[dir], neighbor = at(building.x + dx, building.y + dy);
    return neighbor && !(outputs.includes(dir) ? canLink(building, neighbor) : canLink(neighbor, building));
  });
  return { inputs, outputs, incoming, ports, blockedEnds };
}
