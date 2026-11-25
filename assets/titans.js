/* Attack of Hunger — second sprite atlas: selectable playable titans (user-provided artwork). */
(function (root, factory) {
  'use strict';
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.HungerTitans = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
  "src": "./assets/titans.png",
  "width": 1126,
  "height": 1165,
  "frames": {
    "titan_cinza_idle": {
      "x": 6,
      "y": 6,
      "w": 436,
      "h": 1153
    },
    "titan_cinza_eat": {
      "x": 6,
      "y": 6,
      "w": 436,
      "h": 1153
    },
    "titan_carmesim_idle": {
      "x": 454,
      "y": 6,
      "w": 315,
      "h": 1096
    },
    "titan_carmesim_eat": {
      "x": 454,
      "y": 6,
      "w": 315,
      "h": 1096
    },
    "titan_laranja_idle": {
      "x": 781,
      "y": 6,
      "w": 339,
      "h": 1081
    },
    "titan_laranja_eat": {
      "x": 781,
      "y": 6,
      "w": 339,
      "h": 1081
    }
  }
};
});
