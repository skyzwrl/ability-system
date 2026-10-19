import type { ClientMessage, ClientTransport, ServerMessage, ServerTransport } from "./messages";

interface Envelope<P, M> {
	readonly peer: P;
	readonly message: M;
}

type ServerHandler<P> = (peer: P, message: ClientMessage) => void;
type ClientHandler = (message: ServerMessage) => void;

class LoopbackServer<P> implements ServerTransport<P> {
	public readonly outbox = new Array<Envelope<P, ServerMessage>>();
	public handlers = new Array<ServerHandler<P>>();

	public send(peer: P, message: ServerMessage): void {
		this.outbox.push({ peer, message });
	}

	public connect(handler: ServerHandler<P>): () => void {
		this.handlers.push(handler);
		return () => {
			this.handlers = this.handlers.filter((other) => other !== handler);
		};
	}
}

class LoopbackClient<P> implements ClientTransport {
	public handlers = new Array<ClientHandler>();

	public constructor(
		private readonly peer: P,
		private readonly outbox: Array<Envelope<P, ClientMessage>>,
	) {}

	public send(message: ClientMessage): void {
		this.outbox.push({ peer: this.peer, message });
	}

	public connect(handler: ClientHandler): () => void {
		this.handlers.push(handler);
		return () => {
			this.handlers = this.handlers.filter((other) => other !== handler);
		};
	}
}

// in memory transport that only delivers when told to, so tests can hold messages "in flight"
export class LoopbackNetwork<P> {
	public readonly server: ServerTransport<P>;

	private readonly serverTransport = new LoopbackServer<P>();
	private readonly clients = new Map<P, LoopbackClient<P>>();
	private readonly toServer = new Array<Envelope<P, ClientMessage>>();

	public constructor() {
		this.server = this.serverTransport;
	}

	public connect(peer: P): ClientTransport {
		const client = new LoopbackClient(peer, this.toServer);
		this.clients.set(peer, client);
		return client;
	}

	public getQueuedToServer(): number {
		return this.toServer.size();
	}

	public getQueuedToClients(): number {
		return this.serverTransport.outbox.size();
	}

	public deliverToServer(limit = math.huge): number {
		const batch = this.take(this.toServer, limit);
		for (const { peer, message } of batch) {
			for (const handler of this.serverTransport.handlers) {
				handler(peer, message);
			}
		}
		return batch.size();
	}

	public deliverToClients(limit = math.huge): number {
		const batch = this.take(this.serverTransport.outbox, limit);
		for (const { peer, message } of batch) {
			const client = this.clients.get(peer);
			if (client === undefined) {
				continue;
			}
			for (const handler of client.handlers) {
				handler(message);
			}
		}
		return batch.size();
	}

	public flush(): void {
		while (this.toServer.size() > 0 || this.serverTransport.outbox.size() > 0) {
			this.deliverToServer();
			this.deliverToClients();
		}
	}

	private take<T extends defined>(queue: Array<T>, limit: number): Array<T> {
		const count = math.min(limit, queue.size());
		const batch = new Array<T>();
		for (let index = 0; index < count; index++) {
			batch.push(queue.shift()!);
		}
		return batch;
	}
}
