/* The playground's rendering core (look-free). Scenery, creatures and pet picking plug in as separate modules:
 *   scenery   -> Layer (world.addLayer)           creatures -> Entity (world.add), behaviour in update()
 *   touch     -> Interaction (mountStage option)  sprites   -> SpriteSource (the sprite catalogue)
 * The creatures (Herd) are entities plus a front layer for their particles, with their own Interaction. */
export { World, type Layer, type Entity, type Box, type Ctx } from './world';
export { mountStage, type Stage, type StageOptions, type Interaction, type WorldPoint } from './stage';
export { fitGrid, fitBacking, toWorld, type Fit, type FitOptions } from './grid';
export { FrameGate, FPS, TICK_MS } from './frame';
export { Gestures, TAP_SLOP_PX, LONG_PRESS_MS } from './gestures';
export { Rng, hashSeed } from './rng';
export { alphaMask, placeholderSprites, type Sprite, type SpriteSource, type Gait, type Facing } from './sprites';
export { Herd, Creature, Avatar, motionOf, DUSK, BEDTIME, MORNING, type Resident, type RiderLayer, type HerdOptions, type Motion } from './creatures';
export { Ball, BALL_SIZE, drawSpecBall, type BallOptions } from './ball';
export { ART, type Particle, type ParticleKind } from './particles';
export { traitById, traitIds, particleLook, looksOf } from './behaviours';
export type { Nature, Trait, Act, Pose, Emit, When, Now, Schedule, Nap, Pace, Mood, Like, Spot, SpotKind, ParticleLook } from './behaviours/types';
