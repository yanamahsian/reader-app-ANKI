import { useState } from "react";
import { HomeView } from "./features/home/HomeView";
import { ReaderView } from "./features/reader/ReaderView";
import type { Book } from "./features/reader/engine/types";

type View = "home" | "reader";

export function App() {

  const [view, setView] = useState<View>("home");
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  function handleOpenBook(book: Book): void {
    setCurrentBook(book);
    setView("reader");
  }

  function handleExitReader(): void {
    setView("home");
  }

  if (view === "reader" && currentBook) {
    return <ReaderView book={currentBook} onExit={handleExitReader} />;
  }

  return <HomeView onOpenBook={handleOpenBook} />;

}
