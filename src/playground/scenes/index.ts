/* Scenes and props for the playground: the seven scenes as an engine layer, weather over them, and the ball's picture.
 * Creatures, petting and play plug in beside them (see ../index.ts). */
export { SceneLayer, paintSceneCanvas, surface, withProps, type SceneLayerOptions, type WorldBand } from './layer';
export { WeatherLayer, type WeatherKind } from './weather';
export { AmbientLayer, showerNight, type Life } from './ambient';
export { ballPicture } from './ball';
export { SparkleLayer } from './sparkle';
export { BossLayer, bossScale, decodeShape, type BossShape } from './boss';
export { LanternLayer } from './lantern';
export { FireworksLayer } from './fireworks';
export { FindsLayer, type FindPicture, type FindsShown } from './finds';
export { paintScene, NO_GROWTH, treeCount, patchCount, TREE_EVERY, MAX_TREES, TREE_GROWS, GIANT_AT, PATCH_EVERY, MAX_PATCHES, WATER_AT, STREAK_ACHIEVEMENT_DAYS, waterStage, type Growth, type GrowthMark, type SceneLayout, type Frame, type SceneOptions } from './paint';
export { STABLE_STAGES } from './house';
export { SCENES, SCENE_IDS, toner, type SceneId, type ScenePalette, type Light } from './palettes';
export { timeOfDay, seasonOf, southernRegion, moonPhase, moonAge, MOON_NAMES, type TimeOfDay, type Season, type MoonPhase } from './clock';
export { ART } from './pixels';
export { InteriorLayer, StallRow, type Stall } from './barn';
export { LAMPLIT, STALL_W } from './interior';
