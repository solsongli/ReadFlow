import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { installDesktopShutdown } from "./desktop-shutdown.js";

for (const trigger of ["SIGTERM", "SIGINT", "SIGHUP", "tray"]) {
  test(`${trigger} uses the same awaited cleanup and concurrent quit requests run it once`, async () => {
    const app = new EventEmitter();
    const processEvents = new EventEmitter();
    const events = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    app.quit = () => {
      let prevented = false;
      app.emit("before-quit", { preventDefault() { prevented = true; } });
      if (!prevented) { events.push("exit"); app.emit("will-quit"); }
    };
    const shutdown = installDesktopShutdown({ app, processEvents,
      markStopping() { events.push("stopping"); },
      async cleanup() { events.push("cleanup"); await gate; events.push("cleaned"); },
    });
    if (trigger === "tray") app.quit();
    else processEvents.emit(trigger);
    app.quit();
    processEvents.emit("SIGTERM");
    await Promise.resolve();
    assert.deepEqual(events, ["stopping", "cleanup"]);
    release();
    await shutdown.requestShutdown();
    assert.deepEqual(events, ["stopping", "cleanup", "cleaned", "exit"]);
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) assert.equal(processEvents.listenerCount(signal), 0);
  });
}
