// HMR brand palette — the three colours of the HMR logo
// (src/assets/hmr-logo.png): navy blue, orange and white. The Home page
// and its module cards use only these; lighter/darker shades are the same
// colours at lower opacity, never a fourth hue.
export const BRAND_BLUE = "#0b2a5b";
export const BRAND_ORANGE = "#f97316";
export const BRAND_WHITE = "#ffffff";

// Opacity variants (same hues).
export const blueA = (a) => `rgba(11, 42, 91, ${a})`;
export const orangeA = (a) => `rgba(249, 115, 22, ${a})`;
export const whiteA = (a) => `rgba(255, 255, 255, ${a})`;
