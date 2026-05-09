const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const googleMobileAdsStub = path.join(projectRoot, 'src/shims/googleMobileAdsStub.js');
const googleMobileAdsPkg = path.join(projectRoot, 'node_modules', 'react-native-google-mobile-ads');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  projectRoot,
  watchFolders: [projectRoot],
  resolver: {
    nodeModulesPaths: [path.join(projectRoot, 'node_modules')],
    resolveRequest(context, moduleName, platform) {
      if (moduleName === 'react-native-google-mobile-ads' && !fs.existsSync(googleMobileAdsPkg)) {
        return { type: 'sourceFile', filePath: googleMobileAdsStub };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
