
import { Wall, Vector2D } from '../types';

export function checkCircleRectCollision(
  circlePos: Vector2D,
  radius: number,
  rect: Wall
): boolean {
  // Find the closest point on the rectangle to the center of the circle
  const closestX = Math.max(rect.x, Math.min(circlePos.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circlePos.y, rect.y + rect.height));

  // Calculate the distance between the circle's center and this closest point
  const distanceX = circlePos.x - closestX;
  const distanceY = circlePos.y - closestY;

  // If the distance is less than the circle's radius, an intersection occurs
  const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
  return distanceSquared < (radius * radius);
}

export function isCollidingWithAnyWall(
  pos: Vector2D,
  radius: number,
  walls: Wall[]
): boolean {
  return walls.some(wall => checkCircleRectCollision(pos, radius, wall));
}
