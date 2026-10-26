import type { Queryable } from '../db/connection.ts'
import { confidenceThreshold } from './verify.ts'

export const retryChunks = (batch: string, threshold: string) => `select chunk from import_candidate where batch_id = ${batch} and closed_at is null and status = 'pending' and chunk is not null and confidence < ${threshold}
  union select concat(failure->>'source', '@', failure->>'offset') from import_batch, jsonb_array_elements(failures) as failure where id = ${batch}
  except (select chunk from import_candidate where batch_id = ${batch} and closed_at is null and status <> 'pending' and chunk is not null
    union select q.chunk from import_question q where q.batch_id = ${batch} and q.closed_at is null and q.answer is not null and q.chunk is not null
    union select c.chunk from import_question q join import_candidate c on c.id = q.candidate_id where q.batch_id = ${batch} and q.closed_at is null and q.answer is not null and c.chunk is not null)`

export const batchStatuses = ['draft', 'verified', 'committed', 'closed'] as const

export type BatchStatus = (typeof batchStatuses)[number]

const batchColumns = `b.id::text as id, b.file_name as "fileName", b.format, b.status, b.created_at as "createdAt", b.closed_at as "closedAt",
  b.input_tokens::int as "inputTokens", b.output_tokens::int as "outputTokens", round(b.cost_usd_micros / 1000000.0, 4)::text as "costUsd",
  b.checks, b.failures, b.totals,
  (select count(*)::int from import_candidate c where c.batch_id = b.id and c.closed_at is null) as candidates,
  (select count(*)::int from import_candidate c where c.batch_id = b.id and c.closed_at is null and jsonb_array_length(c.checks) > 0) as flagged,
  (select count(*)::int from import_question q where q.batch_id = b.id and q.closed_at is null and q.answer is null) as "openQuestions",
  (select count(*)::int from import_candidate c where c.batch_id = b.id and c.record_id is not null) as committed,
  case when b.closed_at is null and b.status in ('draft', 'verified') then (select count(*)::int from (${retryChunks('b.id', String(confidenceThreshold))}) t) else 0 end as retryable`

export const listBatches = async (client: Queryable, status?: BatchStatus) => (await client.query(`select ${batchColumns} from import_batch b where $1::text is null or b.status = $1 order by b.id desc`, [status ?? null])).rows

export const findBatch = async (client: Queryable, id: bigint) => (await client.query(`select ${batchColumns} from import_batch b where b.id = $1`, [id])).rows[0]

export const listCandidates = async (client: Queryable, batchId: bigint) =>
  (
    await client.query(
      `select id::text as id, kind, source, chunk, confidence::text as confidence, status, payload, checks, record_id::text as "recordId"
      from import_candidate where batch_id = $1 and closed_at is null order by id`,
      [batchId],
    )
  ).rows

export const listQuestions = async (client: Queryable, batchId: bigint) =>
  (
    await client.query(
      `select id::text as id, candidate_id::text as "candidateId", question, options, source, chunk, answer
      from import_question where batch_id = $1 and closed_at is null order by id`,
      [batchId],
    )
  ).rows
