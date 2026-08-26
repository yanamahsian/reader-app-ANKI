from pathlib import Path

p = Path("src/features/reader/ReaderView.tsx")
text = p.read_text(encoding="utf-8")
old = '''  }, [book, initialLocation?.pageIndex, initialLocation?.startOffset, initialLocation?.endOffset, onExit]);'''
new = '''    // onExit is intentionally omitted: App passes a fresh callback on every\n    // render, while this engine must only be rebuilt when the concrete book\n    // or annotation target changes. This preserves ReaderView's pre-Notes\n    // lifecycle behavior and avoids destroying/reopening the Reader on an\n    // unrelated parent render.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [book, initialLocation?.pageIndex, initialLocation?.startOffset, initialLocation?.endOffset]);'''
if text.count(old) != 1:
    raise SystemExit(f"ReaderView dependency needle count={text.count(old)}")
p.write_text(text.replace(old, new, 1), encoding="utf-8")

print("notes/highlights fixups applied")
