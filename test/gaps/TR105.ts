interface Config {
  readonly options: { retries: number };
}

const config: Config = { options: { retries: 3 } };

function tune(options: { retries: number }): void {
  options.retries = -1;
}

export function proof(): unknown[] {
  tune(config.options);
  return new Array(config.options.retries);
}
