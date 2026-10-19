import type { Activation } from "../ability";
import type { AbilityCaster, PressResult, Tolerance } from "../caster";
import type { ClientTransport, ServerMessage } from "./messages";

export interface ClientOptions {
	readonly tolerance?: Partial<Tolerance>;
}

const DEFAULT_TOLERANCE: Tolerance = { time: 0.25, resource: 2 };

// runs abilities locally the moment they're pressed and lets the server confirm or undo them later
export class AbilityClient {
	private readonly pending = new Map<number, Activation>();
	private readonly tolerance: Tolerance;
	private readonly disconnects: ReadonlyArray<() => void>;
	private sequence = 0;

	public constructor(
		private readonly caster: AbilityCaster,
		private readonly transport: ClientTransport,
		options: ClientOptions = {},
	) {
		this.tolerance = { ...DEFAULT_TOLERANCE, ...options.tolerance };
		// activations are sent from here rather than from press so buffered presses get sent when they fire
		this.disconnects = [
			caster.activated.connect((activation) => this.sendActivation(activation)),
			transport.connect((message) => this.receive(message)),
		];
	}

	public getCaster(): AbilityCaster {
		return this.caster;
	}

	public getPendingCount(): number {
		return this.pending.size();
	}

	public press(id: string): PressResult {
		const result = this.caster.press(id);
		if (result === "Deactivated") {
			this.transport.send({ type: "cancel", ability: id });
		}
		return result;
	}

	public release(id: string): boolean {
		const released = this.caster.release(id);
		if (released) {
			this.transport.send({ type: "release", ability: id });
		}
		return released;
	}

	public cancel(): boolean {
		const current = this.caster.getCurrent();
		if (current === undefined || !this.caster.cancel()) {
			return false;
		}
		this.transport.send({ type: "cancel", ability: current.getId() });
		return true;
	}

	public update(deltaTime: number): void {
		this.caster.update(deltaTime);
	}

	public destroy(): void {
		for (const disconnect of this.disconnects) {
			disconnect();
		}
		this.pending.clear();
	}

	private sendActivation(activation: Activation): void {
		this.sequence += 1;
		this.pending.set(this.sequence, activation);
		this.transport.send({ type: "activate", sequence: this.sequence, ability: activation.ability.getId() });
	}

	private receive(message: ServerMessage): void {
		if (message.type === "interrupted") {
			this.caster.interrupt();
			return;
		}

		const activation = this.pending.get(message.sequence);
		this.pending.delete(message.sequence);
		if (message.type === "rejected" && activation !== undefined) {
			this.caster.revert(activation);
		}

		// a snapshot only describes where the server is once it has seen every prediction we made,
		// reconciling earlier would wipe out predictions it hasn't processed yet
		if (this.pending.size() === 0) {
			this.caster.reconcile(message.snapshot, this.tolerance);
		}
	}
}
