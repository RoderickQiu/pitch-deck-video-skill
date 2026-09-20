// Colours come from shots.json -> theme, so the cards match whatever app is
// being filmed. Pull these from the app's own design tokens.
import shots from '../shots.json';

export const C = shots.theme.colors;
export const FONT = shots.theme.fonts;
