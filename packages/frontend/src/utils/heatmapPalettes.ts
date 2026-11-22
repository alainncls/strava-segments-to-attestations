type Shades = readonly [string, string, string, string, string];

const EMBER: Shades = ['#fdd0a2', '#fdae6b', '#fd8d3c', '#fc5200', '#a63603'];

// Five shades per palette, lightest first.
export const PALETTES: Record<string, Shades> = {
  ember: EMBER,
  green: ['#c7e9c0', '#a1d99b', '#74c476', '#31a354', '#006d2c'],
  blue: ['#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
  purple: ['#dadaeb', '#bcbddc', '#9e9ac8', '#756bb1', '#54278f'],
  red: ['#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15'],
  teal: ['#b2e2e2', '#66c2a4', '#2ca25f', '#1b8a6b', '#006d5b'],
  grey: ['#d9d9d9', '#bdbdbd', '#969696', '#636363', '#3a3a3a'],
  viridis: ['#fde725', '#5ec962', '#21918c', '#3b528b', '#482878'],
  magma: ['#fcd9a4', '#fc8961', '#b73779', '#721f81', '#4b1590'],
  inferno: ['#f6e86a', '#f98e09', '#bc3754', '#781c6d', '#5a1080'],
  plasma: ['#f0f921', '#f89540', '#cc4778', '#7e03a8', '#4c02a1'],
  cividis: ['#fee838', '#c3b369', '#7c7b78', '#4a5a6f', '#1f3a6e'],
  gold: ['#fee391', '#fec44f', '#fe9929', '#d95f0e', '#993404'],
  pink: ['#fcc5c0', '#fa9fb5', '#f768a1', '#c51b8a', '#7a0177'],
  ocean: ['#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494'],
  forest: ['#d9f0a3', '#addd8e', '#78c679', '#31a354', '#006837'],
  sunset: ['#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'],
  berry: ['#d4b9da', '#c994c7', '#df65b0', '#dd1c77', '#980043'],
  sky: ['#c6e2f7', '#91c8ef', '#4fa3e0', '#1f78c1', '#0b4f8a'],
  lime: ['#e6f598', '#c2e15f', '#99c72e', '#6a9a16', '#3f6b06'],
  coral: ['#ffd1c4', '#ffa38a', '#ff7452', '#e0472a', '#a32a14'],
  indigo: ['#c5cae9', '#9fa8da', '#7986cb', '#3f51b5', '#283593'],
};

export const DEFAULT_PALETTE = 'ember';

// Day with no activity, and future day. Literal values: the exported image has no CSS.
export const EMPTY_CELL = { light: '#e4e4e8', dark: '#232327' } as const;

// On a dark background the lightest shade stands out most, so it marks the busiest days.
export function shadesFor(name: string, dark: boolean): readonly string[] {
  const shades = PALETTES[name] ?? EMBER;
  return dark ? [...shades].reverse() : shades;
}
