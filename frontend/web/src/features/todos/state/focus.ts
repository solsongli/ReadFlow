/**
 * "新建待办" may run before the desk mounts. The request waits on the document element
 * (not module state) and the panel consumes it when it appears.
 */
const EVENT = "readflow:new-todo";

export function requestNewTodo() {
  document.documentElement.dataset.readflowNewTodo = "pending";
  window.dispatchEvent(new Event(EVENT));
}

export function onNewTodoRequest(focus: () => void) {
  const handle = () => {
    const root = document.documentElement;
    if (root.dataset.readflowNewTodo !== "pending") return;
    delete root.dataset.readflowNewTodo;
    focus();
  };
  handle();
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
