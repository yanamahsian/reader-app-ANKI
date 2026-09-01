from pathlib import Path

ui = Path("src/features/subscription/SubscriptionView.tsx")
text = ui.read_text()
ui_needle = '''    if (!isAuthenticated) {
      return {
        label: "Войти и оформить подписку",
'''
ui_replacement = '''    if (planDef.id === "academy") {
      if (currentPlanId === "academy") {
        return { label: "Текущий план", disabled: true, loading: false, variant: "primary", onClick: null };
      }
      return { label: "Скоро", disabled: true, loading: false, variant: "secondary", onClick: null };
    }

    if (!isAuthenticated) {
      return {
        label: "Войти и оформить подписку",
'''
if ui_needle not in text:
    raise SystemExit("SubscriptionView insertion point not found")
text = text.replace(ui_needle, ui_replacement, 1)
ui.write_text(text)

server = Path("supabase/functions/paddle-checkout/index.ts")
text = server.read_text()
checkout_needle = '''  if (!isPlan(plan)) {
    return jsonResponse({ status: "error", error: "invalid_plan", message: "plan must be library, atlas, or academy" }, 400);
  }
  if (!isInterval(interval)) {
'''
checkout_replacement = '''  if (!isPlan(plan)) {
    return jsonResponse({ status: "error", error: "invalid_plan", message: "plan must be library, atlas, or academy" }, 400);
  }
  // Academy remains visible as the future top tier, but recurring Academy
  // checkout is intentionally disabled until the Academy product layer is live.
  if (plan === "academy") {
    return jsonResponse({ status: "error", error: "plan_not_available" }, 409);
  }
  if (!isInterval(interval)) {
'''
if checkout_needle not in text:
    raise SystemExit("handleCheckout insertion point not found")
text = text.replace(checkout_needle, checkout_replacement, 1)

change_needle = '''  if (!isPlan(targetPlan)) {
    return jsonResponse({ status: "error", error: "invalid_plan", message: "plan must be library, atlas, or academy" }, 400);
  }
  if (!isInterval(targetInterval)) {
'''
change_replacement = '''  if (!isPlan(targetPlan)) {
    return jsonResponse({ status: "error", error: "invalid_plan", message: "plan must be library, atlas, or academy" }, 400);
  }
  if (targetPlan === "academy") {
    return jsonResponse({ status: "error", error: "plan_not_available" }, 409);
  }
  if (!isInterval(targetInterval)) {
'''
if change_needle not in text:
    raise SystemExit("handleChangeSubscription insertion point not found")
text = text.replace(change_needle, change_replacement, 1)
server.write_text(text)
