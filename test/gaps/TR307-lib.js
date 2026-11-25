const handlers = {
  2: () => "fast",
  3: () => "safe",
};

export function run(mode) {
  return handlers[mode]();
}
