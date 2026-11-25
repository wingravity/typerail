export function proof(): number {
  try {
    throw "connection lost";
  } catch (error) {
    return error.message.length;
  }
}
