import { Ability, AbilityConfig, ActivationState, RunningPhase } from "./ability";

export interface ChargedConfig extends Omit<AbilityConfig, "windup"> {
	readonly maxChargeTime: number;
	readonly minChargeTime?: number;
	readonly releaseAtMax?: boolean;
}

// the windup is the charge: it runs until release (or until full, with releaseAtMax)
export abstract class ChargedAbility extends Ability {
	private readonly maxChargeTime: number;
	private readonly minChargeTime: number;
	private readonly releaseAtMax: boolean;
	private lockedLevel?: number;

	protected constructor(config: ChargedConfig) {
		super(config);
		if (!(config.maxChargeTime > 0)) {
			error(`maxChargeTime must be above 0, got ${config.maxChargeTime}`);
		}
		this.maxChargeTime = config.maxChargeTime;
		this.minChargeTime = math.clamp(config.minChargeTime ?? 0, 0, config.maxChargeTime);
		this.releaseAtMax = config.releaseAtMax ?? true;
	}

	public getChargeLevel(): number {
		if (this.lockedLevel !== undefined) {
			return this.lockedLevel;
		}
		return this.getPhase() === "Windup" ? math.min(this.getPhaseTime() / this.maxChargeTime, 1) : 0;
	}

	public start(activation: ActivationState): void {
		this.lockedLevel = undefined;
		super.start(activation);
	}

	public requiresHold(): boolean {
		return true;
	}

	public release(): boolean {
		if (this.getPhase() !== "Windup") {
			return false;
		}
		if (this.getPhaseTime() < this.minChargeTime) {
			this.end("Cancelled");
			return true;
		}
		this.lockedLevel = math.min(this.getPhaseTime() / this.maxChargeTime, 1);
		this.finishPhase();
		return true;
	}

	protected getPhaseDuration(phase: RunningPhase): number | undefined {
		if (phase === "Windup") {
			return this.releaseAtMax ? this.maxChargeTime : undefined;
		}
		return super.getPhaseDuration(phase);
	}

	protected progress(phase: RunningPhase, from: number, to: number): void {
		if (phase === "Windup" && to >= this.maxChargeTime) {
			this.lockedLevel = 1;
		}
		super.progress(phase, from, to);
	}
}
