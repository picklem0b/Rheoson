'use client';

/**
 * The shared Web Audio graph: pre-amp → EQ → bass boost → mono → limiter.
 *
 * One graph for the whole app, attached to the single `<audio>` element. A
 * second graph on the same element is not an option — `createMediaElementSource`
 * may only be called once per element, and calling it twice silently returns a
 * node that produces nothing.
 *
 * **Why the graph is opt-in.** Connecting a media element to Web Audio turns it
 * into a CORS-constrained source: if the response is not served with a usable
 * `Access-Control-Allow-Origin`, the element produces *silence* rather than an
 * error. Default playback therefore never touches Web Audio at all — it is a
 * plain `<audio>` element, which works cross-origin without any of this. The
 * first time a listener enables an effect, the graph is built, `crossOrigin` is
 * set and the current track reloads. If that reload fails, it fails loudly
 * (a toast with a code) instead of quietly playing nothing.
 *
 * Parameters are read from the same `rheoson-*` localStorage keys the settings
 * UI writes, so this file has no React dependency and no state of its own.
 */

const PREAMP_KEY = 'rheoson-pre-amp-gain';
const EQ_BANDS_KEY = 'rheoson-eq-bands';
const EQ_ENABLED_KEY = 'rheoson-eq-enabled';
const BASS_BOOST_KEY = 'rheoson-bass-boost';
const MONO_KEY = 'rheoson-mono';
const NORMALIZE_KEY = 'rheoson-normalize';

/** Frequencies of the three bands, in Hz. */
export const EQ_BANDS = [200, 1000, 3000] as const;

const BASS_BOOST_DB = 6;
const LIMITER_THRESHOLD = -1;

export const EQ_UNSUPPORTED = 'YEN01';

interface Graph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  preamp: GainNode;
  bands: BiquadFilterNode[];
  bass: BiquadFilterNode;
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  limiter: DynamicsCompressorNode;
}

let graph: Graph | null = null;
let attached: HTMLMediaElement | null = null;

export function isAttached(): boolean {
  return graph !== null;
}

function readNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function readBands(): number[] {
  if (typeof window === 'undefined') return [0, 0, 0];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EQ_BANDS_KEY) ?? '[]') as unknown;
    if (Array.isArray(parsed) && parsed.length === EQ_BANDS.length) {
      return parsed.map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0));
    }
  } catch {
    // A hand-edited or truncated value reads as "flat", which is the safe
    // default: a corrupted EQ must not be a loud one.
  }
  return [0, 0, 0];
}

/**
 * Build the graph for an element, or return null when Web Audio is missing.
 *
 * Throws nothing: the caller decides what an unsupported device means.
 */
function build(element: HTMLMediaElement): Graph | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();
  const source = context.createMediaElementSource(element);

  const preamp = context.createGain();
  preamp.gain.value = dbToGain(readNumber(PREAMP_KEY, 0));

  // Three filters, one per band, chained.
  const bands = EQ_BANDS.map((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0 ? 'lowshelf' : index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = index === 1 ? 1 : 0.707;
    filter.gain.value = readBands()[index] ?? 0;
    return filter;
  });

  const bass = context.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 150;
  bass.gain.value = readBool(BASS_BOOST_KEY, false) ? BASS_BOOST_DB : 0;

  // Mono: sum both channels into one and feed it to both outputs, which is what
  // "mono" means for a stereo output device.
  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(2);

  // A limiter last in the chain: bass boost plus a positive pre-amp is exactly
  // how a graph clips, and clipping is not a feature.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMITER_THRESHOLD;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // preamp → band0 → band1 → band2 → bass
  let node: AudioNode = preamp;
  for (const filter of bands) {
    node.connect(filter);
    node = filter;
  }
  node.connect(bass);

  return { context, source, preamp, bands, bass, splitter, merger, limiter };
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Attach the graph to an element. Returns true when audio now flows through it.
 *
 * `optIn` must be true: the caller is stating that the user asked for effects.
 */
export async function attach(element: HTMLMediaElement, optIn = false): Promise<boolean> {
  if (!optIn) return false;
  if (graph && attached === element) return true;
  if (graph && attached !== element) detach();

  // Set before the element loads so the media element source produced by
  // `createMediaElementSource` reads the bytes in CORS mode.
  element.crossOrigin = 'anonymous';

  const built = build(element);
  if (!built) return false;

  graph = built;
  attached = element;
  await resume();
  return true;
}

/** Route — applies the graph's current settings to the live audio. */
export function wire(): void {
  if (!graph) return;
  const { source, preamp, bands, bass, limiter, context } = graph;

  source.disconnect();
  preamp.disconnect();
  for (const band of bands) band.disconnect();
  bass.disconnect();

  source.connect(preamp);
  let node: AudioNode = preamp;
  for (const band of bands) {
    node.connect(band);
    node = band;
  }
  node.connect(bass);

  // Mono is a routing decision, not a filter: either the bass stage's stereo
  // output goes straight out, or it is summed and duplicated.
  if (readBool(MONO_KEY, false)) {
    bass.connect(graph.splitter);
    graph.splitter.connect(graph.merger, 0, 0);
    graph.splitter.connect(graph.merger, 0, 1);
    graph.merger.connect(limiter);
  } else {
    bass.connect(limiter);
  }

  limiter.connect(context.destination);
  applyFromStorage();
}

export function detach(): void {
  if (!graph) return;
  try {
    graph.source.disconnect();
  } catch {
    // Already disconnected is not a failure.
  }
  graph = null;
  attached = null;
}

/** Re-read every setting from storage and push it into the graph. */
export function applyFromStorage(): void {
  if (!graph) return;

  // 0 dB is unity gain: skip the conversion so an exact 1 is stored rather
  // than 0.9999999999999999 from the log round trip.
  const preampDb = readNumber(PREAMP_KEY, 0);
  graph.preamp.gain.value = preampDb === 0 ? 1 : dbToGain(preampDb);

  const bands = readBands();
  const enabled = readBool(EQ_ENABLED_KEY, false);
  graph.bands.forEach((filter, index) => {
    filter.gain.value = enabled ? (bands[index] ?? 0) : 0;
  });

  graph.bass.gain.value = readBool(BASS_BOOST_KEY, false) ? BASS_BOOST_DB : 0;

  const { context, limiter } = graph;
  limiter.threshold.value = readBool(NORMALIZE_KEY, true) ? LIMITER_THRESHOLD : 0;
  if (context.state === 'suspended') void context.resume();
}

export async function resume(): Promise<void> {
  if (!graph) return;
  try {
    if (graph.context.state === 'suspended') await graph.context.resume();
  } catch {
    // Autoplay policy refusals resolve on the next user gesture.
  }
}

/**
 * Apply the effect flags a settings toggle just changed.
 *
 * Called from the settings UI: the element is passed on the first enable so the
 * graph can be built, and `wire()` re-routes it for a mono change.
 */
export async function sync(element: HTMLMediaElement | null, options: { enable: boolean }): Promise<{ ok: boolean; code?: string }> {
  if (!options.enable && !graph) return { ok: true };

  if (element) {
    const attachedNow = await attach(element, true);
    if (!attachedNow) return { ok: false, code: EQ_UNSUPPORTED };
  }
  wire();
  applyFromStorage();
  return { ok: true };
}
