export type IndexDirection = 1 | -1;

export interface IndexShape {
  key: Array<[string, number]>;
  unique: boolean;
  partial: Record<string, unknown> | null;
  ttl: number | null;
}

export interface DeclaredIndex extends IndexShape {
  name: string | null;
}

export interface ActualIndex extends IndexShape {
  name: string;
}

export interface IncompatibleIndex {
  declared: DeclaredIndex;
  actual: ActualIndex;
  differences: string[];
}

export type CollectionStatus =
  | "ok"
  | "create_collection"
  | "create_indexes"
  | "incompatible"
  | "extra_indexes";

export interface CollectionPlan {
  collection: string;
  collection_exists: boolean;
  create_collection: boolean;
  create_indexes: DeclaredIndex[];
  present: DeclaredIndex[];
  incompatible: IncompatibleIndex[];
  extra: ActualIndex[];
  status: CollectionStatus;
}

export function keyPairs(key: Record<string, unknown>): Array<[string, number]> {
  return Object.entries(key).map(([field, direction]) => [
    field,
    Number(direction),
  ]);
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function sameKey(
  left: Array<[string, number]>,
  right: Array<[string, number]>,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      ([field, direction], index) =>
        field === right[index][0] && direction === right[index][1],
    )
  );
}

export function sameFields(
  left: Array<[string, number]>,
  right: Array<[string, number]>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const fields = new Set(left.map(([field]) => field));
  return right.every(([field]) => fields.has(field));
}

function differencesBetween(
  declared: DeclaredIndex,
  actual: ActualIndex,
): string[] {
  const differences: string[] = [];

  if (actual.unique !== declared.unique) {
    differences.push(
      `unique expected ${String(declared.unique)}, actual ${String(
        actual.unique,
      )}`,
    );
  }

  if (canonical(actual.partial) !== canonical(declared.partial)) {
    differences.push(
      `partialFilterExpression expected ${canonical(
        declared.partial,
      )}, actual ${canonical(actual.partial)}`,
    );
  }

  if (actual.ttl !== declared.ttl) {
    differences.push(
      `expireAfterSeconds expected ${String(declared.ttl)}, actual ${String(
        actual.ttl,
      )}`,
    );
  }

  return differences;
}

export function planCollection(
  collection: string,
  declared: readonly DeclaredIndex[],
  actual: readonly ActualIndex[] | null,
): CollectionPlan {
  if (actual === null) {
    return {
      collection,
      collection_exists: false,
      create_collection: true,
      create_indexes: [...declared],
      present: [],
      incompatible: [],
      extra: [],
      status: "create_collection",
    };
  }

  const createIndexes: DeclaredIndex[] = [];
  const present: DeclaredIndex[] = [];
  const incompatible: IncompatibleIndex[] = [];

  for (const expected of declared) {
    const exact = actual.find((candidate) =>
      sameKey(candidate.key, expected.key),
    );

    if (exact) {
      const differences = differencesBetween(expected, exact);

      if (differences.length > 0) {
        incompatible.push({ declared: expected, actual: exact, differences });
      } else {
        present.push(expected);
      }
      continue;
    }

    const sameFieldsDifferentOrder = actual.find((candidate) =>
      sameFields(candidate.key, expected.key),
    );

    if (sameFieldsDifferentOrder) {
      incompatible.push({
        declared: expected,
        actual: sameFieldsDifferentOrder,
        differences: ["key fields match but the key order differs"],
      });
      continue;
    }

    createIndexes.push(expected);
  }

  const extra = actual.filter(
    (candidate) =>
      !declared.some(
        (expected) =>
          sameKey(candidate.key, expected.key) ||
          sameFields(candidate.key, expected.key),
      ),
  );

  let status: CollectionStatus = "ok";

  if (incompatible.length > 0) {
    status = "incompatible";
  } else if (createIndexes.length > 0) {
    status = "create_indexes";
  } else if (extra.length > 0) {
    status = "extra_indexes";
  }

  return {
    collection,
    collection_exists: true,
    create_collection: false,
    create_indexes: createIndexes,
    present,
    incompatible,
    extra,
    status,
  };
}

export interface ProvisionPlan {
  collections: CollectionPlan[];
  create_collection_count: number;
  create_index_count: number;
  present_count: number;
  incompatible_count: number;
  extra_count: number;
  blocked: boolean;
}

export function buildProvisionPlan(
  collections: ReadonlyArray<{
    collection: string;
    declared: DeclaredIndex[];
    actual: ActualIndex[] | null;
  }>,
): ProvisionPlan {
  const plans = collections.map((entry) =>
    planCollection(entry.collection, entry.declared, entry.actual),
  );

  const incompatibleCount = plans.reduce(
    (total, plan) => total + plan.incompatible.length,
    0,
  );

  return {
    collections: plans,
    create_collection_count: plans.filter((plan) => plan.create_collection)
      .length,
    create_index_count: plans.reduce(
      (total, plan) => total + plan.create_indexes.length,
      0,
    ),
    present_count: plans.reduce(
      (total, plan) => total + plan.present.length,
      0,
    ),
    incompatible_count: incompatibleCount,
    extra_count: plans.reduce((total, plan) => total + plan.extra.length, 0),
    blocked: incompatibleCount > 0,
  };
}
