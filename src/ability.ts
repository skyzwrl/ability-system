import type { AbilityCaster } from "./caster";

export type AbilityPhase = "Idle" | "Windup" | "Active" | "Recovery";
export type RunningPhase = Exclude<AbilityPhase, "Idle">;
export type EndReason = "Completed" | "Cancelled" | "Interrupted" | "Rejected" | "Depleted";

export interface Cost {
	readonly resource: string;
	readonly amount: number;
}

export interface AbilityConfig {
	readonly windup?: number;
	readonly active?: number;
	readonly recovery?: number;
	readonly cooldown?: number;
	readonly cooldownStartsOn?: "Activate" | "End";
	readonly charges?: number;
	readonly rechargeTime?: number;
	readonly costs?: { readonly [resource: string]: number };
	readonly priority?: number;
	/** lowest priority that may interrupt this ability in each phase, phases left out can't be interrupted */
	readonly interruptibleBy?: Partial<Record<RunningPhase, number>>;
	readonly cancellable?: Partial<Record<RunningPhase, boolean>>;
	readonly refundWindup?: boolean;
	readonly exclusive?: boolean;
	readonly triggersGlobalCooldown?: boolean;
	readonly ignoresGlobalCooldown?: boolean;
}

export interface AbilityRules {
	readonly windup: number;
	readonly active: number;
	readonly recovery: number;
	readonly cooldown: number;
	readonly cooldownStartsOn: "Activate" | "End";
	readonly usesCharges: boolean;
	readonly maxCharges: number;
	readonly rechargeTime: number;
	readonly costs: ReadonlyArray<Cost>;
	readonly priority: number;
	readonly interruptibleBy: Partial<Record<RunningPhase, number>>;
	readonly cancellable: Partial<Record<RunningPhase, boolean>>;
	readonly refundWindup: boolean;
	readonly exclusive: boolean;
	readonly triggersGlobalCooldown: boolean;
	readonly ignoresGlobalCooldown: boolean;
}

export interface Activation {
	readonly ability: Ability;
	readonly costs: ReadonlyArray<Cost>;
	readonly frame: number;
	readonly consumedCharge: boolean;
	readonly startedCooldown: boolean;
	readonly startedGlobalCooldown: boolean;
	readonly refunded: boolean;
	readonly endReason?: EndReason;
}

export interface ActivationState extends Activation {
	consumedCharge: boolean;
	startedCooldown: boolean;
	startedGlobalCooldown: boolean;
	refunded: boolean;
	endReason?: EndReason;
}

export interface AbilitySnapshot {
	readonly cooldown: number;
	readonly charges: number;
	readonly recharge: number;
}

const PHASES: ReadonlyArray<RunningPhase> = ["Windup", "Active", "Recovery"];

// summed frame times drift (0.1 + 0.1 + 0.1 < 0.3), so timers this close to done count as done
export const EPSILON = 1e-9;

function seconds(value: number | undefined, name: string): number {
	if (value === undefined) {
		return 0;
	}
	if (value !== value || value < 0 || value === math.huge) {
		error(`${name} must be a finite number of seconds, got ${value}`);
	}
	return value;
}

export function toCosts(costs: { readonly [resource: string]: number } | undefined): ReadonlyArray<Cost> {
	const list = new Array<Cost>();
	if (costs === undefined) {
		return list;
	}
	for (const [resource, amount] of pairs(costs)) {
		if (amount !== amount || amount < 0) {
			error(`cost of ${resource} must be 0 or more, got ${amount}`);
		}
		list.push({ resource: resource as string, amount });
	}
	list.sort((a, b) => a.resource < b.resource);
	return list;
}

function resolveRules(config: AbilityConfig): AbilityRules {
	const usesCharges = config.charges !== undefined;
	const maxCharges = config.charges ?? 1;
	const rechargeTime = seconds(config.rechargeTime, "rechargeTime");
	if (usesCharges && (maxCharges < 1 || maxCharges % 1 !== 0)) {
		error(`charges must be a whole number of at least 1, got ${maxCharges}`);
	}
	if (usesCharges && rechargeTime <= 0) {
		error("abilities with charges need a rechargeTime above 0");
	}

	const exclusive = config.exclusive ?? true;
	return {
		windup: seconds(config.windup, "windup"),
		active: seconds(config.active, "active"),
		recovery: seconds(config.recovery, "recovery"),
		cooldown: seconds(config.cooldown, "cooldown"),
		cooldownStartsOn: config.cooldownStartsOn ?? "Activate",
		usesCharges,
		maxCharges,
		rechargeTime,
		costs: toCosts(config.costs),
		priority: config.priority ?? 0,
		interruptibleBy: config.interruptibleBy ?? {},
		cancellable: config.cancellable ?? { Windup: true },
		refundWindup: config.refundWindup ?? true,
		exclusive,
		triggersGlobalCooldown: config.triggersGlobalCooldown ?? exclusive,
		ignoresGlobalCooldown: config.ignoresGlobalCooldown ?? false,
	};
}

export abstract class Ability {
	public readonly rules: AbilityRules;

	private id?: string;
	private caster?: AbilityCaster;
	private notifyEnded?: (ability: Ability, activation: ActivationState) => void;

	private phase: AbilityPhase = "Idle";
	private phaseTime = 0;
	private activation?: ActivationState;
	private cooldown = 0;
	private cooldownOwner?: ActivationState;
	private charges: number;
	private rechargeLeft = 0;

	protected canActivate?(): boolean;
	protected onWindup?(): void;
	protected onActive?(): void;
	protected onRecovery?(): void;
	protected onUpdate?(deltaTime: number): void;
	protected onProgress?(phase: RunningPhase, from: number, to: number): void;
	protected onEnd?(reason: EndReason): void;

	protected constructor(config: AbilityConfig) {
		this.rules = resolveRules(config);
		this.charges = this.rules.maxCharges;
	}

	public bind(
		id: string,
		caster: AbilityCaster,
		notifyEnded: (ability: Ability, activation: ActivationState) => void,
	): void {
		if (this.caster !== undefined) {
			error(`ability "${this.id}" already belongs to a caster`, 3);
		}
		this.id = id;
		this.caster = caster;
		this.notifyEnded = notifyEnded;
	}

	public getId(): string {
		if (this.id === undefined) {
			error("ability hasn't been added to a caster yet", 2);
		}
		return this.id;
	}

	public getCaster(): AbilityCaster {
		if (this.caster === undefined) {
			error("ability hasn't been added to a caster yet", 2);
		}
		return this.caster;
	}

	public getPhase(): AbilityPhase {
		return this.phase;
	}

	public getPhaseTime(): number {
		return this.phaseTime;
	}

	public getActivation(): Activation | undefined {
		return this.activation;
	}

	public isRunning(): boolean {
		return this.activation !== undefined;
	}

	public getCooldown(): number {
		return this.cooldown;
	}

	public getCharges(): number {
		return this.charges;
	}

	public getRechargeRemaining(): number {
		return this.rechargeLeft;
	}

	public isReady(): boolean {
		return this.cooldown <= 0 && this.charges >= 1;
	}

	public isCancellable(): boolean {
		return this.phase !== "Idle" && this.rules.cancellable[this.phase] === true;
	}

	public canBeInterruptedBy(priority: number): boolean {
		if (this.phase === "Idle") {
			return true;
		}
		const threshold = this.rules.interruptibleBy[this.phase];
		return threshold !== undefined && priority >= threshold;
	}

	public checkCondition(): boolean {
		return this.canActivate?.() ?? true;
	}

	public requiredResources(): ReadonlyArray<string> {
		return this.rules.costs.map((cost) => cost.resource);
	}

	public getRemainingTime(): number | undefined {
		if (this.phase === "Idle") {
			return 0;
		}
		let total = 0;
		let reached = false;
		for (const phase of PHASES) {
			reached ||= phase === this.phase;
			if (!reached) {
				continue;
			}
			const duration = this.getPhaseDuration(phase);
			if (duration === undefined) {
				return undefined;
			}
			total += phase === this.phase ? math.max(duration - this.phaseTime, 0) : duration;
		}
		return total;
	}

	public reduceCooldown(amount: number): void {
		this.cooldown = math.max(this.cooldown - amount, 0);
	}

	public resetCooldown(): void {
		this.cooldown = 0;
	}

	public addCharge(): void {
		if (this.charges < this.rules.maxCharges) {
			this.gainCharge();
		}
	}

	public start(activation: ActivationState): void {
		this.activation = activation;
		if (this.rules.usesCharges) {
			this.consumeCharge();
			activation.consumedCharge = true;
		}
		if (this.rules.cooldownStartsOn === "Activate") {
			this.startCooldown(activation);
		}
		this.enter("Windup");
		this.advance(0);
	}

	public step(deltaTime: number): void {
		if (this.activation === undefined) {
			return;
		}
		this.onUpdate?.(deltaTime);
		this.advance(deltaTime);
	}

	public fastForward(): void {
		this.advance(math.huge);
	}

	public requiresHold(): boolean {
		return false;
	}

	public release(): boolean {
		return false;
	}

	public end(reason: EndReason): void {
		const activation = this.activation;
		if (activation === undefined) {
			return;
		}
		const phase = this.phase;
		this.activation = undefined;
		this.phase = "Idle";
		this.phaseTime = 0;
		activation.endReason = reason;

		const endedEarly = reason === "Cancelled" || reason === "Interrupted";
		if (endedEarly && phase === "Windup" && this.rules.refundWindup) {
			activation.refunded = true;
			this.revert(activation);
		} else if (reason !== "Rejected" && this.rules.cooldownStartsOn === "End") {
			this.startCooldown(activation);
		}

		this.notifyEnded!(this, activation);
		this.onEnd?.(reason);
	}

	public revert(activation: ActivationState): void {
		if (activation.consumedCharge) {
			this.restoreCharge();
		}
		if (this.cooldownOwner === activation) {
			this.cooldown = 0;
			this.cooldownOwner = undefined;
		}
	}

	public tickTimers(deltaTime: number): void {
		if (this.cooldown > 0) {
			const left = this.cooldown - deltaTime;
			this.cooldown = left > EPSILON ? left : 0;
		}
		let remaining = deltaTime;
		while (this.charges < this.rules.maxCharges) {
			if (remaining + EPSILON < this.rechargeLeft) {
				this.rechargeLeft -= remaining;
				return;
			}
			remaining = math.max(remaining - this.rechargeLeft, 0);
			this.gainCharge();
		}
	}

	public snapshot(): AbilitySnapshot {
		return { cooldown: this.cooldown, charges: this.charges, recharge: this.rechargeLeft };
	}

	public reconcile(snapshot: AbilitySnapshot, tolerance: number): boolean {
		let corrected = false;
		if (math.abs(this.cooldown - snapshot.cooldown) > tolerance) {
			this.cooldown = snapshot.cooldown;
			corrected = true;
		}
		if (this.charges !== snapshot.charges || math.abs(this.rechargeLeft - snapshot.recharge) > tolerance) {
			const changed = this.charges !== snapshot.charges;
			this.charges = snapshot.charges;
			this.rechargeLeft = snapshot.recharge;
			corrected = true;
			if (changed) {
				this.getCaster().chargesChanged.fire(this, this.charges);
			}
		}
		return corrected;
	}

	protected getPhaseDuration(phase: RunningPhase): number | undefined {
		if (phase === "Windup") {
			return this.rules.windup;
		}
		return phase === "Active" ? this.rules.active : this.rules.recovery;
	}

	protected getCooldownDuration(): number {
		return this.rules.cooldown;
	}

	protected progress(phase: RunningPhase, from: number, to: number): void {
		this.onProgress?.(phase, from, to);
	}

	protected finishPhase(): void {
		this.nextPhase();
		this.advance(0);
	}

	private enter(phase: RunningPhase): void {
		this.phase = phase;
		this.phaseTime = 0;
		this.getCaster().phaseChanged.fire(this, phase);
		if (phase === "Windup") {
			this.onWindup?.();
		} else if (phase === "Active") {
			this.onActive?.();
		} else {
			this.onRecovery?.();
		}
	}

	private nextPhase(): void {
		if (this.phase === "Windup") {
			this.enter("Active");
		} else if (this.phase === "Active") {
			this.enter("Recovery");
		} else if (this.phase === "Recovery") {
			this.end("Completed");
		}
	}

	// leftover time carries into the next phase, so one big step lands in the same place as many small ones
	private advance(deltaTime: number): void {
		const activation = this.activation;
		let remaining = deltaTime;
		while (activation !== undefined && this.activation === activation && this.phase !== "Idle") {
			const phase = this.phase;
			const duration = this.getPhaseDuration(phase);
			if (duration === undefined || remaining + EPSILON < duration - this.phaseTime) {
				this.runTo(phase, this.phaseTime + remaining);
				return;
			}
			remaining = math.max(remaining - (duration - this.phaseTime), 0);
			this.runTo(phase, duration);
			if (this.activation !== activation || this.phase !== phase) {
				return;
			}
			this.nextPhase();
		}
	}

	private runTo(phase: RunningPhase, time: number): void {
		const from = this.phaseTime;
		if (time <= from) {
			return;
		}
		this.phaseTime = time;
		this.progress(phase, from, time);
	}

	private startCooldown(activation: ActivationState): void {
		const duration = this.getCooldownDuration() * this.getCaster().getCooldownMultiplier();
		if (duration <= 0) {
			return;
		}
		this.cooldown = duration;
		this.cooldownOwner = activation;
		activation.startedCooldown = true;
		this.getCaster().cooldownStarted.fire(this, duration);
	}

	private consumeCharge(): void {
		if (this.charges === this.rules.maxCharges) {
			this.rechargeLeft = this.rules.rechargeTime;
		}
		this.charges -= 1;
		this.getCaster().chargesChanged.fire(this, this.charges);
	}

	private gainCharge(): void {
		this.charges += 1;
		this.rechargeLeft = this.charges < this.rules.maxCharges ? this.rules.rechargeTime : 0;
		this.getCaster().chargesChanged.fire(this, this.charges);
	}

	private restoreCharge(): void {
		if (this.charges >= this.rules.maxCharges) {
			return;
		}
		this.charges += 1;
		if (this.charges === this.rules.maxCharges) {
			this.rechargeLeft = 0;
		}
		this.getCaster().chargesChanged.fire(this, this.charges);
	}
}
