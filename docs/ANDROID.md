# Momentum for Android

The Android app packages the existing React app with Capacitor. It uses the same Supabase accounts and workout data as the PWA.

## Build and configure

1. Install JDK 21 and Android Studio with Android SDK 36. Configure `JAVA_HOME` and Android Studio's SDK location.
2. Set up `.env.local` as described in the README. Use the publishable Supabase key. A physical phone needs a project endpoint it can reach.
3. Apply the Supabase migrations before deploying either client. In Supabase Authentication URL Configuration, add `com.momentum.training://auth/callback` to the allowed redirects alongside the web callback.
4. Run `npm ci` and `npm run android:sync`. Open the `android` project in Android Studio and run it on your phone, or run `android\gradlew.bat -p android assembleDebug` on Windows. The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Check on a phone

For local Supabase over USB, start Docker Desktop and run `npm run dev:local`. Copy the generated `.env.development.local` to `.env.android.local`, then run `adb reverse tcp:54321 tcp:54321` and rebuild the debug APK. Keep the `127.0.0.1` URL in that file. USB forwarding makes it reach the computer. Use the local email/password controls for this setup.

1. Sign in with Google and verify the browser returns to Momentum. Repeat after signing out.
2. Start a workout, reopen Momentum, then complete it. In History, export the mesocycle CSV and open it from the location selected in Android's file picker.
3. Check that your scale and sleep app have written records into Health Connect. In Momentum Settings, choose **Connect Health Connect**, allow the desired measurements, then choose **Sync now**.
4. Verify that a manual weigh-in takes precedence on the same day and that **Export health trends** in History saves a second CSV. Repeat sync and verify that counts stay stable. If your source supports edits and deletions, change a sample record and sync again.

## What sync and export include

- Sync is manual and copies permitted records to the signed-in Momentum account. The first import reads the most recent 29 days. Later imports use Health Connect changes, including edits and deletions. If a checkpoint expires or is lost, the app reconciles the recent window for that installation. Changes outside that window may be missing.
- Body composition includes body-fat percentage and lean body mass when the source writes those exact types. Lean body mass includes more than skeletal muscle.
- The trends CSV uses seven-day intervals beginning with the first completed workout in each History group and ending on its last workout day. History groups all sessions before the latest activation together. Sleep uses the date the session ends. On dates with multiple sleep sources, the export uses the source with the longest combined session duration. It includes time asleep only when known stages cover the session duration. Imported dates use the source offset when available and UTC otherwise.
- The Android file picker lets you choose where to save the CSV. Momentum generates the export for you to inspect and share yourself.
