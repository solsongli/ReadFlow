"""Process-local translation policy; no credentials or source text are retained here."""
from collections import deque
from contextlib import contextmanager
import threading
from urllib.parse import urlsplit
from .reader_assistance_model import target


def official_deepseek(config):
    return urlsplit(config.get("base_url", "")).hostname == "api.deepseek.com"


def workers(config):
    value = config.get("workers")
    if isinstance(value, (int, str)) and not isinstance(value, bool):
        try:
            return max(1, min(16, int(value)))
        except ValueError:
            pass
    return 8 if official_deepseek(config) else 4


class TranslationPolicy:
    def __init__(self):
        self.limiter = AdaptiveLimiter()
        self.lock = threading.Lock()
        self.unsupported = set()

    def thinking(self, config):
        with self.lock:
            return (
                official_deepseek(config)
                and config.get("disable_thinking") is not False
                and target(config) not in self.unsupported
            )

    def reject_thinking(self, config):
        with self.lock:
            # Bounded, process-local capability memory. No persistent cache fingerprint changes.
            if len(self.unsupported) >= 128:
                self.unsupported.clear()
            self.unsupported.add(target(config))

    def notices(self, config):
        with self.lock:
            return ["thinking_unsupported"] if target(config) in self.unsupported else []


class AdaptiveLimiter:
    """FIFO permits shared by every task, including retries and selection translation.

    When jobs have different settings, their lowest requested cap wins. A reduction
    drains existing calls naturally; no replacement starts above the new cap.
    """

    def __init__(self):
        self.condition = threading.Condition()
        self.waiting = deque()
        self.requests = {}
        self.active = 0
        self.ceiling = 16
        self.successes = 0
        self.epoch = 0

    @property
    def limit(self):
        return min(self.ceiling, min(self.requests.values(), default=16))

    @contextmanager
    def slot(self, control, requested):
        permit = Permit(self, control)
        with self.condition:
            self.requests[permit] = max(1, min(16, requested))
        try:
            permit.acquire()
            yield permit
        finally:
            permit.release()
            with self.condition:
                self.requests.pop(permit, None)
                self.condition.notify_all()

    def rate_limited(self, epoch):
        with self.condition:
            # A simultaneous wave of 429s halves once, rather than collapsing 8 -> 1.
            if epoch == self.epoch:
                self.ceiling = max(1, self.limit // 2)
                self.epoch += 1
            self.successes = 0
            self.condition.notify_all()

    def succeeded(self, epoch):
        with self.condition:
            if epoch != self.epoch:
                return
            self.successes += 1
            if self.successes >= max(4, self.limit * 2):
                self.ceiling = min(16, self.ceiling + 1)
                self.successes = 0
                self.condition.notify_all()


class Permit:
    def __init__(self, limiter, control):
        self.limiter, self.control = limiter, control
        self.held = False
        self.epoch = 0

    def acquire(self):
        limiter = self.limiter
        with limiter.condition:
            limiter.waiting.append(self)
            try:
                while True:
                    self.control.raise_if_stopped()
                    if limiter.waiting[0] is self and limiter.active < limiter.limit:
                        limiter.active += 1
                        self.held = True
                        self.epoch = limiter.epoch
                        return
                    limiter.condition.wait(0.05)
            finally:
                limiter.waiting.remove(self)
                limiter.condition.notify_all()

    def release(self):
        with self.limiter.condition:
            if self.held:
                self.limiter.active -= 1
                self.held = False
                self.limiter.condition.notify_all()

    def backoff(self, seconds, wait):
        self.release()
        wait(seconds, self.control)
        self.acquire()
