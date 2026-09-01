import "./readerPreferences.css";

type ReaderTheme = "dark" | "default" | "purple" | "red";
type ReaderFont = "book" | "serif" | "sans";
type ReaderAlignment = "left" | "justify";

interface ReaderPreferences {
  fontSize: number;
  font: ReaderFont;
  lineHeight: number;
  columnWidth: number;
  paragraphSpacing: number;
  alignment: ReaderAlignment;
  theme: ReaderTheme;
}

const PREFERENCES_KEY = "anki_reader_preferences_v1";
const LEGACY_FONT_KEY = "anki_font";
const LEGACY_THEME_KEY = "anki_theme";
const THEMES: ReaderTheme[] = ["dark", "default", "purple", "red"];
const FONTS: ReaderFont[] = ["book", "serif", "sans"];
const ALIGNMENTS: ReaderAlignment[] = ["left", "justify"];

const DEFAULTS: ReaderPreferences = {
  fontSize: 22,
  font: "book",
  lineHeight: 1.9,
  columnWidth: 760,
  paragraphSpacing: 1.25,
  alignment: "left",
  theme: "dark"
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Reader itself already works without durable browser storage. Preferences
    // remain effective for the current open book even if persistence is blocked.
  }
}

function parseStoredPreferences(): Partial<ReaderPreferences> {
  const raw = safeStorageGet(PREFERENCES_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readPreferences(): ReaderPreferences {
  const stored = parseStoredPreferences();
  const legacyFontSize = Number(safeStorageGet(LEGACY_FONT_KEY));
  const legacyTheme = safeStorageGet(LEGACY_THEME_KEY) as ReaderTheme | null;

  const fontSizeCandidate = Number.isFinite(legacyFontSize) && legacyFontSize > 0
    ? legacyFontSize
    : Number(stored.fontSize ?? DEFAULTS.fontSize);
  const lineHeightCandidate = Number(stored.lineHeight ?? DEFAULTS.lineHeight);
  const widthCandidate = Number(stored.columnWidth ?? DEFAULTS.columnWidth);
  const paragraphCandidate = Number(stored.paragraphSpacing ?? DEFAULTS.paragraphSpacing);

  return {
    fontSize: Math.round(clamp(fontSizeCandidate, 16, 34)),
    font: FONTS.includes(stored.font as ReaderFont) ? stored.font as ReaderFont : DEFAULTS.font,
    lineHeight: clamp(Number.isFinite(lineHeightCandidate) ? lineHeightCandidate : DEFAULTS.lineHeight, 1.4, 2.2),
    columnWidth: Math.round(clamp(Number.isFinite(widthCandidate) ? widthCandidate : DEFAULTS.columnWidth, 520, 980)),
    paragraphSpacing: clamp(Number.isFinite(paragraphCandidate) ? paragraphCandidate : DEFAULTS.paragraphSpacing, 0.6, 1.8),
    alignment: ALIGNMENTS.includes(stored.alignment as ReaderAlignment)
      ? stored.alignment as ReaderAlignment
      : DEFAULTS.alignment,
    theme: THEMES.includes(legacyTheme as ReaderTheme)
      ? legacyTheme as ReaderTheme
      : THEMES.includes(stored.theme as ReaderTheme)
        ? stored.theme as ReaderTheme
        : DEFAULTS.theme
  };
}

function persistPreferences(preferences: ReaderPreferences): void {
  safeStorageSet(PREFERENCES_KEY, JSON.stringify(preferences));
  // Keep readerEngine.ts's existing controls and storage contract in sync.
  safeStorageSet(LEGACY_FONT_KEY, String(preferences.fontSize));
  safeStorageSet(LEGACY_THEME_KEY, preferences.theme);
}

function fontFamily(font: ReaderFont): string {
  switch (font) {
    case "serif":
      return 'Georgia, "Times New Roman", serif';
    case "sans":
      return '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    case "book":
    default:
      return '"Cormorant Garamond", Georgia, serif';
  }
}

function applyTheme(theme: ReaderTheme): void {
  for (const candidate of THEMES) {
    document.body.classList.remove(`theme-${candidate}`);
  }
  document.body.classList.add(`theme-${theme}`);
}

function applyVisualPreferences(readerView: HTMLElement, preferences: ReaderPreferences): void {
  readerView.style.setProperty("--reader-paragraph-spacing", `${preferences.paragraphSpacing}em`);

  const viewer = readerView.querySelector<HTMLElement>(".viewer-text");
  if (viewer) {
    viewer.style.fontSize = `${preferences.fontSize}px`;
    viewer.style.fontFamily = fontFamily(preferences.font);
    viewer.style.lineHeight = String(preferences.lineHeight);
    viewer.style.maxWidth = `${preferences.columnWidth}px`;
    viewer.style.textAlign = preferences.alignment;
    viewer.style.textWrap = "pretty";
  }

  applyTheme(preferences.theme);
}

function applyAndPersist(readerView: HTMLElement, preferences: ReaderPreferences): void {
  applyVisualPreferences(readerView, preferences);
  persistPreferences(preferences);
}

function radioOption(
  name: string,
  value: string,
  label: string,
  checked: boolean
): string {
  return `<label class="reader-preferences-option">
    <input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}>
    <span>${label}</span>
  </label>`;
}

function openPreferencesPanel(readerView: HTMLElement, trigger: HTMLButtonElement): void {
  document.querySelector(".reader-preferences-backdrop")?.remove();

  let preferences = readPreferences();
  applyVisualPreferences(readerView, preferences);

  const backdrop = document.createElement("div");
  backdrop.className = "reader-preferences-backdrop";

  const panel = document.createElement("section");
  panel.className = "reader-preferences-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Настройки чтения");

  panel.innerHTML = `
    <div class="reader-preferences-head">
      <h2 class="reader-preferences-title">Настройки чтения</h2>
      <button type="button" class="ghost-btn" data-reader-preferences-close>Закрыть</button>
    </div>
    <div class="reader-preferences-body">
      <fieldset class="reader-preferences-group">
        <legend>Шрифт</legend>
        <div class="reader-preferences-options">
          ${radioOption("reader-font", "book", "Книжный", preferences.font === "book")}
          ${radioOption("reader-font", "serif", "Классический", preferences.font === "serif")}
          ${radioOption("reader-font", "sans", "Без засечек", preferences.font === "sans")}
        </div>
      </fieldset>

      <label class="reader-preferences-group">
        <span class="reader-preferences-label">Размер текста</span>
        <span class="reader-preferences-range-row">
          <input class="reader-preferences-range" data-pref="fontSize" type="range" min="16" max="34" step="1" value="${preferences.fontSize}">
          <span class="reader-preferences-value" data-value="fontSize">${preferences.fontSize} px</span>
        </span>
      </label>

      <label class="reader-preferences-group">
        <span class="reader-preferences-label">Межстрочный интервал</span>
        <span class="reader-preferences-range-row">
          <input class="reader-preferences-range" data-pref="lineHeight" type="range" min="1.4" max="2.2" step="0.05" value="${preferences.lineHeight}">
          <span class="reader-preferences-value" data-value="lineHeight">${preferences.lineHeight.toFixed(2)}</span>
        </span>
      </label>

      <label class="reader-preferences-group">
        <span class="reader-preferences-label">Ширина текста</span>
        <span class="reader-preferences-range-row">
          <input class="reader-preferences-range" data-pref="columnWidth" type="range" min="520" max="980" step="20" value="${preferences.columnWidth}">
          <span class="reader-preferences-value" data-value="columnWidth">${preferences.columnWidth} px</span>
        </span>
      </label>

      <label class="reader-preferences-group">
        <span class="reader-preferences-label">Интервал между абзацами</span>
        <span class="reader-preferences-range-row">
          <input class="reader-preferences-range" data-pref="paragraphSpacing" type="range" min="0.6" max="1.8" step="0.05" value="${preferences.paragraphSpacing}">
          <span class="reader-preferences-value" data-value="paragraphSpacing">${preferences.paragraphSpacing.toFixed(2)} em</span>
        </span>
      </label>

      <fieldset class="reader-preferences-group">
        <legend>Выравнивание</legend>
        <div class="reader-preferences-options">
          ${radioOption("reader-alignment", "left", "По левому краю", preferences.alignment === "left")}
          ${radioOption("reader-alignment", "justify", "По ширине", preferences.alignment === "justify")}
        </div>
      </fieldset>

      <fieldset class="reader-preferences-group">
        <legend>Тема</legend>
        <div class="reader-preferences-options four">
          ${radioOption("reader-theme", "dark", "Тёмная", preferences.theme === "dark")}
          ${radioOption("reader-theme", "default", "Светлая", preferences.theme === "default")}
          ${radioOption("reader-theme", "purple", "Фиолетовая", preferences.theme === "purple")}
          ${radioOption("reader-theme", "red", "Красная", preferences.theme === "red")}
        </div>
      </fieldset>

      <div class="reader-preferences-footer">
        <button type="button" class="reader-preferences-reset" data-reader-preferences-reset>Сбросить настройки</button>
        <button type="button" class="ghost-btn" data-reader-preferences-close>Готово</button>
      </div>
    </div>
  `;

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const updateValues = (): void => {
    const fontSizeValue = panel.querySelector<HTMLElement>('[data-value="fontSize"]');
    const lineHeightValue = panel.querySelector<HTMLElement>('[data-value="lineHeight"]');
    const columnWidthValue = panel.querySelector<HTMLElement>('[data-value="columnWidth"]');
    const paragraphValue = panel.querySelector<HTMLElement>('[data-value="paragraphSpacing"]');

    if (fontSizeValue) fontSizeValue.textContent = `${preferences.fontSize} px`;
    if (lineHeightValue) lineHeightValue.textContent = preferences.lineHeight.toFixed(2);
    if (columnWidthValue) columnWidthValue.textContent = `${preferences.columnWidth} px`;
    if (paragraphValue) paragraphValue.textContent = `${preferences.paragraphSpacing.toFixed(2)} em`;
  };

  const syncControls = (): void => {
    const setRange = (key: string, value: number) => {
      const input = panel.querySelector<HTMLInputElement>(`[data-pref="${key}"]`);
      if (input) input.value = String(value);
    };

    setRange("fontSize", preferences.fontSize);
    setRange("lineHeight", preferences.lineHeight);
    setRange("columnWidth", preferences.columnWidth);
    setRange("paragraphSpacing", preferences.paragraphSpacing);

    for (const input of Array.from(panel.querySelectorAll<HTMLInputElement>('input[name="reader-font"]'))) {
      input.checked = input.value === preferences.font;
    }
    for (const input of Array.from(panel.querySelectorAll<HTMLInputElement>('input[name="reader-alignment"]'))) {
      input.checked = input.value === preferences.alignment;
    }
    for (const input of Array.from(panel.querySelectorAll<HTMLInputElement>('input[name="reader-theme"]'))) {
      input.checked = input.value === preferences.theme;
    }

    updateValues();
  };

  const close = (): void => {
    window.removeEventListener("keydown", handleKeyDown, true);
    backdrop.remove();
    trigger.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  backdrop.addEventListener("mousedown", event => {
    if (event.target === backdrop) close();
  });

  for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-reader-preferences-close]"))) {
    button.addEventListener("click", close);
  }

  panel.querySelector<HTMLButtonElement>("[data-reader-preferences-reset]")?.addEventListener("click", () => {
    preferences = { ...DEFAULTS };
    applyAndPersist(readerView, preferences);
    syncControls();
  });

  panel.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    const key = target.dataset.pref;
    if (!key) return;

    if (key === "fontSize") preferences.fontSize = Math.round(clamp(Number(target.value), 16, 34));
    if (key === "lineHeight") preferences.lineHeight = clamp(Number(target.value), 1.4, 2.2);
    if (key === "columnWidth") preferences.columnWidth = Math.round(clamp(Number(target.value), 520, 980));
    if (key === "paragraphSpacing") preferences.paragraphSpacing = clamp(Number(target.value), 0.6, 1.8);

    applyAndPersist(readerView, preferences);
    updateValues();
  });

  panel.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.name === "reader-font" && FONTS.includes(target.value as ReaderFont)) {
      preferences.font = target.value as ReaderFont;
    } else if (target.name === "reader-alignment" && ALIGNMENTS.includes(target.value as ReaderAlignment)) {
      preferences.alignment = target.value as ReaderAlignment;
    } else if (target.name === "reader-theme" && THEMES.includes(target.value as ReaderTheme)) {
      preferences.theme = target.value as ReaderTheme;
    } else {
      return;
    }

    applyAndPersist(readerView, preferences);
  });

  window.addEventListener("keydown", handleKeyDown, true);
  requestAnimationFrame(() => panel.querySelector<HTMLButtonElement>("[data-reader-preferences-close]")?.focus());
}

function enhanceReader(readerView: HTMLElement): void {
  if (readerView.dataset.readerPreferencesEnhanced === "true") return;
  readerView.dataset.readerPreferencesEnhanced = "true";

  let lastAppliedSignature = "";

  const sync = (): void => {
    const preferences = readPreferences();
    const signature = JSON.stringify(preferences);
    const viewer = readerView.querySelector<HTMLElement>(".viewer-text");

    if (viewer && signature !== lastAppliedSignature) {
      applyVisualPreferences(readerView, preferences);
      lastAppliedSignature = signature;
    } else if (viewer) {
      // readerEngine can rewrite its legacy inline font size after our first
      // enhancement. Reassert the complete preference set without persisting.
      applyVisualPreferences(readerView, preferences);
    }

    const actions = readerView.querySelector<HTMLElement>(".reader-overlay-actions");
    if (actions && !actions.querySelector(".reader-preferences-trigger")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost-btn reader-preferences-trigger";
      button.textContent = "Aa";
      button.setAttribute("aria-label", "Настройки чтения");
      button.addEventListener("click", () => openPreferencesPanel(readerView, button));
      actions.prepend(button);
    }
  };

  sync();

  const observer = new MutationObserver(sync);
  observer.observe(readerView, { childList: true, subtree: true });

  const removalObserver = new MutationObserver(() => {
    if (readerView.isConnected) return;
    observer.disconnect();
    removalObserver.disconnect();
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });
}

export function installReaderPreferences(): () => void {
  const scan = (): void => {
    for (const readerView of Array.from(document.querySelectorAll<HTMLElement>(".reader-view"))) {
      enhanceReader(readerView);
    }
  };

  scan();

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}
