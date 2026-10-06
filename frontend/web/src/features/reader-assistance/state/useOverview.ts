import { useEffect, useMemo, useRef, useState } from "react";
import { assistanceApi } from "./api.js";
import { assistanceError, type AiStatus } from "../domain/assistance.js";
import type { Overview } from "../domain/overview.js";

export function useOverview(item: string, attachment?: string) {
  const api = useMemo(() => assistanceApi(item), [item]);
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState<Overview | null>(null);
  const [pending, setPending] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const approved = useRef("");
  useEffect(() => () => abort.current?.abort(), [item]);
  async function open() {
    if (abort.current) return;
    setOpened(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    try {
      const saved = await api.overview(controller.signal);
      if (!controller.signal.aborted)
        setValue(saved.result?.attachment_id === attachment ? saved.result : null);
    } catch (failure) {
      if (!controller.signal.aborted) setError(assistanceError(failure, true).message);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  }
  async function generate(confirmed?: AiStatus, remember = false) {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const status = await api.status(controller.signal);
      const saved = await api.overview(controller.signal);
      if (
        (confirmed && confirmed.target !== status.target) ||
        (!confirmed && saved.consent_target !== status.target && approved.current !== status.target)
      ) {
        setPending(status);
        return;
      }
      if (confirmed) approved.current = status.target;
      setPending(null);
      let complete = false;
      await api.ask(
        {
          attachment_id: attachment,
          target: status.target,
          consent: approved.current === status.target,
          remember,
        },
        controller.signal,
        (event) => {
          if (event.type === "error") throw event;
          if (event.type === "done") {
            setValue(JSON.parse(event.text || "{}"));
            complete = true;
          }
        },
        "overview",
      );
      if (!complete) throw { code: "network" };
    } catch (failure) {
      if (!controller.signal.aborted) setError(assistanceError(failure, true).message);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  }
  function cancel() {
    abort.current?.abort();
    setPending(null);
  }
  return {
    opened,
    value,
    pending,
    busy,
    error,
    open,
    generate,
    cancel,
    close: () => {
      cancel();
      setOpened(false);
    },
    approve: (remember: boolean) => pending && void generate(pending, remember),
  };
}
