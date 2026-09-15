import { api } from "./client.api";

export type PreferenceValues = Record<string, string | number | boolean>;

export const preferencesApi = {
   /** The user's synced preferences, defaults filled in. */
   async get(): Promise<{ preferences: PreferenceValues; synced: boolean }> {
      const res = await api.get<{
         preferences: PreferenceValues;
         synced: boolean;
      }>("/auth/me/preferences");
      return res;
   },

   /** The server's whitelist + default values (survives client deploys). */
   async defaults(): Promise<PreferenceValues> {
      const res = await api.get<{ defaults: PreferenceValues }>(
         "/auth/me/preferences/defaults"
      );
      return res.defaults;
   },

   /** Merge a patch into the synced copy; returns the resulting values. */
   async put(
      patch: PreferenceValues
   ): Promise<{ preferences: PreferenceValues; synced: boolean }> {
      return api.put<{
         preferences: PreferenceValues;
         synced: boolean;
      }>("/auth/me/preferences", { preferences: patch });
   },
};
