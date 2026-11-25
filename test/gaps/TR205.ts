interface Client {
  send(): string;
}

class Service {
  client!: Client;

  run(): string {
    return this.client.send();
  }
}

export function proof(): string {
  return new Service().run();
}
