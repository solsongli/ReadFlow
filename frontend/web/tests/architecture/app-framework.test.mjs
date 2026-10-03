import test from "node:test";
import assert from "node:assert/strict";

import {
  createStore,
} from "../../src/platform/store/store.js";

test("createStore owns immutable snapshots and action updates", () => {
  const store = createStore({
    name: "library",
    initialState: {
      items: [],
      selectedId: "",
    },
    actions: {
      addBook(state, book) {
        state.items.push(book);
        return state;
      },
      selectBook(state, jobId) {
        return {
          ...state,
          selectedId: jobId,
        };
      },
    },
  });

  const events = [];
  const unsubscribe = store.subscribe((snapshot, meta) => {
    events.push({ snapshot, meta });
  });

  store.actions.addBook({ jobId: "job-1" });
  store.actions.selectBook("job-1");
  unsubscribe();
  store.actions.addBook({ jobId: "job-2" });

  assert.deepEqual(store.getSnapshot(), {
    items: [{ jobId: "job-1" }, { jobId: "job-2" }],
    selectedId: "job-1",
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].meta.action, "addBook");
  assert.equal(events[0].meta.store, "library");
  assert.throws(() => {
    events[0].snapshot.items = [];
  }, TypeError);
});

test("createStore batches multiple updates into one subscriber notification", () => {
  const store = createStore({
    name: "status",
    initialState: {
      stage: "ocr",
      percent: 0,
    },
    actions: {
      setStage(state, stage) {
        return {
          ...state,
          stage,
        };
      },
      setPercent(state, percent) {
        return {
          ...state,
          percent,
        };
      },
    },
  });
  const events = [];
  store.subscribe((snapshot, meta) => {
    events.push({ snapshot, meta });
  });

  const result = store.batch(({ actions }) => {
    actions.setStage("translation");
    actions.setPercent(75);
    return "done";
  });

  assert.equal(result, "done");
  assert.deepEqual(store.getSnapshot(), {
    stage: "translation",
    percent: 75,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].meta.action, "setStage");
  assert.deepEqual(events[0].meta.previousState, {
    stage: "ocr",
    percent: 0,
  });
});
