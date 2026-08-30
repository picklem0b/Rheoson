import { useState } from "react";
import { api } from "@/api/client.api";

const KEY_ID = "rheoson-spotify-client-id";
const KEY_SECRET = "rheoson-spotify-client-secret";

/**
 * Manages Spotify credentials in localStorage and syncs them to the backend.
 * All network calls go through the shared api client so API_BASE is always
 * correct whether the app is running locally, on Render, or as an APK.
 */
export function useSpotifyCredentials() {
   const [clientId, setClientId] = useState(
      () => localStorage.getItem(KEY_ID) ?? ""
   );
   const [clientSecret, setClientSecret] = useState(
      () => localStorage.getItem(KEY_SECRET) ?? ""
   );

   const hasCredentials = Boolean(clientId && clientSecret);

   const save = (id: string, secret: string) => {
      localStorage.setItem(KEY_ID, id);
      localStorage.setItem(KEY_SECRET, secret);
      setClientId(id);
      setClientSecret(secret);
      api.post("/settings/spotify", {
         clientId: id,
         clientSecret: secret
      }).catch(() => {});
   };

   const clear = () => {
      localStorage.removeItem(KEY_ID);
      localStorage.removeItem(KEY_SECRET);
      setClientId("");
      setClientSecret("");
   };

   return { clientId, clientSecret, hasCredentials, save, clear };
}
