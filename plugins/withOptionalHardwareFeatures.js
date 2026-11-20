const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo Config Plugin that explicitly marks screen orientation hardware features
 * as optional (`android:required="false"`) in AndroidManifest.xml and ensures
 * no activity locks `android:screenOrientation="portrait"`.
 *
 * This satisfies Google Play Console's large-screen / tablet / desktop / Android XR
 * hardware availability check.
 */
module.exports = function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // Ensure xmlns:tools is present on <manifest>
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] =
      manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const existingFeatures = Array.isArray(manifest['uses-feature'])
      ? manifest['uses-feature']
      : [];

    const optionalFeatures = [
      'android.hardware.screen.portrait',
      'android.hardware.screen.landscape'
    ];

    const filteredFeatures = existingFeatures.filter(
      (f) => !optionalFeatures.includes(f?.$?.['android:name'])
    );

    optionalFeatures.forEach((featureName) => {
      filteredFeatures.push({
        $: {
          'android:name': featureName,
          'android:required': 'false',
          'tools:replace': 'android:required'
        }
      });
    });

    manifest['uses-feature'] = filteredFeatures;

    // Ensure all activities in <application> use unspecified orientation
    const app = manifest.application?.[0];
    if (app && Array.isArray(app.activity)) {
      app.activity.forEach((act) => {
        if (act.$ && act.$['android:screenOrientation']) {
          act.$['android:screenOrientation'] = 'unspecified';
        }
      });
    }

    return modConfig;
  });
};
