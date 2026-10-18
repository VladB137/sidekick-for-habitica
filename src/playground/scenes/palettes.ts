/* Colours: one palette per scene, the shared nature colours, and how the light of the hour (and of the
 * Dailies) shifts them. The values are the approved Stable design spec's. */
import { mix } from './pixels';
import type { Season, TimeOfDay } from './clock';

export type SceneId = 'meadow' | 'lake' | 'pine' | 'cove' | 'bamboo' | 'marsh' | 'mushroom';
export type TreeKind = 'oak' | 'willow' | 'pine' | 'palm' | 'bamboo' | 'cypress' | 'shroom';
export type HouseStyle = 'barn' | 'boathouse' | 'cabin' | 'hut' | 'pagoda' | 'stilt' | 'shroom';

export interface ScenePalette {
  name: string;
  /** three sky bands, top to horizon */
  sky: [string, string, string];
  /** far and near rolling hills on the horizon (scenes without them have water there) */
  hill?: string; hill2?: string;
  /** ground base, speckle, speckle highlight */
  ground: [string, string, string];
  path: string;
  /** where things touch the ground */
  shadow: string;
  /** deep, shallow, glint */
  water?: [string, string, string];
  shore?: string;
  rock?: [string, string, string];
  tree: TreeKind;
  house: HouseStyle;
  /** the flowers Perfect Days grow (or the scene's own kind) */
  blooms: string[];
}

export const SCENES: Record<SceneId, ScenePalette> = {
  meadow: { name: 'Meadow', sky: ['#8FD3F4', '#A6DDF6', '#C2E8F9'], hill: '#7CC576', hill2: '#6AB565', ground: ['#5FAE4E', '#4E9A3F', '#3D7F31'], path: '#C9A26B', shadow: '#3B7A2E', tree: 'oak', house: 'barn', blooms: ['#FF6F91', '#FFD166', '#F4F1FF', '#B39DDB'] },
  lake: { name: 'Lakeside', sky: ['#9FC9E6', '#B7D7EE', '#D3E6F3'], ground: ['#7DB86A', '#69A458', '#548E46'], path: '#B9A07A', shadow: '#4A8240', water: ['#2F79B5', '#4E95CC', '#C3E2F5'], shore: '#3C6E48', tree: 'willow', house: 'boathouse', blooms: ['#FFB3C8', '#FFFFFF'] },
  pine: { name: 'Pine hill', sky: ['#6FA8DA', '#8FBCE3', '#B9D5EE'], hill: '#7C9C8E', hill2: '#678879', ground: ['#5E8F63', '#4C7C52', '#3B6842'], path: '#9E8C74', shadow: '#33583A', rock: ['#9AA4A8', '#7A8488', '#5B6468'], tree: 'pine', house: 'cabin', blooms: ['#F4F1FF', '#B39DDB', '#FFD166'] },
  cove: { name: 'Sandy cove', sky: ['#5FC6EE', '#85D5F3', '#B8E9FA'], ground: ['#F0DCA8', '#E2C78E', '#CDAE72'], path: '#D2B47A', shadow: '#C09D62', water: ['#1C8DB8', '#33AED6', '#D8F4FC'], tree: 'palm', house: 'hut', blooms: ['#F8D7C4', '#E9A98C'] },
  bamboo: { name: 'Bamboo grove', sky: ['#CFE8D6', '#DDF0E1', '#ECF7EE'], hill: '#A9D3B0', hill2: '#8EC197', ground: ['#4F8F4A', '#417C3D', '#336631'], path: '#B7B09A', shadow: '#2C5A2A', tree: 'bamboo', house: 'pagoda', blooms: ['#FFFFFF', '#FFC9D6'] },
  marsh: { name: 'Misty marsh', sky: ['#8E9E98', '#A3B1AA', '#BCC7C0'], hill: '#6F806F', hill2: '#5F705F', ground: ['#5C6B3D', '#4D5B33', '#3E4A29'], path: '#6E6448', shadow: '#333D22', water: ['#3D5A50', '#557567', '#9FB8AA'], tree: 'cypress', house: 'stilt', blooms: ['#8A5A2E', '#C9D88A'] },
  mushroom: { name: 'Mushroom glade', sky: ['#2B2F6B', '#3D3F86', '#5B57A3'], hill: '#3F6E7A', hill2: '#33606B', ground: ['#3D7F6E', '#33705F', '#285E4F'], path: '#8C7AA8', shadow: '#1F4A3E', tree: 'shroom', house: 'shroom', blooms: ['#7CF5E8', '#FFE66D', '#FF8FD0'] },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

export const NATURE = {
  outline: '#1F2D1A',
  trunk: ['#8A5A33', '#6B4325', '#4E3019'],
  leaf: ['#62C266', '#3F9B4A', '#2F7F3B', '#245F2D'],
  /** broadleaf trees in autumn */
  autumn: ['#F2A541', '#D9822B', '#B5651D', '#8A4B16'],
  moss: '#7DA34A',
  snow: ['#EEF3F8', '#DCE6EF', '#C9D6E2'],
  snowCap: '#F2F6FA',
  wood: '#A1774F', wood2: '#7B5A3A', post: '#4E3A26',
};

/** How the light of the moment colours everything: night is deep blue, dusk violet, dawn warm. In the day,
 * open Dailies give a soft morning haze; all of them done gives the full sun (the palette as it is). */
export interface Light { tod: TimeOfDay, season: Season, dailiesDone: boolean }

export function toner (l: Light): (col: string) => string {
  if (l.tod === 'night') return c => mix(c, '#121838', 0.64);
  if (l.tod === 'dusk') return c => mix(c, '#5B3A6B', 0.28);
  if (l.tod === 'dawn') return c => mix(c, '#FFB27A', 0.12);
  if (!l.dailiesDone) return c => mix(c, '#FFF1DC', 0.12);
  return c => c;
}
