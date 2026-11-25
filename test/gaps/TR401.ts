interface State {
  value: string | number;
}

function reset(state: State): void {
  state.value = 0;
}

export function proof(): string {
  const state: State = { value: "ready" };
  if (typeof state.value === "string") {
    reset(state);
    return state.value.toUpperCase();
  }
  return "";
}
