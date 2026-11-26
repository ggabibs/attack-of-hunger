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
  "width": 2605,
  "height": 1215,
  "frames": {
    "titan_cinza_idle": {
      "x": 6,
      "y": 6,
      "w": 237,
      "h": 641
    },
    "titan_laranja_idle": {
      "x": 255,
      "y": 6,
      "w": 339,
      "h": 1081
    },
    "titan_colossal_idle": {
      "x": 606,
      "y": 6,
      "w": 426,
      "h": 1203
    },
    "titan_cinza_eat": {
      "x": 1038,
      "y": 6,
      "w": 237,
      "h": 641
    },
    "titan_laranja_eat": {
      "x": 1281,
      "y": 6,
      "w": 339,
      "h": 1081
    },
    "titan_colossal_eat": {
      "x": 1626,
      "y": 6,
      "w": 426,
      "h": 1203
    },
    "titan_armored_eat": {
      "x": 2058,
      "y": 6,
      "w": 249,
      "h": 636
    },
    "titan_beast_eat": {
      "x": 2313,
      "y": 6,
      "w": 292,
      "h": 532
    }
  }
};
});
