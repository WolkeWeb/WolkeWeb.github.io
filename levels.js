// Levels: # Block, ^ Spike, o Jump-Pad, O Orb, . leer. Letzte Zeile = Boden, Tilegröße 40px (siehe game.js)
// | = Ziel (Spalte 66, 4 Tiles hoch)
const E = '.'.repeat(70);
const G = s => s.padEnd(70, '.').slice(0, 66) + '|' + s.padEnd(70, '.').slice(67);
const LEVELS = [[
  E, E, E, E, E, G(E),
  G('..........*......*..O.........*.........................O'),
  G('...................................#..................................'),
  G('..........^.....^^.....###...^....###.^.....o.....^^....###.^..o......'),
  '############################################..########################',
], {
  // Rezept-Level: das Grid entsteht beim Laden aus Rezept + Mustern (patterns.js). offset in ms, speed (1–4) optional
  name: 'Einstieg', music: 'audio/music.mp3', bpm: 120, offset: 0, seed: 11,
  sections: [
    { mode: 'cube', bars: 4, difficulty: 1 }, { mode: 'cube', bars: 4, difficulty: 1 },
    { mode: 'cube', bars: 4, difficulty: 2 }, { mode: 'cube', bars: 4, difficulty: 2 },
    { mode: 'cube', bars: 4, difficulty: 2 },
    { mode: 'ship', bars: 4, difficulty: 1 }, { mode: 'cube', bars: 4, difficulty: 2 },
    { mode: 'ship', bars: 4, difficulty: 2 }, { mode: 'cube', bars: 4, difficulty: 3 },
    { mode: 'ship', bars: 4, difficulty: 2 }, { mode: 'cube', bars: 4, difficulty: 3 },
  ],
}, {
  name: 'Overdrive', music: 'audio/music.mp3', bpm: 120, offset: 0, seed: 77,
  sections: [
    { mode: 'cube', bars: 4, difficulty: 2, speed: 1 }, { mode: 'gravity', bars: 3, difficulty: 2, speed: 1 },
    { mode: 'cube', bars: 2, difficulty: 3, speed: 2 }, { mode: 'ship', bars: 4, difficulty: 3, speed: 2 },
    { mode: 'gravity', bars: 3, difficulty: 3, speed: 2 }, { mode: 'cube', bars: 3, difficulty: 4, speed: 3 },
    { mode: 'ship', bars: 4, difficulty: 4, speed: 3 }, { mode: 'cube', bars: 2, difficulty: 4, speed: 3 },
    { mode: 'gravity', bars: 4, difficulty: 4, speed: 4 }, { mode: 'ship', bars: 4, difficulty: 5, speed: 4 },
    { mode: 'cube', bars: 3, difficulty: 5, speed: 4 }, { mode: 'gravity', bars: 3, difficulty: 5, speed: 4 },
    { mode: 'cube', bars: 2, difficulty: 5, speed: 4 },
  ],
}];
