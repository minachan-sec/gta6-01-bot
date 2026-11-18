// Seeded randomness (sfc32) so the city, traffic and missions are
// deterministic for a given seed — screenshots and playtests reproduce
// exactly the same world every time.

function sfc32(a, b, c, d) {
  return function next() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  let h = (seed >>> 0) || 1;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Seeded {
  constructor(seed = 8) {
    this.seed = seed >>> 0;
    const base = hashSeed(this.seed);
    this.draw = sfc32(base, base ^ 0x9e3779b9, (base << 7) | (base >>> 25), (base >> 3) ^ 0x85ebca6b);
  }
  /** float in [0, 1) */
  unit() {
    return this.draw();
  }
  /** float in [min, max) */
  between(min, max) {
    return min + this.draw() * (max - min);
  }
  /** integer in [min, max] inclusive */
  whole(min, max) {
    return min + Math.floor(this.draw() * (max - min + 1));
  }
  /** one element of arr */
  choose(arr) {
    return arr[Math.floor(this.draw() * arr.length)];
  }
  /** true with probability p */
  maybe(p) {
    return this.draw() < p;
  }
  /** -1 or 1 */
  flip() {
    return this.draw() < 0.5 ? -1 : 1;
  }
}
