enum Status {
  Pending,
  Complete,
}

function label(status: Status): string {
  switch (status) {
    case Status.Pending:
      return "pending";
    case Status.Complete:
      return "complete";
  }
}

export function proof(): string {
  const raw: number = 7;
  const status: Status = raw;
  return label(status).toUpperCase();
}
