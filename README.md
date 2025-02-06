# RankWrangler

A Safari extension that helps you track and analyze Amazon product rankings and metrics in real-time.

## Project Structure

This repository contains both the web extension code and the Safari app wrapper:

- `/extension` - The core web extension code (TypeScript)

  - Contains all the logic for fetching and displaying Amazon rankings
  - Built using TypeScript, Webpack, and modern web technologies
  - Can be developed and tested independently

- `/safari-app` - The Safari app wrapper (Swift/Xcode)
  - Xcode project that packages the web extension for Safari
  - Handles Safari-specific extension requirements
  - Manages code signing and distribution

## Development

### Web Extension Development

```bash
cd extension
yarn install
yarn watch
```

See the [extension README](./extension/README.md) for more details.

### Safari App Development

1. Open `/safari-app/RankWrangler.xcodeproj` in Xcode
2. Build the web extension first: `cd extension && yarn build`
3. Copy the built files from `extension/dist` to the Safari extension's Resources folder
4. Build and run the Safari app in Xcode

See the [Safari app README](./safari-app/README.md) for more details.

## Building for Production

1. Build the web extension:

   ```bash
   cd extension
   yarn build
   ```

2. Open the Xcode project in `/safari-app`
3. Update the extension resources with the new build
4. Archive and distribute through Xcode

## License

MIT
