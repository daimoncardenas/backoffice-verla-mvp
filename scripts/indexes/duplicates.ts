import type { DeclaredIndex } from "./plan";

export interface DuplicateSample {
  key: unknown;
  count: number;
}

export interface DuplicateResult {
  collection: string;
  index: DeclaredIndex;
  duplicate_groups: number;
  samples: DuplicateSample[];
}

export interface AggregateCapable {
  aggregate(
    pipeline: Record<string, unknown>[],
  ): { toArray(): Promise<unknown[]> };
}

export function buildDuplicatePipeline(
  index: DeclaredIndex,
  sampleLimit = 5,
): Record<string, unknown>[] {
  const groupId = Object.fromEntries(
    index.key.map(([field]) => [field, `$${field}`]),
  );
  const pipeline: Record<string, unknown>[] = [];

  // The partial filter is the exact domain where MongoDB enforces uniqueness.
  if (index.partial) {
    pipeline.push({ $match: index.partial });
  }

  pipeline.push({ $group: { _id: groupId, count: { $sum: 1 } } });
  pipeline.push({ $match: { count: { $gt: 1 } } });
  pipeline.push({
    $facet: {
      total: [{ $count: "value" }],
      samples: [{ $limit: sampleLimit }],
    },
  });

  return pipeline;
}

export function summarizeDuplicateFacet(result: unknown[]): {
  duplicate_groups: number;
  samples: DuplicateSample[];
} {
  const document = result[0] as
    | {
        total?: Array<{ value?: number }>;
        samples?: Array<{ _id?: unknown; count?: number }>;
      }
    | undefined;

  const duplicateGroups = document?.total?.[0]?.value ?? 0;
  const samples = (document?.samples ?? []).map((sample) => ({
    key: sample._id ?? null,
    count: sample.count ?? 0,
  }));

  return { duplicate_groups: duplicateGroups, samples };
}

export async function findDuplicateGroups(
  collectionName: string,
  collection: AggregateCapable,
  index: DeclaredIndex,
  sampleLimit = 5,
): Promise<DuplicateResult> {
  const result = await collection
    .aggregate(buildDuplicatePipeline(index, sampleLimit))
    .toArray();
  const summary = summarizeDuplicateFacet(result);

  return {
    collection: collectionName,
    index,
    duplicate_groups: summary.duplicate_groups,
    samples: summary.samples,
  };
}
