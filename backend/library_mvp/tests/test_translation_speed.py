"""Offline provider negotiation, bounded adaptive concurrency and cancellable I/O."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import httpx
from backend.library_mvp.ai_runtime import RequestControl
from backend.library_mvp.paper_blocks_model import service_fingerprint
from backend.library_mvp.paper_blocks_transport import run_batch
from backend.library_mvp.reader_assistance_transport import run_chat
from backend.library_mvp.translation_speed import TranslationPolicy, workers
from backend.library_mvp.translation_speed import parallel_workers
from ops.development.readflow_fake_openai import completion_response, response_delay


class TranslationSpeedTests(unittest.TestCase):
    def test_deepseek_ramps_from_eight_to_sixteen_and_global_429_halves_it(self):
        policy = TranslationPolicy()
        config = self.config()
        self.assertEqual(parallel_workers(config), 16)
        self.assertEqual(parallel_workers(self.config(workers=3)), 3)
        limits = []
        for _ in range(17):
            with policy.slot(config, RequestControl(10)) as permit:
                limits.append(policy.limiter.limit)
                policy.limiter.succeeded(permit.epoch, permit.ramp)
        self.assertEqual(limits[0], 8)
        self.assertEqual(limits[-1], 16)
        self.assertEqual(sorted(set(limits)), [8, 10, 12, 14, 16])
        with policy.slot(config, RequestControl(10)) as permit:
            policy.limiter.rate_limited(permit.epoch)
            self.assertEqual(policy.limiter.limit, 8)

    def config(self, **changes):
        return {
            "base_url": "https://api.deepseek.com/v1",
            "model": "readflow-test",
            "api_key": "offline-fixture-only",
            **changes,
        }

    def test_defaults_bounds_and_fingerprint_ignore_speed_and_credentials(self):
        self.assertEqual(workers(self.config()), 8)
        self.assertEqual(workers(self.config(base_url="https://other.invalid/v1")), 4)
        for candidate, expected in ((3, 3), (200, 16), (0, 1), ("invalid", 8)):
            self.assertEqual(workers(self.config(workers=candidate)), expected)
        first = service_fingerprint(self.config(), [])
        second = service_fingerprint(self.config(disable_thinking=False, workers=16, api_key="another"), [])
        self.assertEqual(first, second)

    def test_thinking_is_translation_only_official_host_only_and_opt_out(self):
        for config, disabled in (
            (self.config(), True),
            (self.config(disable_thinking=False), False),
            (self.config(base_url="https://api.deepseek.com.other.invalid/v1"), False),
        ):
            calls = []

            def handle(request):
                value = json.loads(request.content)
                calls.append(value)
                return httpx.Response(200, json=completion_response(value)[1])

            run_chat(
                config,
                [{"role": "user", "content": "evidence"}],
                translation=True,
                transport=httpx.MockTransport(handle),
            )
            self.assertEqual("thinking" in calls[0], disabled)
            if disabled:
                self.assertEqual(calls[0]["thinking"], {"type": "disabled"})
            if config["base_url"] == "https://api.deepseek.com/v1":
                self.assertNotIn("temperature", calls[0])
        ai_calls = []

        def ai(request):
            ai_calls.append(json.loads(request.content))
            return httpx.Response(200, json=completion_response(ai_calls[-1])[1])

        run_chat(self.config(), [{"role": "user", "content": "evidence"}], transport=httpx.MockTransport(ai))
        self.assertNotIn("thinking", ai_calls[0], "AI chat and flashcard questions retain their own policy")

    def test_unsupported_thinking_is_retried_once_and_remembered_across_tasks(self):
        config = self.config(model="readflow-no-thinking")
        policy, calls = TranslationPolicy(), []

        def handle(request):
            body = json.loads(request.content)
            calls.append(body)
            status, value = completion_response(body)
            return httpx.Response(status, json=value)

        for _ in range(2):
            result = run_batch(config, [], policy=policy, transport=httpx.MockTransport(handle))
            self.assertEqual(result["notices"], ["thinking_unsupported"])
        self.assertEqual(["thinking" in c for c in calls], [True, False, False])
        self.assertEqual(len(policy.unsupported), 1)

    def test_selection_translation_retains_empty_response_validation(self):
        transport = httpx.MockTransport(lambda _: httpx.Response(200, json={
            "choices": [{"message": {"content": " "}, "finish_reason": "stop"}],
        }))
        with self.assertRaises(ValueError):
            run_chat(self.config(), [], translation=True, transport=transport)

    def test_429_halves_once_honors_retry_after_then_success_restores_gradually(self):
        policy, calls, delays = TranslationPolicy(), [], []
        config = self.config(workers=8)

        def handle(request):
            calls.append(json.loads(request.content))
            status, value = completion_response({**calls[-1], "model": "readflow-rate-limit"}, len(calls) - 1)
            return httpx.Response(status, json=value, headers={"Retry-After": "3"})

        run_batch(
            config,
            [],
            policy=policy,
            transport=httpx.MockTransport(handle),
            backoff=lambda seconds, _: delays.append(seconds),
        )
        self.assertEqual(delays, [3])
        self.assertEqual(policy.limiter.ceiling, 4)
        policy.limiter.rate_limited(0)  # Another response from the same rejected wave.
        self.assertEqual(policy.limiter.ceiling, 4)
        for _ in range(8):
            run_batch(config, [], policy=policy, transport=httpx.MockTransport(handle))
        self.assertEqual(policy.limiter.ceiling, 5)

    def test_cancel_interrupts_headers_and_streams_immediately(self):
        for before_headers in (True, False):
            control, arrived = RequestControl(30), threading.Event()

            class SlowStream(httpx.AsyncByteStream):
                async def __aiter__(self):
                    arrived.set()
                    await asyncio.sleep(30)
                    yield b"unused"

            async def handle(request):
                if before_headers:
                    arrived.set()
                    await asyncio.sleep(30)
                return httpx.Response(200, stream=SlowStream())

            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    run_batch, self.config(), [], control=control, transport=httpx.MockTransport(handle)
                )
                self.assertTrue(arrived.wait(2))
                start = time.monotonic()
                control.cancel("user_cancelled")
                with self.assertRaises(Exception):
                    future.result(timeout=1)
                self.assertLess(time.monotonic() - start, 0.5)

    def test_global_limit_across_tasks_and_cancelled_waiter_cleanup(self):
        limiter = TranslationPolicy().limiter
        release, ready, lock = threading.Event(), threading.Event(), threading.Lock()
        count, peak = 0, 0

        def call():
            nonlocal count, peak
            with limiter.slot(RequestControl(10), 4):
                with lock:
                    count += 1
                    peak = max(peak, count)
                    if count == 4:
                        ready.set()
                release.wait(2)
                with lock:
                    count -= 1

        with ThreadPoolExecutor(max_workers=12) as pool:
            futures = [pool.submit(call) for _ in range(12)]
            self.assertTrue(ready.wait(2))
            control = RequestControl(10)
            control.cancel()
            with self.assertRaises(Exception), limiter.slot(control, 4):
                self.fail("Cancelled waiter must never acquire")
            release.set()
            for future in futures:
                future.result(timeout=3)
        self.assertEqual(peak, 4)
        self.assertEqual(limiter.active, 0)
        self.assertFalse(limiter.waiting)
        self.assertFalse(limiter.requests)

    def test_cancel_closes_a_real_loopback_socket_before_headers(self):
        arrived, disconnected = threading.Event(), threading.Event()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                arrived.set()
                self.connection.settimeout(2)
                if self.connection.recv(1) == b"":
                    disconnected.set()

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            control = RequestControl(30)
            try:
                config = self.config(base_url=f"http://127.0.0.1:{server.server_port}/v1")
                with ThreadPoolExecutor(max_workers=1) as pool:
                    future = pool.submit(run_batch, config, [], control=control)
                    self.assertTrue(arrived.wait(2))
                    start = time.monotonic()
                    control.cancel("user_cancelled")
                    with self.assertRaises(Exception):
                        future.result(timeout=1)
                    self.assertTrue(disconnected.wait(0.5))
                    self.assertLess(time.monotonic() - start, 0.5)
            finally:
                control.cancel()
                server.shutdown()
                thread.join(2)

    def test_fake_delay_is_exactly_input_independent_output_latency(self):
        response = {"choices": [{"message": {"content": "x" * 2000}}]}
        self.assertEqual(response_delay(response, 1.5, 0.5), 2.5)
