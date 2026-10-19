/**
 * App entry.
 *
 * `expo-router/entry` renders the routes, but the playback service has to be
 * registered with the native player *before* the UI mounts: it is what makes
 * the notification's transport controls and headset buttons work while the app
 * is backgrounded, and a service registered after a track is already playing
 * misses the events that started it. That ordering is the only reason this file
 * exists.
 */
import TrackPlayer from 'react-native-track-player';

import { playbackService } from './src/services/player';

TrackPlayer.registerPlaybackService(() => playbackService);

require('expo-router/entry');
