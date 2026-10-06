"""Transport failures must surface as a network error, not the generic 'other'."""
import unittest

import httpx

from backend.library_mvp.reader_assistance_model import mapped_error


class NetworkErrorMappingTests(unittest.TestCase):
    def test_empty_message_transport_errors_map_to_network(self):
        request = httpx.Request("POST", "https://api.example.invalid/v1/chat/completions")
        for error in (httpx.ConnectTimeout("", request=request), httpx.ReadTimeout("", request=request),
                      httpx.ConnectError("", request=request)):
            with self.subTest(type(error).__name__):
                result = mapped_error(error, "sk-test-secret-value")
                self.assertEqual(result["code"], "network")
                self.assertIn("网络连接", result["message"])

    def test_secret_is_never_echoed(self):
        result = mapped_error(RuntimeError("bad key sk-test-secret-value"), "sk-test-secret-value")
        self.assertNotIn("sk-test-secret-value", str(result))


if __name__ == "__main__":
    unittest.main()
