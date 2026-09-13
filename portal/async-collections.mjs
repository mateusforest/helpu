// Database-backed callbacks run in order, preserving transaction and audit order.
export async function mapAsync(items, callback) {
  const result = [];
  for (let i = 0; i < items.length; i++) result.push(await callback(items[i], i, items));
  return result;
}
export async function filterAsync(items, callback) {
  const result = [];
  for (let i = 0; i < items.length; i++) if (await callback(items[i], i, items)) result.push(items[i]);
  return result;
}
export async function findAsync(items, callback) {
  for (let i = 0; i < items.length; i++) if (await callback(items[i], i, items)) return items[i];
}
export async function someAsync(items, callback) {
  for (let i = 0; i < items.length; i++) if (await callback(items[i], i, items)) return true;
  return false;
}
export async function everyAsync(items, callback) {
  for (let i = 0; i < items.length; i++) if (!(await callback(items[i], i, items))) return false;
  return true;
}
export async function forEachAsync(items, callback) {
  for (let i = 0; i < items.length; i++) await callback(items[i], i, items);
}
export async function reduceAsync(items, callback, value) {
  for (let i = 0; i < items.length; i++) value = await callback(value, items[i], i, items);
  return value;
}
