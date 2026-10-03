"""Deterministic SM-2 variant; learning dates are supplied in the user's local timezone."""
from datetime import date, timedelta
from math import floor
from .store import StoreError


def schedule(state, rating, day):
    if type(rating) is not int or rating not in range(1, 5):
        raise StoreError('INVALID_RATING', '请选择一个复习评分。')
    try:
        today = date.fromisoformat(day)
    except (ValueError, TypeError):
        raise StoreError('INVALID_DAY', '学习日格式应为 YYYY-MM-DD。')
    ease = max(1.3, float(state.get('ease', 2.5)))
    previous = max(0, int(state.get('interval', 0)))
    repetitions = max(0, int(state.get('repetitions', 0)))
    if rating == 1:
        interval, repetitions, ease = 0, 0, max(1.3, ease - .2)
    elif rating == 2:
        interval, ease = max(1, floor(previous * 1.2 + .5)), max(1.3, ease - .15)
        repetitions += 1
    elif rating == 3:
        interval = 1 if repetitions == 0 else 6 if repetitions == 1 else max(1, floor(previous * ease + .5))
        repetitions += 1
    else:
        interval = max(4, floor(max(previous, 1) * ease * 1.3 + .5))
        repetitions += 1
        ease += .15
    interval = min(36500, interval)
    return dict(interval=interval, repetitions=repetitions, ease=round(ease, 2),
                due=(today + timedelta(days=interval)).isoformat())
