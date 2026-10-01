"""Resolve the existing AI package in source and packaged desktop layouts.

Only application-owned code directories are considered; this never reads model
configuration, credentials or user documents, and never starts a model request.
"""
from pathlib import Path
import sys

_package = Path(__file__).resolve().parent
for _candidate in (_package.parent / 'ai', _package.parents[1] / 'ai_service'):
    if (_candidate / 'retainpdf_ai' / '__init__.py').is_file():
        if str(_candidate) not in sys.path:
            sys.path.insert(0, str(_candidate))
        break

from retainpdf_ai.tools import Tool, ToolRegistry
from retainpdf_ai.request_control import RequestControl, AIRequestError, AIRequestCancelled
from retainpdf_ai.retrieval_agent import RetrievalAgent
from retainpdf_ai.agent_llm import build_deepseek_chat_fn
from retainpdf_ai.config import Settings
