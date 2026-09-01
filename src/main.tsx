import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ReaderView } from "./features/reader/ReaderView";
import type { Book } from "./features/reader/engine/types";
import {
  clearActivePersonalEpub,
  readActivePersonalEpub,
  subscribeToPersonalEpubOpen
} from "./features/reader/personalEpubBridge";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

// Personal EPUBs are device-local files, not catalog Works/Editions. Keep App
// mounted underneath so its current My Library navigation state survives while
// the dedicated Reader temporarily takes over the root surface. This preserves
// Reader's existing "no catalog shell while reading" contract without forcing
// device-local file objects into App's server-catalog navigation model.
function RootApp() {
  const [personalBook, setPersonalBook] = useState<Book | null>(() => readActivePersonalEpub());

  useEffect(() => subscribeToPersonalEpubOpen(setPersonalBook), []);

  function closePersonalReader(): void {
    clearActivePersonalEpub();
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
