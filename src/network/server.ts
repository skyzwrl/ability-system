import type { AbilityCaster } from "../caster";
import type { ClientMessage, ServerTransport } from "./messages";

export interface ServerOptions {
	/** seconds of timer left that still count as finished when a client asks, absorbs latency jitter */
	readonly grace?: number;
}

export class AbilityServer<P = Player> {
	private readonly casters = new Map<P, AbilityCaster>();
	private readonly grace: number;
	private readonly disconnect: () => void;

	public constructor(
		private readonly transport: ServerTransport<P>,
		options: ServerOptions = {},
	) {
		this.grace = options.grace ?? 0.1;
		this.disconnect = transport.connect((peer, message) => this.receive(peer, message));
	}

	public register(peer: P, caster: AbilityCaster): void {
		this.casters.set(peer, caster);
	}

	public unregister(peer: P): void {
		this.casters.delete(peer);
	}

	public getCaster(peer: P): AbilityCaster | undefined {
		return this.casters.get(peer);
	}

	public interrupt(peer: P): boolean {
		const caster = this.casters.get(peer);
		if (caster === undefined || !caster.interrupt()) {
			return false;
		}
		this.transport.send(peer, { type: "interrupted" });
		return true;
	}

	public update(deltaTime: number): void {
		for (const [, caster] of this.casters) {
			caster.update(deltaTime);
		}
	}

	public destroy(): void {
		this.disconnect();
		this.casters.clear();
	}

	private receive(peer: P, message: ClientMessage): void {
		const caster = this.casters.get(peer);
		if (caster === undefined) {
			return;
		}

		if (message.type === "activate") {
			const result = caster.activate(message.ability, this.grace);
			const snapshot = caster.snapshot();
			this.transport.send(
				peer,
				result.success
					? { type: "accepted", sequence: message.sequence, snapshot }
					: { type: "rejected", sequence: message.sequence, reason: result.reason, snapshot },
			);
		} else if (message.type === "release") {
			caster.release(message.ability);
		} else {
			caster.cancel(message.ability);
		}
	}
}
