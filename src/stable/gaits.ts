/**
 * How each Habitica creature moves in the Stable, tagged by eye from its sprite (habitica-images, see
 * src/data/sprites.json), with the five gait tags of the Stable design spec (Vlad agreed 2026-10-14):
 *   four-legged  four legs down, body level: trots (the only gait that walks)
 *   sitting      sitting, rearing, on two legs, six or eight legs: hops
 *   leaping      drawn mid-leap (Deer, Cheetah): bounds
 *   legless      no legs to walk on (fish, blobs, objects): scoots
 *   flying       drawn in the air or on spread wings: hovers
 * Facing = the body's direction as drawn, tail to head. A 3/4 view that looks at the viewer (the Wolf pet)
 * still points one way, and that decides the mirror; `front` is only for sprites with no direction (an egg,
 * a cactus, a crab), which never mirror.
 * Pets and mounts are separate drawings (mounts are side views, mostly pointing left), so each has its own table.
 * A species missing here falls back to `sitting` (hops), which never looks wrong; tests/sprites.test.ts
 * lists any untagged species so a new one gets a look.
 */
export type Gait = 'four-legged' | 'sitting' | 'leaping' | 'legless' | 'flying';
export type Facing = 'left' | 'right' | 'front';
type Tag = [Gait, Facing];

const Q = 'four-legged'; const S = 'sitting'; const J = 'leaping'; const L = 'legless'; const F = 'flying';
const R = 'right'; const W = 'left'; const C = 'front';

export const PET_GAITS: Record<string, Tag> = {
  Alligator: [Q, R], Alpaca: [Q, R], Armadillo: [Q, R], Axolotl: [S, R], Badger: [Q, R], Bear: [Q, R],
  BearCub: [S, R], Beetle: [S, R], Bunny: [S, R], Butterfly: [F, R], Cactus: [L, C], Cat: [S, R],
  Chameleon: [S, R], Cheetah: [J, R], Cow: [Q, R], Crab: [S, C], Cuttlefish: [L, R], Deer: [J, R],
  Dog: [S, R], Dolphin: [L, R], Dragon: [S, R], Egg: [L, C], Falcon: [S, R], Ferret: [Q, R],
  FlyingPig: [F, R], Fox: [Q, R], Frog: [S, C], Giraffe: [Q, R], Gryphatrice: [S, R], Gryphon: [S, R],
  GuineaPig: [L, R], Hedgehog: [Q, R], Hippo: [Q, R], Hippogriff: [Q, R], Horse: [Q, R], JackOLantern: [L, C],
  Jackalope: [S, R], Kangaroo: [S, R], Lion: [Q, R], LionCub: [S, R], MagicalBee: [F, R], Mammoth: [Q, R],
  MantisShrimp: [S, C], Monkey: [S, R], Nudibranch: [L, R], Octopus: [L, C], Orca: [L, R], Otter: [S, W],
  Owl: [S, C], PandaCub: [S, R], Parrot: [F, R], Peacock: [S, R], Penguin: [S, R], Phoenix: [F, R],
  Platypus: [S, R], Pterodactyl: [F, R], Raccoon: [S, W], Rat: [S, R], Robot: [S, C], Rock: [L, R],
  Rooster: [S, R], Sabretooth: [S, R], SeaSerpent: [L, R], Seahorse: [L, R], Sheep: [Q, R], Slime: [L, C],
  Sloth: [S, R], Snail: [L, R], Snake: [L, C], Spider: [S, C], Squirrel: [S, R], TRex: [S, R],
  Tiger: [S, R], TigerCub: [Q, R], Treeling: [S, C], Triceratops: [Q, R], Turkey: [S, R], Turtle: [Q, R],
  Unicorn: [Q, R], Velociraptor: [S, R], Whale: [L, R], Wolf: [Q, R], Yarn: [L, C],
};

/** Potions that redraw the pet as an object or a new creature (wacky and some premium ones): they win over the species. */
export const PET_POTION_GAITS: Record<string, Gait> = {
  Dessert: L, Veggie: L, VirtualPet: L, TeaShop: L, Fungi: L, Balloon: F, Alien: S, Cryptid: S,
};
/** Those redrawn shapes point every which way, so they never mirror. */
export const PET_POTION_FACING: Record<string, Facing> = {
  Dessert: C, Veggie: C, VirtualPet: C, TeaShop: C, Fungi: C, Alien: C, Cryptid: C,
};

/** Single pets drawn unlike their species or potion. */
export const PET_KEY_GAITS: Record<string, Gait> = {
  'FlyingPig-Alien': F, 'FlyingPig-Cryptid': F, 'Wolf-Cryptid': L, 'Dragon-Cryptid': L, 'Cactus-Cryptid': L,
  'Dragon-Koi': L, 'Cactus-Koi': L, 'Fox-Veteran': S, 'Wolf-Veteran': S, 'Wolf-Cerberus': Q, 'Dragon-Hydra': S,
};
export const PET_KEY_FACING: Record<string, Facing> = { 'Wolf-Cerberus': C, 'Dragon-Hydra': C };

export const MOUNT_GAITS: Record<string, Tag> = {
  Alligator: [S, W], Alpaca: [Q, W], Armadillo: [Q, W], Axolotl: [Q, W], Badger: [Q, W], BearCub: [Q, W],
  Beetle: [S, W], Bunny: [S, W], Butterfly: [F, W], Cactus: [Q, W], Cat: [S, W], Chameleon: [Q, W],
  Cheetah: [Q, W], Cow: [Q, W], Crab: [S, W], Cuttlefish: [L, W], Deer: [Q, W], Dog: [Q, W],
  Dolphin: [L, W], Dragon: [F, W], Egg: [L, C], Falcon: [F, W], Ferret: [Q, W], FlyingPig: [F, W],
  Fox: [Q, W], Frog: [S, W], Giraffe: [Q, W], Gryphon: [Q, W], GuineaPig: [L, W], Hedgehog: [Q, W],
  Hippo: [Q, W], Hippogriff: [Q, W], Horse: [Q, W], JackOLantern: [L, C], Jackalope: [S, W], Kangaroo: [S, W],
  LionCub: [Q, W], MagicalBee: [F, W], Mammoth: [Q, W], MantisShrimp: [S, C], Monkey: [Q, W], Nudibranch: [L, W],
  Octopus: [L, W], Orca: [L, W], Otter: [Q, W], Owl: [F, C], PandaCub: [Q, W], Parrot: [S, W],
  Peacock: [S, W], Penguin: [L, W], Phoenix: [F, W], Platypus: [Q, W], Pterodactyl: [F, C], Raccoon: [Q, W],
  Rat: [S, W], Robot: [Q, W], Rock: [L, W], Rooster: [S, W], Sabretooth: [Q, W], SeaSerpent: [L, W],
  Seahorse: [L, W], Sheep: [Q, W], Slime: [L, W], Sloth: [S, W], Snail: [L, W], Snake: [L, W],
  Spider: [S, C], Squirrel: [S, W], TRex: [S, W], TigerCub: [Q, W], Treeling: [S, C], Triceratops: [Q, W],
  Turkey: [S, W], Turtle: [S, W], Unicorn: [Q, W], Velociraptor: [S, W], Whale: [L, W], Wolf: [Q, W],
  Yarn: [L, W],
};

export const MOUNT_KEY_GAITS: Record<string, Gait> = { 'Fox-Koi': S, 'Dragon-Hydra': S, 'Gryphon-Gryphatrice': S };

/** Species that stay awake at night instead of sleeping by the stable. */
export const NOCTURNAL = new Set(['Owl']);

export function gaitOf (kind: 'pet' | 'mount', key: string): { gait: Gait, facing: Facing, nocturnal: boolean, tagged: boolean } {
  const [species, potion] = key.split('-');
  const tag = (kind === 'pet' ? PET_GAITS : MOUNT_GAITS)[species];
  const gait = kind === 'pet'
    ? PET_KEY_GAITS[key] ?? PET_POTION_GAITS[potion] ?? tag?.[0]
    : MOUNT_KEY_GAITS[key] ?? tag?.[0];
  const facing = (kind === 'pet' ? PET_KEY_FACING[key] ?? PET_POTION_FACING[potion] : undefined) ?? tag?.[1] ?? (kind === 'pet' ? 'right' : 'left');
  return { gait: gait ?? 'sitting', facing, nocturnal: NOCTURNAL.has(species), tagged: !!tag };
}
