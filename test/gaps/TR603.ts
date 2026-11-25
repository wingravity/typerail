interface Options {
  timeout?: number;
}

const defaults = { timeout: 1000 };

function settings(overrides: Options): { timeout: number } {
  return { ...defaults, ...overrides };
}

export function proof(): string {
  return settings({ timeout: undefined }).timeout.toFixed();
}
