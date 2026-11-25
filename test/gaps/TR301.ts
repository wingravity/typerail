interface Account {
  balance: number;
}

export function proof(): string {
  const account: Account = JSON.parse('{"balance":"unlimited"}');
  return account.balance.toFixed();
}
