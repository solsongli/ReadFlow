"""Per-task timing counters. Stores numbers only, never prompts, credentials or responses."""
from collections import defaultdict
from contextlib import contextmanager
import threading
import time


class TranslationMetrics:
    def __init__(self, clock=time.perf_counter):
        self.clock, self.lock = clock, threading.RLock()
        self.started = clock()
        self.timings = defaultdict(float)
        self.phases = {}
        self.batches = defaultdict(int)
        self.input_estimates = defaultdict(int)
        self.usage = defaultdict(lambda: [0, 0, 0])
        self.active = self.peak = self.requests = 0
        self.integral = 0.0
        self.last = self.started
        self.first_request = None
        self.last_request = None
        self.policy = {}

    @contextmanager
    def stage(self, name):
        before = self.clock()
        try:
            yield
        finally:
            with self.lock:
                self.timings[name] += self.clock() - before

    @contextmanager
    def batch(self, phase, estimated_tokens):
        start = self.clock()
        with self.lock:
            self.batches[phase] += 1
            self.input_estimates[phase] += estimated_tokens
        try:
            yield
        finally:
            with self.lock:
                old = self.phases.get(phase, (start, start))
                self.phases[phase] = (min(old[0], start), max(old[1], self.clock()))

    def network(self, delta):
        with self.lock:
            now = self.clock()
            self.integral += self.active * (now - self.last)
            self.last = now
            self.active += delta
            if delta > 0:
                self.requests += 1
                self.first_request = self.first_request if self.first_request is not None else now
                self.peak = max(self.peak, self.active)
            else:
                self.last_request = now

    def tokens(self, phase, usage):
        if not isinstance(usage, dict):
            return
        with self.lock:
            if (
                isinstance(usage.get("prompt_tokens"), (int, float))
                and not isinstance(usage["prompt_tokens"], bool)
                and 0 <= usage["prompt_tokens"] <= 10**9
            ):
                self.usage[phase][0] += max(0, int(usage.get("prompt_tokens") or 0))
                completion = usage.get("completion_tokens")
                self.usage[phase][1] += (
                    int(completion)
                    if isinstance(completion, (int, float)) and 0 <= completion <= 10**9
                    else 0
                )
                self.usage[phase][2] += 1

    def snapshot(self):
        with self.lock:
            now = self.clock()
            end = now if self.active else self.last_request
            duration = max(0, (end or 0) - (self.first_request or 0))
            integral = self.integral + self.active * (now - self.last)
            phases = {k + "_wall": round(b - a, 4) for k, (a, b) in self.phases.items()}
            batch_stats = {}
            for phase, count in self.batches.items():
                prompt, completion, reported = self.usage[phase]
                batch_stats[phase] = {
                    "count": count,
                    "estimated_prompt_tokens": self.input_estimates[phase],
                    "reported_prompt_tokens": prompt,
                    "reported_completion_tokens": completion,
                    "usage_responses": reported,
                    "mean_prompt_tokens": round(prompt / count, 1) if reported else None,
                    "mean_completion_tokens": round(completion / count, 1) if reported else None,
                    "mean_estimated_prompt_tokens": round(self.input_estimates[phase] / count, 1),
                }
            return {
                "policy": dict(self.policy),
                "timings_s": {
                    **dict.fromkeys(
                        ("extraction", "terminology", "main_batches_wall", "qa_retranslation_wall", "render"),
                        0,
                    ),
                    **{k: round(v, 4) for k, v in self.timings.items()},
                    **phases,
                },
                "requests": {
                    "count": self.requests,
                    "max_concurrency": self.peak,
                    "mean_concurrency": round(integral / duration, 3) if duration else 0,
                    "window_seconds": round(duration, 4),
                },
                "batches": batch_stats,
            }
