class InputError extends Error {}
function stringParameter(query, key, fallback = "", max = 200) {
  const value = query[key] ?? fallback;
  if (typeof value !== "string" || value.length > max)
    throw new InputError(`Invalid ${key}`);
  return value.trim();
}
function numberParameter(query, key, fallback, min, max, integer = false) {
  if (query[key] === undefined || query[key] === "") return fallback;
  const text = stringParameter(query, key);
  const value = Number(text);
  if (
    !text ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new InputError(`Invalid ${key}`);
  }
  return value;
}
function productFromRow(row) {
  const { original_price, ...product } = row;
  return {
    ...product,
    price: Number(row.price),
    originalPrice: Number(original_price),
    rating: Number(row.rating),
  };
}
const sorts = {
  featured: "id ASC",
  "price-asc": "price ASC, id ASC",
  "price-desc": "price DESC, id ASC",
  rating: "rating DESC, id ASC",
};
async function searchCatalog(pool, query) {
  const keyword = stringParameter(query, "k");
  const department = stringParameter(query, "department", "All", 80);
  const rating = numberParameter(query, "rating", 0, 0, 5);
  const price = numberParameter(query, "price", null, 0, 9999999999.99);
  const limit = numberParameter(query, "limit", 24, 1, 100, true);
  const offset = numberParameter(query, "offset", 0, 0, 1000000, true);
  const sort = stringParameter(query, "sort", "featured");
  if (!Object.hasOwn(sorts, sort)) throw new InputError("Invalid sort");
  const deals = stringParameter(query, "deals", "0");
  if (!["0", "1"].includes(deals)) throw new InputError("Invalid deals");
  const where = ["rating >= $1"];
  const values = [rating];
  const add = (expression, value) => {
    values.push(value);
    where.push(expression.replace("?", `$${values.length}`));
  };
  if (department && department !== "All") add("category = ?", department);
  if (price !== null) add("price <= ?", price);
  if (deals === "1") where.push("original_price > price");
  for (const word of keyword.toLowerCase().split(/\s+/).filter(Boolean)) {
    add(
      "strpos(lower(concat_ws(' ', title, brand, category, tags)), ?) > 0",
      word,
    );
  }
  const filter = where.join(" AND ");
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const count = await client.query(
      `SELECT count(*)::integer AS total FROM products WHERE ${filter}`,
      values,
    );
    const rows = await client.query(
      `SELECT * FROM products WHERE ${filter} ORDER BY ${sorts[sort]} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    await client.query("COMMIT");
    return {
      products: rows.rows.map(productFromRow),
      total: count.rows[0].total,
      limit,
      offset,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { searchCatalog, productFromRow, InputError };
