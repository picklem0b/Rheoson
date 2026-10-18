const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// pnpm places workspace packages behind symlinks; Metro has to follow them.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
