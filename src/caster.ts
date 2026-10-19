import { Ability, AbilityPhase, AbilitySnapshot, Activation, ActivationState, EndReason, EPSILON } from "./ability";
import { Listeners } from "./listeners";
import { ResourceConfig, ResourcePool } from "./resource-pool";

export type ActivationFailure =
	"Unknown" | "Running" | "GlobalCooldown" | "Cooldown" | "NoCharges" | "Resources" | "Condition" | "Busy";

export type ActivationResult =
	| { readonly success: true; readonly activation: Activation }
	| { readonly success: false; readonly reason: ActivationFailure };

export type PressResult = "Activated" | "Buffered" | "Deactivated" | ActivationFailure;

export interface CasterOptions {
	readonly resources?: { readonly [name: string]: ResourceConfig };
	readonly globalCooldown?: number;
	/** how long a press that couldn't go through yet keeps retrying */
	readonly bufferWindow?: number;
}

export interface CasterSnapshot {
	readonly abilities: { readonly [id: string]: AbilitySnapshot };
	readonly resources: { readonly [name: string]: number };
	readonly globalCooldown: number;
}

export interface Tolerance {
	readonly time: number;
	readonly resource: number;
}

const BUFFERED: ReadonlySet<ActivationFailure> = new Set<ActivationFailure>([
	"Busy",
	"GlobalCooldown",
	"Cooldown",
	"NoCharges",
]);

function failure(reason: ActivationFailure): ActivationResult {
	return { success: false, reason };
}

export class AbilityCaster {
	public readonly phaseChanged = new Listeners<[ability: Ability, phase: AbilityPhase]>();
	public readonly activated = new Listeners<[activation: Activation]>();
	public readonly ended = new Listeners<[ability: Ability, reason: EndReason]>();
	public readonly cooldownStarted = new Listeners<[ability: Ability, duration: number]>();
	public readonly chargesChanged = new Listeners<[ability: Ability, charges: number]>();

	private readonly abilities = new Map<string, Ability>();
	private readonly order = new Array<Ability>();
	private readonly resources = new Map<string, ResourcePool>();
	private readonly globalCooldownDuration: number;
	private readonly bufferWindow: number;

	private cooldownMultiplier = 1;
	private globalCooldown = 0;
	private globalCooldownOwner?: Activation;
	private current?: Ability;
	private buffered?: string;
	private bufferLeft = 0;
	private frame = 0;

	public constructor(options: CasterOptions = {}) {
		this.globalCooldownDuration = options.globalCooldown ?? 0;
		this.bufferWindow = options.bufferWindow ?? 0.2;
		if (options.resources !== undefined) {
			for (const [name, config] of pairs(options.resources)) {
				this.resources.set(name as string, new ResourcePool(name as string, config));
			}
		}
	}

	public add<T extends Ability>(id: string, ability: T): T {
		if (this.abilities.has(id)) {
			error(`an ability with id "${id}" was already added`, 2);
		}
		for (const resource of ability.requiredResources()) {
			if (!this.resources.has(resource)) {
				error(`ability "${id}" uses ${resource}, which this caster has no pool for`, 2);
			}
		}
		ability.bind(id, this, (ended, activation) => this.handleEnded(ended, activation));
		this.abilities.set(id, ability);
		this.order.push(ability);
		return ability;
	}

	public getAbility(id: string): Ability | undefined {
		return this.abilities.get(id);
	}

	public getAbilities(): ReadonlyArray<Ability> {
		return this.order;
	}

	public getResource(name: string): ResourcePool | undefined {
		return this.resources.get(name);
	}

	public getCurrent(): Ability | undefined {
		return this.current;
	}

	public getBuffered(): string | undefined {
		return this.buffered;
	}

	public getGlobalCooldown(): number {
		return this.globalCooldown;
	}

	public getCooldownMultiplier(): number {
		return this.cooldownMultiplier;
	}

	public setCooldownMultiplier(multiplier: number): void {
		this.cooldownMultiplier = math.max(multiplier, 0);
	}

	public press(id: string): PressResult {
		const ability = this.abilities.get(id);
		if (ability === undefined) {
			return "Unknown";
		}
		if (!ability.rules.exclusive && ability.isRunning()) {
			return this.cancel(id) ? "Deactivated" : "Running";
		}

		const result = this.activate(id);
		if (result.success) {
			this.buffered = undefined;
			return "Activated";
		}
		if (this.bufferWindow > 0 && BUFFERED.has(result.reason)) {
			this.buffered = id;
			this.bufferLeft = this.bufferWindow;
			return "Buffered";
		}
		return result.reason;
	}

	public release(id: string): boolean {
		const ability = this.abilities.get(id);
		if (ability === undefined) {
			return false;
		}
		// letting go before a buffered hold ability started means it shouldn't start at all
		if (this.buffered === id && ability.requiresHold()) {
			this.buffered = undefined;
		}
		return ability.release();
	}

	public cancel(id?: string): boolean {
		const ability = id === undefined ? this.current : this.abilities.get(id);
		if (ability === undefined || !ability.isCancellable()) {
			return false;
		}
		ability.end("Cancelled");
		return true;
	}

	public interrupt(): boolean {
		this.buffered = undefined;
		const current = this.current;
		if (current === undefined) {
			return false;
		}
		current.end("Interrupted");
		return true;
	}

	/**
	 * grace lets timers that are almost done count as done, for checking requests that were sent from a
	 * client whose clock runs a little ahead of ours
	 */
	public activate(id: string, grace = 0): ActivationResult {
		const ability = this.abilities.get(id);
		if (ability === undefined) {
			return failure("Unknown");
		}
		const rules = ability.rules;
		if (!rules.exclusive && ability.isRunning()) {
			return failure("Running");
		}
		if (!rules.ignoresGlobalCooldown && this.globalCooldown > grace) {
			return failure("GlobalCooldown");
		}
		if (ability.getCooldown() > grace) {
			return failure("Cooldown");
		}
		if (ability.getCharges() < 1 && ability.getRechargeRemaining() > grace) {
			return failure("NoCharges");
		}
		for (const cost of rules.costs) {
			if (!this.pool(cost.resource).canAfford(cost.amount)) {
				return failure("Resources");
			}
		}
		if (!ability.checkCondition()) {
			return failure("Condition");
		}

		const current = rules.exclusive ? this.current : undefined;
		let finishCurrent = false;
		if (current !== undefined) {
			const remaining = current.getRemainingTime();
			finishCurrent = remaining !== undefined && remaining <= grace;
			if (!finishCurrent && !current.canBeInterruptedBy(rules.priority)) {
				return failure("Busy");
			}
		}

		if (!rules.ignoresGlobalCooldown && this.globalCooldown > 0) {
			this.clearGlobalCooldown();
		}
		if (ability.getCooldown() > 0) {
			ability.resetCooldown();
		}
		if (ability.getCharges() < 1) {
			ability.addCharge();
		}
		if (current !== undefined) {
			if (finishCurrent) {
				current.fastForward();
			} else {
				current.end("Interrupted");
			}
		}

		const activation: ActivationState = {
			ability,
			costs: rules.costs,
			frame: this.frame,
			consumedCharge: false,
			startedCooldown: false,
			startedGlobalCooldown: false,
			refunded: false,
		};
		for (const cost of rules.costs) {
			this.pool(cost.resource).spend(cost.amount);
		}
		if (rules.triggersGlobalCooldown && this.globalCooldownDuration > 0) {
			this.globalCooldown = this.globalCooldownDuration;
			this.globalCooldownOwner = activation;
			activation.startedGlobalCooldown = true;
		}
		if (rules.exclusive) {
			this.current = ability;
		}

		this.activated.fire(activation);
		ability.start(activation);
		return { success: true, activation };
	}

	public revert(activation: Activation): void {
		const state = activation as ActivationState;
		const ability = state.ability;
		if (ability.getActivation() === state) {
			ability.end("Rejected");
		}
		if (state.refunded) {
			return;
		}
		state.refunded = true;
		for (const cost of state.costs) {
			this.pool(cost.resource).refund(cost.amount);
		}
		ability.revert(state);
		if (this.globalCooldownOwner === state) {
			this.clearGlobalCooldown();
		}
	}

	public update(deltaTime: number): void {
		this.frame += 1;
		for (const [, pool] of this.resources) {
			pool.update(deltaTime);
		}
		if (this.globalCooldown > 0) {
			const left = this.globalCooldown - deltaTime;
			this.globalCooldown = left > EPSILON ? left : 0;
		}
		for (const ability of this.order) {
			ability.tickTimers(deltaTime);
		}
		// abilities started during this update (buffered presses, combo follow ups from hooks) wait until the next one
		for (const ability of this.order) {
			const activation = ability.getActivation();
			if (activation !== undefined && activation.frame !== this.frame) {
				ability.step(deltaTime);
			}
		}
		this.updateBuffer(deltaTime);
	}

	public snapshot(): CasterSnapshot {
		const abilities: { [id: string]: AbilitySnapshot } = {};
		for (const ability of this.order) {
			abilities[ability.getId()] = ability.snapshot();
		}
		const resources: { [name: string]: number } = {};
		for (const [name, pool] of this.resources) {
			resources[name] = pool.get();
		}
		return { abilities, resources, globalCooldown: this.globalCooldown };
	}

	public reconcile(snapshot: CasterSnapshot, tolerance: Tolerance): number {
		let corrections = 0;
		for (const [id, state] of pairs(snapshot.abilities)) {
			const ability = this.abilities.get(id as string);
			if (ability !== undefined && ability.reconcile(state, tolerance.time)) {
				corrections += 1;
			}
		}
		for (const [name, value] of pairs(snapshot.resources)) {
			const pool = this.resources.get(name as string);
			if (pool !== undefined && math.abs(pool.get() - value) > tolerance.resource) {
				pool.set(value);
				corrections += 1;
			}
		}
		if (math.abs(this.globalCooldown - snapshot.globalCooldown) > tolerance.time) {
			this.globalCooldown = snapshot.globalCooldown;
			this.globalCooldownOwner = undefined;
			corrections += 1;
		}
		return corrections;
	}

	private updateBuffer(deltaTime: number): void {
		const id = this.buffered;
		if (id === undefined) {
			return;
		}
		this.bufferLeft -= deltaTime;
		if (this.bufferLeft < 0 || this.activate(id).success) {
			this.buffered = undefined;
		}
	}

	private handleEnded(ability: Ability, activation: ActivationState): void {
		if (this.current === ability) {
			this.current = undefined;
		}
		if (activation.refunded) {
			for (const cost of activation.costs) {
				this.pool(cost.resource).refund(cost.amount);
			}
			if (this.globalCooldownOwner === activation) {
				this.clearGlobalCooldown();
			}
		}
		this.phaseChanged.fire(ability, "Idle");
		this.ended.fire(ability, activation.endReason ?? "Completed");
	}

	private clearGlobalCooldown(): void {
		this.globalCooldown = 0;
		this.globalCooldownOwner = undefined;
	}

	private pool(name: string): ResourcePool {
		return this.resources.get(name)!;
	}
}
