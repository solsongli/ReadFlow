// Let the DOM own these keys: workbench text size, or PDF zoom inside a reader.
function rendererOwnsZoom(input) {
  return input.type === "keyDown" && (input.control || input.meta) && !input.alt
    && ["=", "+", "-", "0"].includes(input.key);
}

function installRendererZoomShortcuts(contents) {
  contents.on("before-input-event", (_event, input) => {
    let workbench = false;
    try { workbench = new URL(contents.getURL()).pathname.endsWith("/workbench.html"); } catch { /* Startup / legacy page. */ }
    contents.setIgnoreMenuShortcuts(workbench && Boolean(rendererOwnsZoom(input)));
  });
}
module.exports = { installRendererZoomShortcuts, rendererOwnsZoom };
