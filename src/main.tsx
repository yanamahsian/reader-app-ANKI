import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ReaderView } from "./features/reader/ReaderView";
import type { Book } from "./features/reader/engine/types";
import {
  clearActivePersonalBook,
  readActivePersonalBook,
  subscribeToPersonalBookOpen
} from "./features/reader/personalEpubBridge";
import { installReaderPreferences } from "./features/reader/readerPreferences";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

// readerEngine.ts is intentionally imperative DOM. Install one additive bridge
// at app bootstrap so every Reader instance — catalog or device-local — gets
// the same persistent typography controls without duplicating settings state in
// App navigation or rewriting the mature engine.
installReaderPreferences();

// Device-local imports are not catalog Works/Editions. Keep App mounted under
// the dedicated Reader so My Library navigation state survives while a local
// EPUB/PDF/FB2 temporarily takes over the reading surface.
function RootApp() {
  const [personalBook, setPersonalBook] = useState<Book | null>(() => readActivePersonalBook());

  useEffect(() => subscribeToPersonalBookOpen(setPersonalBook), []);

  function closePersonalReader(): void {
    clearActivePersonalBook();
    setPersonalBook(null);
  }

  return (
    <>
      <div hidden={personalBook !== null} aria-hidden={personalBook !== null || undefined}>
        <App />
      </div>

      {personalBook && (
        <ReaderView
          book={personalBook}
          onExit={closePersonalReader}
        />
      )}
    </>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <RootApp />
  </StrictMode>
);
