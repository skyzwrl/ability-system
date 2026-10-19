import { Ability, AbilityConfig, ActivationState, EPSILON, RunningPhase } from "./ability";

export interface ChanneledConfig extends Omit<AbilityConfig, "active"> {
	readonly maxDuration: number;
	readonly tickInterval: number;
	readonly tickOnStart?: boolean;
}

// the active phase is the channel: it ticks while held and moves to recovery on release or at maxDuration
export abstract class ChanneledAbility extends Ability {
	private readonly maxDuration: number;
	private readonly tickInterval: number;
	private readonly tickOnStart: boolean;
	private ticks = 0;

	protected onTick?(tick: number): void;

	protected constructor(config: ChanneledConfig) {
		super(config);
		if (!(config.maxDuration > 0) || !(config.tickInterval > 0)) {
			error("channeled abilities need a maxDuration and tickInterval above 0");
		}
		this.maxDuration = config.maxDuration;
		this.tickInterval = config.tickInterval;
		this.tickOnStart = config.tickOnStart ?? false;
	}

	public getTickCount(): number {
		return this.ticks;
	}

	public start(activation: ActivationState): void {
		this.ticks = 0;
		super.start(activation);
	}

	public requiresHold(): boolean {
		return true;
	}

	public release(): boolean {
		const phase = this.getPhase();
		if (phase === "Windup") {
			this.end("Cancelled");
			return true;
		}
		if (phase === "Active") {
			this.finishPhase();
			return true;
		}
		return false;
	}

	protected getPhaseDuration(phase: RunningPhase): number | undefined {
		return phase === "Active" ? this.maxDuration : super.getPhaseDuration(phase);
	}

	protected progress(phase: RunningPhase, from: number, to: number): void {
		if (phase === "Active" && !this.runTicks(from, to)) {
			return;
		}
		super.progress(phase, from, to);
	}

	// ticks land on whole multiples of the interval inside (from, to], returns false if a tick ended the channel
	private runTicks(from: number, to: number): boolean {
		if (this.tickOnStart && from === 0) {
			this.tick();
		}
		const last = math.floor(to / this.tickInterval + EPSILON);
		for (let boundary = math.floor(from / this.tickInterval + EPSILON) + 1; boundary <= last; boundary++) {
			if (this.getPhase() !== "Active") {
				return false;
			}
			this.tick();
		}
		return this.getPhase() === "Active";
	}

	private tick(): void {
		this.ticks += 1;
		this.onTick?.(this.ticks);
	}
}
