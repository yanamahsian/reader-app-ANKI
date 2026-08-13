export interface SelectionHandlers {
  onTranslate: () => void;
  onExplain: () => void;
  onSave: () => void;
}

export interface SelectionController {
  getSelectedText(): string;
  destroy(): void;
}

// Owns the floating toolbar that appears next to a text selection
// inside the reader viewer. Ported from script.js's
// showSelectionToolbar/hideSelectionToolbar/handleSelectionChange —
// same behaviour, just scoped to a class instead of globals.
export function createSelectionController(
  viewer: HTMLElement,
  handlers: SelectionHandlers
): SelectionController {

  let selectedText = "";

  const toolbar = document.createElement("div");
  toolbar.className = "selection-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Действия с выделенным текстом");
  toolbar.style.display = "none";

  const translateBtn = document.createElement("button");
  translateBtn.type = "button";
  translateBtn.textContent = "Перевести";

  const explainBtn = document.createElement("button");
  explainBtn.type = "button";
  explainBtn.textContent = "Объяснить";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Сохранить";

  toolbar.append(translateBtn, explainBtn, saveBtn);
  document.body.appendChild(toolbar);

  function hideToolbar(): void {
    toolbar.style.display = "none";
  }

  function showToolbar(range: Range): void {
    const rect = range.getBoundingClientRect();

    toolbar.style.display = "flex";
    toolbar.style.position = "fixed";
    toolbar.style.left = (rect.left + rect.width / 2) + "px";
    toolbar.style.top = (rect.top - 56) + "px";
  }

  function handleSelectionChange(): void {

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      hideToolbar();
      return;
    }

    const text = selection.toString().trim();

    if (!text.length || !viewer.contains(selection.anchorNode)) {
      hideToolbar();
      return;
    }

    selectedText = text;
    showToolbar(selection.getRangeAt(0));

  }

  translateBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onTranslate();
  });

  explainBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onExplain();
  });

  saveBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onSave();
  });

  document.addEventListener("selectionchange", handleSelectionChange);

  function destroy(): void {
    document.removeEventListener("selectionchange", handleSelectionChange);
    toolbar.remove();
  }

  return {
    getSelectedText: () => selectedText,
    destroy
  };

}
