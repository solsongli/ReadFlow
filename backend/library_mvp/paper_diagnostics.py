"""Public diagnostics contain fixed stage / class names and vetted codes, never response text."""
import re

PROVIDER_CODES = frozenset(
    "invalid_api_key authentication_error unauthorized invalid_authentication "
    "insufficient_balance insufficient_quota balance_not_enough quota_exceeded rate_limit_exceeded "
    "rate_limit_error too_many_requests server_error internal_error internal_server_error "
    "invalid_request_error invalid_request model_not_found context_length_exceeded timeout "
    "content_filter resource_exhausted invalid_parameter unsupported_parameter".split()
)
STAGES = frozenset({"extract", "terms", "batch", "qa_retry", "parse", "render", "cache"})


def provider_code(value):
    if isinstance(value, int) and not isinstance(value, bool) and 100 <= value <= 599:
        return str(value)
    code = str(value).casefold() if value is not None else ""
    return code if code in PROVIDER_CODES else "unrecognized" if code else None


def diagnostic(error, stage):
    stage = getattr(error, "safe_stage", stage)
    status = getattr(error, "http_status", None)
    if status is None:
        status = getattr(getattr(error, "response", None), "status_code", None)
    name = type(error).__name__
    result = {
        "stage": stage if stage in STAGES else "batch",
        "exception": name if re.fullmatch("[A-Za-z][A-Za-z0-9_]{0,79}", name) else "Exception",
    }
    if type(status) is int and 100 <= status <= 599:
        result["http_status"] = status
    code = provider_code(getattr(error, "provider_code", None))
    if code:
        result["provider_code"] = code
    return result


def annotate(error, stage):
    if not getattr(error, "safe_stage", None):
        error.safe_stage = stage
    return error


def global_failure(error):
    status = getattr(error, "http_status", getattr(getattr(error, "response", None), "status_code", None))
    code = getattr(error, "code", "") or (getattr(error, "safe_error", {}) or {}).get("code", "")
    provider = getattr(error, "provider_code", "")
    return (
        status in (401, 402, 403)
        or code in {"credentials", "external_disabled", "cancelled", "service_closed"}
        or (
            provider in {"insufficient_balance", "insufficient_quota", "balance_not_enough", "quota_exceeded"}
        )
        or bool(re.search(r"insufficient[ _](?:balance|quota)|余额不足", str(error), re.I))
    )
