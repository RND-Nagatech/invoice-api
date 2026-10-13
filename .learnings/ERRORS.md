
## [ERR-20261008-001] vitest_flag

**Logged**: 2026-10-08T12:00:00+07:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Backend test command failed because the Vitest script was invoked with the Jest-only `--runInBand` option.

### Error
```
CACError: Unknown option `--runInBand`
```

### Context
The backend package script runs `vitest run`; the command used was `npm test -- --runInBand`.

### Suggested Fix
Run `npm test` or pass Vitest-supported flags instead of Jest flags.

### Metadata
- Reproducible: yes
- Related Files: package.json

## 2026-10-08 — Flutter formatter received project-prefixed paths
- **Context:** Ran `dart format invoicekilat/flutter-apk/...` while the command working directory was already `invoicekilat/flutter-apk`.
- **Failure:** Dart reported that the files did not exist and formatted no files.
- **Resolution:** Use paths relative to the selected working directory (`lib/...`), then run `flutter analyze`.
- **Prevention:** Keep command paths relative to `workdir`, or use absolute paths consistently.
