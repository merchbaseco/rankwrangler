# RankWrangler Safari App

This directory contains the Xcode project that wraps the web extension for Safari.

## Setup

1. Open `RankWrangler.xcodeproj` in Xcode
2. Set up your development team in the project settings
3. Configure the bundle identifier
4. Make sure the web extension is built (`cd ../extension && yarn build`)
5. Copy the built files from `../extension/dist` to the Safari extension's Resources folder

## Development

1. Build the web extension in watch mode:

   ```bash
   cd ../extension
   yarn watch
   ```

2. Keep Xcode open and rebuild/rerun when you want to test changes

## Building for Distribution

1. Make sure you have the latest web extension build
2. Update the version numbers in both the web extension and Safari app
3. Archive the project in Xcode
4. Submit to the App Store or export for distribution

## Project Structure

- `RankWrangler/` - The main app target
- `RankWranglerExtension/` - The Safari extension target
  - `Resources/` - Where the web extension files go
  - `SafariWebExtensionHandler.swift` - Native Safari extension code
