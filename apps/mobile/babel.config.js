module.exports = function (api) {
	api.cache(true);
	return {
		presets: ['babel-preset-expo'],
		// react-native-reanimated/plugin must remain the last plugin in the list.
		plugins: ['react-native-reanimated/plugin']
	};
};
