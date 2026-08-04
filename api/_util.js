const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validates from/to query params, throws a { status, message } on bad input.
export function parseDateParams(req) {
  const { from, to } = req.query;
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    const err = new Error("from/to must be YYYY-MM-DD");
    err.status = 400;
    throw err;
  }
  return { from: from || null, to: to || null };
}

// Builds a WHERE clause filtering `column` by the from/to range, plus any
// extra raw SQL conditions — empty string (no WHERE) if nothing applies.
// Pass dateOnly: true for Date32 columns (e.g. generate_date), which
// reject a full datetime string.
export function buildWhere(column, from, to, extra = [], { dateOnly = false } = {}) {
  const conditions = [...extra];
  if (from) conditions.push(dateOnly ? `${column} >= '${from}'` : `${column} >= '${from} 00:00:00'`);
  if (to) conditions.push(dateOnly ? `${column} <= '${to}'` : `${column} <= '${to} 23:59:59'`);
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

// Free-text values (store names, etc.) interpolated into SQL need their
// own quotes escaped — dates are already regex-validated and can't
// contain one, but this can't assume that.
export function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

// A single `column = 'value'` condition for the store filter, or null when
// no store was selected (frontend omits the param entirely for "All Stores").
export function storeCondition(column, store) {
  return store ? `${column} = '${escapeSqlString(store)}'` : null;
}
