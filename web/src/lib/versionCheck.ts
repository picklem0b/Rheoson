/**
 * Application version checker — periodically checks for new versions
 * and notifies the user when an update is available.
 */

import { APP_VERSION } from './constants';
import { api } from '@/api/client.api';

interface VersionInfo {
  version: string;
  name: string;
  releaseDate: string;
  downloadUrl?: string;
}

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

let _lastCheck = 0;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

export async function checkForUpdate(): Promise<VersionInfo | null> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_INTERVAL) return null;
  _lastCheck = now;

  try {
    const info = await api.get<VersionInfo>('/api/version');
    if (info?.version && semverGt(info.version, APP_VERSION)) {
      return info;
    }
  } catch {
    // Version check is best-effort — never throw
  }
  return null;
}

/**
 * Start periodic version checking. Returns a cleanup function.
 */
export function startVersionCheck(
  onUpdate: (info: VersionInfo) => void
): () => void {
  // Check immediately on start
  checkForUpdate().then((info) => {
    if (info) onUpdate(info);
  });

  // Then check periodically
  const interval = setInterval(() => {
    checkForUpdate().then((info) => {
      if (info) onUpdate(info);
    });
  }, CHECK_INTERVAL);

  return () => clearInterval(interval);
}
