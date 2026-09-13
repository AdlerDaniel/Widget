function newer(candidate, current) {
  if (!/^\d+\.\d+\.\d+$/.test(candidate || "")) return false;
  const a = candidate.split(".").map(Number),
    b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
module.exports = { newer };
