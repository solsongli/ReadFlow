"""Public desktop status, deliberately separate from the official Connector wire protocol."""
import os
import re


def public_connector_status(state, version=None):
    version = os.environ.get('READFLOW_APP_VERSION', '') if version is None else version
    version = version if re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][\w.-]+)?', version or '') else '开发版'
    status = state.get('status', 'disabled')
    return {'client': 'ReadFlow', 'product_version': version,
            'status': status if status in ('listening', 'busy', 'disabled', 'error') else 'error',
            **{key: state.get(key) for key in ('port', 'occupant')},
            **{key: state[key] for key in ('code', 'message') if key in state}}
