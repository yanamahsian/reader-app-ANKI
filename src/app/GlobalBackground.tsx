import { getCurrentHeroImagePath } from "./hero";

// Fixed, app-wide background photo + darkening scrim. Rendered exactly
// once, by AppShell, and never remounted while navigating between
// Home / Library / Collections / Collection Detail / Book Detail /
// Author Detail / Profile / My Library / Notes / Subscription /
// Settings / Support — it only disappears when Reader opens (App.tsx
// simply doesn't render AppShell at all in that case). Every page's
// own background is transparent (see the ".*-view"/".*-detail" rules
// in global.css) specifically so this shows through underneath them;
// individual pages only add their own translucent surfaces where text
// needs extra contrast, never a solid backdrop that would hide this.
export function GlobalBackground() {

  const heroPath = getCurrentHeroImagePath();

  return (
    <div className="global-bg" aria-hidden="true">
      <div
        className="global-bg-image"
        style={{ backgroundImage: `url("${heroPath}")` }}
      />
      <div className="global-bg-shade" />
    </div>
  );

}
