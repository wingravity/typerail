async function save(id: number): Promise<void> {
  await Promise.resolve();
  throw new Error(`save ${String(id)} failed`);
}

export function proof(): void {
  [1, 2].forEach(async (id) => {
    await save(id);
  });
}
