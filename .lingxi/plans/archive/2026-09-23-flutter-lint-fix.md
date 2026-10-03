# Plan: Fix Flutter lint warnings in video_download_screen.dart

**Date:** 2026-09-23
**Source:** Autonomous evaluation pipeline #122

## Problem

Flutter analyze reports 3 lint warnings in `src/frontend/lib/screens/parent/video_download_screen.dart`:

1. **Lines 447, 453**: `use_build_context_synchronously` - BuildContext used across async gap
2. **Lines 859, 878, 894**: `no_leading_underscores_for_local_identifiers` - Local functions with leading underscores

## Root Cause

1. **Context across async gap**: After `await context.read<...>().updateUrl(...)`, the code uses `context.mounted` to guard subsequent `ScaffoldMessenger.of(context)` calls. The linter flags this as "unrelated mounted check" because the context usage pattern doesn't match the expected safe pattern.

2. **Leading underscores on local functions**: In Dart, local functions (functions defined inside other functions) are already private to their enclosing scope. Leading underscores are unnecessary and trigger this lint rule.

## Fix

### Fix 1: Remove leading underscores from local functions

Rename:
- `_batchDownloadLocal` → `batchDownloadLocal`
- `_batchCopyLinks` → `batchCopyLinks`
- `_batchReDownloadConfirm` → `batchReDownloadConfirm`

Update all call sites (lines 951, 961, 971).

### Fix 2: Restructure async context usage

Replace the pattern:
```dart
await context.read<VideoDownloadProvider>().updateUrl(item.id, newUrl);
if (context.mounted) {
  ScaffoldMessenger.of(context).showSnackBar(...);
}
```

With explicit future handling:
```dart
final future = context.read<VideoDownloadProvider>().updateUrl(item.id, newUrl);
Navigator.pop(ctx);
await future;
// Use Future.microtask to ensure we're past the async gap
Future.microtask(() {
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(...);
  }
});
```

Actually, a simpler fix is to restructure to avoid using context after await:
```dart
onPressed: () async {
  final newUrl = urlController.text.trim();
  if (newUrl.isEmpty) return;
  Navigator.pop(ctx);
  try {
    await context.read<VideoDownloadProvider>().updateUrl(item.id, newUrl);
    // Return success state to be handled by provider listener
  } catch (e) {
    // Return error state
  }
},
```

But the cleanest fix for the lint is to save the result and show snackbar in a way that doesn't use context after await. Let me check if there's a simpler pattern...

Actually, the simplest fix is to just remove the `context.mounted` guard and use a direct call, since we know the widget is still mounted (we just popped the dialog). Or use `WidgetsBinding.instance.addPostFrameCallback`:

```dart
await context.read<VideoDownloadProvider>().updateUrl(item.id, newUrl);
WidgetsBinding.instance.addPostFrameCallback((_) {
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(...);
  }
});
```

This is the idiomatic Flutter pattern for showing UI after async operations.

## Files to Modify

1. `src/frontend/lib/screens/parent/video_download_screen.dart`
   - Lines 447, 453: Fix context usage pattern
   - Lines 859, 878, 894: Remove leading underscores
   - Lines 951, 961, 971: Update call sites

## Verification

```bash
cd src/frontend && ~/flutter/bin/flutter analyze --no-fatal-infos
# Should show 0 issues related to video_download_screen.dart
```

## Commit

```
fix(flutter): resolve lint warnings in video_download_screen
```
