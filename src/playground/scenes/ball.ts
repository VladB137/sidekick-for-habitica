/* The ball's picture in a scene: the spec's 7 x 7 art-pixel ball, toned like the scene around it (night,
 * dusk, morning haze). Its physics and chasing are the creatures' (../ball.ts); the Herd draws it with this. */
import { ART, stamp } from './pixels';
import { surface, type SceneLayer, type Surface } from './layer';
import type { Ctx } from '../world';

const ROWS = ['..ooo..', '.orrwo.', 'orrrwwo', 'orrwwbo', 'oyywwbo', '.oyybo.', '..ooo..'];
const COLOURS: Record<string, string> = { o: '#3A2A2A', r: '#EF5350', w: '#FFFFFF', b: '#42A5F5', y: '#FFCA28' };
const SIZE = ROWS.length * ART;

function picture (tone: (c: string) => string): Surface {
  const col: Record<string, string> = {};
  for (const k in COLOURS) col[k] = tone(COLOURS[k]);
  // stamp at art size, then scale up without smoothing
  const small = surface(ROWS.length, ROWS.length);
  stamp(small.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ROWS, 0, 0, col);
  const c = surface(SIZE, SIZE);
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, SIZE, SIZE);
  return c;
}

/** A draw function for the Herd's ball (`ball: { draw }`): one picture per light, kept. `before` draws under it (the
 * playground's rim, play/hint.ts). */
export function ballPicture (scene: SceneLayer, before?: (g: Ctx, img: Surface, x: number, y: number) => void): (g: Ctx, x: number, y: number) => void {
  const looks = new Map<string, Surface>();
  return (g, x, y) => {
    const light = scene.lightKey();
    let img = looks.get(light);
    if (!img) { img = picture(c => scene.tone(c)); looks.set(light, img); }
    before?.(g, img, x, y);
    g.drawImage(img, 0, 0, SIZE, SIZE, x, y, SIZE, SIZE);
  };
}
