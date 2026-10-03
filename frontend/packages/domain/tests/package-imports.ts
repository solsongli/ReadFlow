import { normalizeJobPayload } from '@retainpdf/domain/job'
import type { JobPayload } from '@retainpdf/domain/job'
import { describeToolEvent } from '@retainpdf/domain/ai'
import { makeId, toSessionSummary } from '@retainpdf/domain/session'
import type { SessionSummary } from '@retainpdf/domain/session'

const publicFunctions = [
  normalizeJobPayload,
  describeToolEvent,
  makeId,
  toSessionSummary,
] satisfies ReadonlyArray<(...args: never[]) => unknown>

type PublicTypes = [JobPayload, SessionSummary]

void publicFunctions
void (null as unknown as PublicTypes)
