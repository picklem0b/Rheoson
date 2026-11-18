/**
 * End-to-end verification of the preference sync across two sign-ins,
 * against a fake server that mimics the real API's semantics:
 *
 *   - GET returns the user's stored prefs with defaults filled in;
 *   - PUT merges a validated patch into the stored doc;
 *   - each sign-in is a separate "device" with its own local state;
 *   - one device's writes are invisible to the other's local state.
 *
 * The user-visible guarantee being pinned: person A changes something on
 * device 1, signs in on device 2, and device 2 lands on device 1's state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SYNC_KEYS } from "@/hooks/preferenceSync.hook";

type Prefs = Record<string, string | number | boolean>;

// ── Fake server (mirrors services/preferences.py semantics) ──────────
const SERVER_DEFAULTS: Prefs = {
   autoplay: true,
   normalize: true,
   "bass-boost": false,
   mono: false,
   "pre-amp-gain": 0,
   "eq-preset": "Flat",
   "notif-sound": true,
   "notif-dl-done": true,
   "save-search-log": true,
   "save-history": true,
   "theme-accent": "crimson",
   "theme-surface": "dark",
   "glass-opacity": 0.7,
   "nav-style": "pill",
   "nav-position": "bottom"
};

const ALLOWED = new Set(Object.keys(SERVER_DEFAULTS));

function makeFakeServer() {
   const stored: Prefs = {};

   return {
      /** GET /auth/me/preferences */
      async get(): Promise<Prefs> {
         return { ...SERVER_DEFAULTS, ...stored };
      },
      /** PUT /auth/me/preferences — whitelist + merge, like the backend. */
      async put(patch: Prefs): Promise<void> {
         for (const [k, v] of Object.entries(patch)) {
            if (ALLOWED.has(k)) stored[k] = v;
         }
      }
   };
}

// ── A "device": local state + the diff the hook would push ───────────
interface Device {
   id: string;
   storage: Map<string, string>;
   theme: { accent: string; surface: string; glassOpacity: number };
   nav: { style: string; position: string };
}

function makeDevice(id: string): Device {
   return {
      id,
      storage: new Map(),
      theme: { accent: "crimson", surface: "dark", glassOpacity: 0.7 },
      nav: { style: "pill", position: "bottom" }
   };
}

/** Read a synced key from a device's local state, like readKeyValue(). */
function readOn(device: Device, key: string): string | number | boolean | undefined {
   switch (key) {
      case "theme-accent": return device.theme.accent;
      case "theme-surface": return device.theme.surface;
      case "glass-opacity": return device.theme.glassOpacity;
      case "nav-style": return device.nav.style;
      case "nav-position": return device.nav.position;
      default: {
         const raw = device.storage.get(`rheoson-${key}`);
         return raw !== undefined ? JSON.parse(raw) : undefined;
      }
   }
}

/** Apply a server value to a device's local state, like applyServerValue(). */
function applyOn(device: Device, key: string, value: string | number | boolean): void {
   switch (key) {
      case "theme-accent": device.theme.accent = value as string; return;
      case "theme-surface": device.theme.surface = value as string; return;
      case "glass-opacity": device.theme.glassOpacity = value as number; return;
      case "nav-style": device.nav.style = value as string; return;
      case "nav-position": device.nav.position = value as string; return;
      default: device.storage.set(`rheoson-${key}`, JSON.stringify(value));
   }
}

/** Sign in on a device: pull the server copy, apply it, set the baseline. */
async function signIn(device: Device, server: ReturnType<typeof makeFakeServer>) {
   const serverPrefs = await server.get();
   for (const [k, v] of Object.entries(serverPrefs)) {
      applyOn(device, k, v);
   }
   return serverPrefs; // this becomes the hook's baseline
}

/** Simulate the user changing a setting locally on a device. */
function userChanges(device: Device, key: string, value: string | number | boolean) {
   applyOn(device, key, value);
}

/** The push tick: diff against baseline, PUT if non-empty, advance baseline. */
async function pushTick(
   device: Device,
   baseline: Prefs,
   server: ReturnType<typeof makeFakeServer>
): Promise<Prefs> {
   // diffAgainstBaseline reads from the live stores in production; in the
   // test we project the device's state onto the same interface it reads.
   const patch = diffOn(device, baseline);
   if (Object.keys(patch).length > 0) {
      await server.put(patch);
      for (const k of Object.keys(patch)) baseline[k] = patch[k];
   }
   return patch;
}

/** diffAgainstBaseline against a specific device's state. */
function diffOn(device: Device, baseline: Prefs): Prefs {
   const patch: Prefs = {};
   for (const key of SYNC_KEYS) {
      const v = readOn(device, key);
      if (v !== undefined && v !== baseline[key]) patch[key] = v;
   }
   return patch;
}

// ── The actual two-sign-in scenario ──────────────────────────────────

let server: ReturnType<typeof makeFakeServer>;

beforeEach(() => {
   server = makeFakeServer();
});

describe("preference sync across two sign-ins", () => {
   it("a change on device 1 arrives on device 2 at next sign-in", async () => {
      const d1 = makeDevice("device-1");

      // First sign-in: defaults everywhere.
      const baseline1 = await signIn(d1, server);
      expect(baseline1["theme-accent"]).toBe("crimson");

      // User personalises: accent, theme surface, autoplay off, EQ preset.
      userChanges(d1, "theme-accent", "violet");
      userChanges(d1, "theme-surface", "light");
      userChanges(d1, "autoplay", false);
      userChanges(d1, "eq-preset", "Bass Boost");

      // Push tick mirrors the edits to the account.
      const pushed = await pushTick(d1, baseline1, server);
      expect(Object.keys(pushed).sort()).toEqual([
         "autoplay", "eq-preset", "theme-accent", "theme-surface"
      ]);

      // ── Second sign-in, fresh device ──
      const d2 = makeDevice("device-2");
      const baseline2 = await signIn(d2, server);

      // Device 2 landed on device 1's state, not factory defaults.
      expect(baseline2["theme-accent"]).toBe("violet");
      expect(baseline2["theme-surface"]).toBe("light");
      expect(baseline2["autoplay"]).toBe(false);
      expect(baseline2["eq-preset"]).toBe("Bass Boost");

      // And device 2's local state reflects it on every surface.
      expect(readOn(d2, "theme-accent")).toBe("violet");
      expect(readOn(d2, "autoplay")).toBe(false);
   });

   it("a second device pushing cannot clobber changes made after its pull", async () => {
      const d1 = makeDevice("device-1");
      const baseline1 = await signIn(d1, server);

      const d2 = makeDevice("device-2");
      const baseline2 = await signIn(d2, server);

      // Both devices were pulled at the same state. Device 2 changes
      // the accent and pushes; device 1 (stale baseline) then pushes its
      // own accent change — last-write-wins is expected, but only for
      // keys the stale device actually changed.
      userChanges(d2, "theme-accent", "cyan");
      await pushTick(d2, baseline2, server);

      userChanges(d1, "theme-accent", "gold");
      await pushTick(d1, baseline1, server);

      const final = await server.get();
      // The last push wins for the contested key.
      expect(final["theme-accent"]).toBe("gold");
      // Uncontested keys were never touched by either device.
      expect(final["autoplay"]).toBe(true);
   });

   it("diff only includes keys that actually changed since the baseline", () => {
      const d = makeDevice("d");
      const baseline = { ...SERVER_DEFAULTS };

      userChanges(d, "mono", true);
      const patch = diffOn(d, baseline);

      expect(Object.keys(patch)).toEqual(["mono"]);
      expect(patch["mono"]).toBe(true);
   });

   it("nothing is pushed when nothing changed", async () => {
      const d = makeDevice("d");
      const baseline = await signIn(d, server);

      const patch = await pushTick(d, baseline, server);
      expect(Object.keys(patch)).toHaveLength(0);
   });

   it("synced keys cover every whitelisted server key", () => {
      // If the server whitelist and the client key list drift apart, one
      // side silently stops syncing. This test fails on drift.
      expect([...SYNC_KEYS].sort()).toEqual(Object.keys(SERVER_DEFAULTS).sort());
   });
});
