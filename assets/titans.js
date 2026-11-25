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
  "width": 927,
  "height": 1108,
  "frames": {
    "titan_cinza_idle": {
      "x": 6,
      "y": 6,
      "w": 237,
      "h": 641
    },
    "titan_cinza_eat": {
      "x": 6,
      "y": 6,
      "w": 237,
      "h": 641
    },
    "titan_carmesim_idle": {
      "x": 255,
      "y": 6,
      "w": 315,
      "h": 1096
    },
    "titan_carmesim_eat": {
      "x": 255,
      "y": 6,
      "w": 315,
      "h": 1096
    },
    "titan_laranja_idle": {
      "x": 582,
      "y": 6,
      "w": 339,
      "h": 1081
    },
    "titan_laranja_eat": {
      "x": 582,
      "y": 6,
      "w": 339,
      "h": 1081
    }
  }
};
});
