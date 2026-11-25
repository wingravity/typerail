async function save(): Promise<void> {
  await Promise.resolve();
  throw new Error("save failed");
}

export function proof(): void {
  save();
}
