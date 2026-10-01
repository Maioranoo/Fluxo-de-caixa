ALTER TABLE expenses ADD COLUMN installment_group_id text;
CREATE INDEX idx_expenses_household_installments ON expenses (household_id, installment_group_id);

-- Legacy POST inserted each purchase as consecutive IDs in one statement.
-- Recover only matching, unimported series; never group by description alone.
WITH suffixes AS (
  SELECT *, rtrim(description, '0123456789/)') AS prefix
  FROM expenses WHERE import_batch_id IS NULL AND description IS NOT NULL
), parts AS (
  SELECT *, substr(description, length(prefix) + 1) AS suffix FROM suffixes
  WHERE substr(prefix, -2) = ' ('
), parsed AS (
  SELECT *, CAST(substr(suffix, 1, instr(suffix, '/') - 1) AS INTEGER) AS part,
    CAST(substr(suffix, instr(suffix, '/') + 1) AS INTEGER) AS total
  FROM parts
), candidates AS (
  SELECT *, 'legacy:' || json_array(household_id, id - part, created_at, prefix, total,
    payment_method, person,
    CAST(substr(occurred_at, 1, 4) AS INTEGER) * 12 + CAST(substr(occurred_at, 6, 2) AS INTEGER) - part
  ) AS group_id
  FROM parsed
  WHERE total BETWEEN 2 AND 60 AND part BETWEEN 1 AND total
    AND suffix = part || '/' || total || ')'
    AND household_id IS NOT NULL AND occurred_at IS NOT NULL
), verified AS (
  SELECT group_id FROM candidates GROUP BY group_id
  HAVING count(*) > 1 AND count(*) = count(DISTINCT part)
    AND max(amount_cents) - min(amount_cents) <= 1
)
UPDATE expenses SET installment_group_id = (
  SELECT group_id FROM candidates WHERE candidates.id = expenses.id
)
WHERE id IN (SELECT id FROM candidates WHERE group_id IN (SELECT group_id FROM verified));
