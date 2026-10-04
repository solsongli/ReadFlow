import { useEffect, useMemo, useRef, useState } from "react";
import { assistanceApi } from "./api.js";
import {
  assistanceError,
  needsConsent,
  type AiStatus,
  type AssistanceError,
  type ChatMessage,
  type ReaderContext,
} from "../domain/assistance.js";
export function useReaderChat(item: string) {
  const api = useMemo(() => assistanceApi(item), [item]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [consent, setConsent] = useState("");
  const [pending, setPending] = useState<{ question: string; context: ReaderContext; target: string } | null>(
    null,
  );
  const [sent, setSent] = useState<{ question: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AssistanceError | null>(null);
  const operation = useRef(false);
  const approved = useRef("");
  const abort = useRef<AbortController | null>(null);
  async function load() {
    try {
      const conversation = await api.load();
      setMessages(conversation.messages);
      setConsent(conversation.consent_target);
      setStatus(await api.status());
      setError(null);
    } catch (failure) {
      setError(assistanceError(failure, true));
    }
  }
  useEffect(() => () => abort.current?.abort(), [item]);
  async function send(
    question: string,
    context: ReaderContext,
    confirmed = false,
    remember = false,
    expectedTarget?: string,
  ) {
    if (operation.current || !question.trim()) {
      return;
    }
    operation.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    let config = status;
    try {
      config = await api.status(controller.signal);
      setStatus(config);
      const persisted = await api.load(controller.signal);
      setConsent(persisted.consent_target);
      if (
        (confirmed && expectedTarget !== config.target) ||
        (!confirmed && needsConsent(persisted.consent_target, config, approved.current))
      ) {
        setPending({ question, context, target: config.target });
        return;
      }
      if (confirmed) {
        approved.current = config.target;
      }
      setPending(null);
      setBusy(true);
      setAnswer("");
      let complete = false;
      await api.ask(
        {
          question,
          ...context,
          target: config.target,
          consent: confirmed || approved.current === config.target,
          remember,
        },
        controller.signal,
        (event) => {
          if (event.type === "delta") {
            setAnswer((text) => text + (event.text || ""));
          }
          if (event.type === "done") {
            complete = true;
            setAnswer(event.text || "");
          }
          if (event.type === "error") {
            throw event;
          }
        },
      );
      if (!complete) {
        throw { code: "network" };
      }
      const saved = await api.load(controller.signal);
      setMessages(saved.messages);
      setConsent(saved.consent_target);
      setSent({ question });
      setAnswer("");
    } catch (failure) {
      if (!abort.current?.signal.aborted) {
        setError(assistanceError(failure, true));
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function clear() {
    abort.current?.abort();
    approved.current = "";
    try {
      const result = await api.clear();
      setMessages(result.messages);
      setConsent("");
      setPending(null);
      setAnswer("");
    } catch (failure) {
      setError(assistanceError(failure, true));
    }
  }
  return {
    messages,
    sent,
    status,
    pending,
    answer,
    busy,
    error,
    load,
    send,
    clear,
    cancel: () => {
      abort.current?.abort();
      setPending(null);
    },
    approve: (remember: boolean) =>
      pending && void send(pending.question, pending.context, true, remember, pending.target),
  };
}
