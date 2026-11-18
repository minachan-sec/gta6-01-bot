// Seeded RNG (mulberry32) so the city, traffic and missions are deterministic
// for a given seed — screenshots and playtests reproduce exactly.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 7) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  /** float in [0, 1) */
  f() {
    return this.next();
  }
  /** float in [min, max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }
  /** integer in [min, max] inclusive */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  /** one element of arr */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** true with probability p */
  chance(p) {
    return this.next() < p;
  }
  /** -1 or 1 */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}
