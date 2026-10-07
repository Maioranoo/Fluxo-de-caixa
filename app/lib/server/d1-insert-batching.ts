const D1_MAX_BOUND_PARAMETERS = 100;

export function chunkD1InsertValues<T>(rows: readonly T[], boundParametersPerRow: number): T[][] {
  if (!Number.isSafeInteger(boundParametersPerRow) || boundParametersPerRow < 1 || boundParametersPerRow > D1_MAX_BOUND_PARAMETERS) {
    throw new RangeError("Invalid number of bound parameters per row.");
  }
  const rowsPerStatement = Math.floor(D1_MAX_BOUND_PARAMETERS / boundParametersPerRow);
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += rowsPerStatement) chunks.push(rows.slice(index, index + rowsPerStatement));
  return chunks;
}
