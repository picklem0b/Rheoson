const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * The ABIs React Native ships prebuilt native libraries for.
 *
 * @see https://reactnative.dev/docs/build-speed
 */
const ANDROID_ABIS = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'];

/** The Gradle property the React Native Gradle plugin reads to set `abiFilters`. */
const REACT_NATIVE_ARCHITECTURES = 'reactNativeArchitectures';

/** Marks the block this plugin appends, so a second run does not add a second one. */
const APPENDED_MARKER = 'withAndroidBuildArchs';

/**
 * Restricts the Android build to a chosen set of ABIs.
 *
 * React Native ships a copy of every native library for each of the four ABIs,
 * so an unfiltered APK carries three sets that no phone in the target market
 * will ever load. Narrowing the list to `arm64-v8a` removes them, which is the
 * single largest APK-size reduction available without giving anything up.
 *
 * Two writes are needed, not one, because two code paths decide packaging:
 *
 * 1. `reactNativeArchitectures` in `android/gradle.properties`. The React
 *    Native Gradle plugin reads it and applies `ndk { abiFilters }` — but only
 *    when the New Architecture is enabled.
 * 2. An explicit `abiFilters` block in `app/build.gradle`. `app.json` sets
 *    `newArchEnabled: false` (react-native-track-player needs the old
 *    architecture), which puts the property in (1) out of reach — without this
 *    second write the filter is silently ignored.
 *
 * Written as a config plugin rather than through `expo-build-properties`
 * because the SDK 52 release of that plugin has no architecture option; its
 * `buildArchs` property arrived with a later SDK.
 *
 * @param {import('@expo/config-types').ExpoConfig} config
 * @param {{ archs?: string[] }} [props]
 * @returns {import('@expo/config-types').ExpoConfig}
 */
const withAndroidBuildArchs = (config, props = {}) => {
	const archs = props.archs ?? ['arm64-v8a'];

	if (archs.length === 0) {
		throw new Error(
			'withAndroidBuildArchs: `archs` is empty. Name at least one ABI, or remove the plugin.'
		);
	}

	const unknown = archs.filter(abi => !ANDROID_ABIS.includes(abi));

	if (unknown.length > 0) {
		throw new Error(
			`withAndroidBuildArchs: unknown ABI ${unknown.join(', ')}. ` +
				`Supported ABIs are ${ANDROID_ABIS.join(', ')}.`
		);
	}

	// `withGradleProperties(config, action)` and `withAppBuildGradle(config,
	// action)` are *mods*: they take the config first and return a new config.
	// Chaining them is the whole plugin — each one attaches its action to the
	// config, and prebuild runs them in order.
	const withProperty = withGradleProperties(config, next => {
		// Prebuild writes the template's own entry, so replacing it (rather than
		// appending a second one) is what makes the setting take effect.
		if (!Array.isArray(next.modResults)) return next;

		next.modResults = next.modResults.filter(
			entry => !(entry.type === 'property' && entry.key === REACT_NATIVE_ARCHITECTURES)
		);

		next.modResults.push({
			type: 'property',
			key: REACT_NATIVE_ARCHITECTURES,
			value: archs.join(',')
		});

		return next;
	});

	return withAppBuildGradle(withProperty, next => {
		if (!next.modResults || typeof next.modResults.contents !== 'string') {
			return next;
		}

		if (next.modResults.language !== 'groovy') {
			throw new Error(
				'withAndroidBuildArchs: app/build.gradle is not Groovy, so the ABI filter ' +
					'could not be applied. Narrowing the ABIs by hand is the alternative.'
			);
		}

		if (next.modResults.contents.includes(APPENDED_MARKER)) {
			return next;
		}

		const abiList = archs.map(abi => `"${abi}"`).join(', ');

		next.modResults.contents += `
// ${APPENDED_MARKER}: pins the packaged native libraries to ${archs.join(', ')}.
// The React Native Gradle plugin only applies \`reactNativeArchitectures\` when
// the New Architecture is enabled, and this app runs the old architecture, so
// the filter is applied here as well.
android {
    defaultConfig {
        ndk {
            abiFilters.addAll([${abiList}])
        }
    }
}
`;

		return next;
	});
};

module.exports = withAndroidBuildArchs;
