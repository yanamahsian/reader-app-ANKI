from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

import_anchor = 'import { MyLibraryView } from "./features/my-library/MyLibraryView";\n'
if 'import { AtlasView } from "./features/atlas/AtlasView";' not in text:
    assert import_anchor in text
    text = text.replace(import_anchor, import_anchor + 'import { AtlasView } from "./features/atlas/AtlasView";\n', 1)

origin_anchor = '  | { type: "library"; state: LibraryRestoreState }\n'
if '| { type: "atlas" }' not in text:
    assert origin_anchor in text
    text = text.replace(origin_anchor, origin_anchor + '  | { type: "atlas" }\n', 1)

if 'bookDetailOrigin?.type === "atlas"' not in text:
    back_anchor = '''    if (bookDetailOrigin?.type === "my-library") {
      setMyLibraryRestoreState(bookDetailOrigin.state);
      setView("my-library");
      return;
    }
'''
    assert back_anchor in text, 'Could not find My Library back branch'
    atlas_back = back_anchor + '''
    if (bookDetailOrigin?.type === "atlas") {
      setView("atlas");
      return;
    }
'''
    text = text.replace(back_anchor, atlas_back, 1)

if 'view === "atlas"' not in text:
    render_anchor = '''  } else if (view === "notes") {
    content = <NotesView onBack={handleBackFromAccountShell} />;
'''
    assert render_anchor in text, 'Could not find notes render branch'
    atlas_render = '''  } else if (view === "atlas") {
    content = (
      <AtlasView
        onBack={handleBackFromAccountShell}
        onOpenBookDetail={bookId => handleOpenBookDetail(bookId, { type: "atlas" })}
        onRequireSignIn={handleRequireSignIn}
      />
    );
''' + render_anchor
    text = text.replace(render_anchor, atlas_render, 1)

path.write_text(text)
