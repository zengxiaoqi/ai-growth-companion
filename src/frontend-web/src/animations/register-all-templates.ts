/**
 * Import all animation templates to trigger their side-effect registration.
 * This file is imported by AnimationRenderer AFTER the registry Map is initialized,
 * avoiding the "Cannot access before initialization" TDZ error.
 */
import './templates/language/character-stroke';
import './templates/language/word-reveal';
import './templates/language/story-scene';
import './templates/math/counting-objects';
import './templates/math/shape-builder';
import './templates/math/number-line';
import './templates/math/abacus';
import './templates/science/water-cycle';
import './templates/science/day-night-cycle';
import './templates/science/plant-growth';
import './templates/science/seasons-cycle';
import './templates/art/color-mixing';
import './templates/art/drawing-steps';
import './templates/social/emotion-faces';
import './templates/social/daily-routine';
