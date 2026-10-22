const { withAppBuildGradle } = require('@expo/config-plugins');

/** Marks the block this plugin appends, so a second run does not add a second one. */
const APPENDED_MARKER = 'withReleaseSigning';

/**
 * The variables the Gradle block reads when it configures the `release` build.
 * Paths and passwords live in the environment rather than in the generated
 * `build.gradle` so the keystore is never written into a file that could be
 * cached or uploaded as part of a build log.
 */
const SIGNING_ENV = [
	'RHEOSON_KEYSTORE_PATH',
	'RHEOSON_KEYSTORE_PASSWORD',
	'RHEOSON_KEY_ALIAS',
	'RHEOSON_KEY_PASSWORD'
];

/**
 * Signs `release` with a keystore supplied at build time.
 *
 * `expo prebuild` generates an `app/build.gradle` whose release build type
 * signs with the *debug* key — fine for a local `assembleDebug`, wrong for an
 * APK meant to upgrade the installed app, because Android rejects an update
 * whose signature changed. This plugin appends a second `android { }` block
 * that declares a `release` signing config and points the release build type at
 * it, which is the same append-rather-than-patch approach
 * `withAndroidBuildArchs` uses: an Expo SDK bump regenerates the template and
 * the block simply goes on top of whatever it looks like.
 *
 * With no variables set the plugin does nothing and the debug key stays in
 * place, so `pnpm prebuild` on a laptop keeps working with no keystore.
 *
 * @param {import('@expo/config-types').ExpoConfig} config
 * @returns {import('@expo/config-types').ExpoConfig}
 */
const withReleaseSigning = config => {
	const missing = SIGNING_ENV.filter(name => !process.env[name]);

	if (missing.length === SIGNING_ENV.length) return config;

	if (missing.length > 0) {
		throw new Error(
			`withReleaseSigning: ${missing.join(', ')} must be set too. ` +
				`Release signing reads ${SIGNING_ENV.join(', ')} as a set — a partial ` +
				`set would generate a build.gradle that cannot sign.`
		);
	}

	return withAppBuildGradle(config, next => {
		if (!next.modResults || typeof next.modResults.contents !== 'string') {
			return next;
		}

		if (next.modResults.language !== 'groovy') {
			throw new Error(
				'withReleaseSigning: app/build.gradle is not Groovy, so the release ' +
					'signing config could not be applied.'
			);
		}

		if (next.modResults.contents.includes(APPENDED_MARKER)) {
			return next;
		}

		next.modResults.contents += `
// ${APPENDED_MARKER}: signs the release build with the keystore named by
// ${SIGNING_ENV.join(', ')}.
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("RHEOSON_KEYSTORE_PATH"))
            storePassword System.getenv("RHEOSON_KEYSTORE_PASSWORD")
            keyAlias System.getenv("RHEOSON_KEY_ALIAS")
            keyPassword System.getenv("RHEOSON_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`;

		return next;
	});
};

module.exports = withReleaseSigning;
