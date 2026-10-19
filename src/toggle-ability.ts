import { Ability, AbilityConfig, Cost, RunningPhase, toCosts } from "./ability";

export interface ToggleConfig extends Omit<AbilityConfig, "active" | "exclusive"> {
	/** drained per second while on, the toggle turns itself off when it can't pay */
	readonly upkeep?: { readonly [resource: string]: number };
}

// toggles run beside the exclusive ability slot, pressing again turns them off
export abstract class ToggleAbility extends Ability {
	private readonly upkeep: ReadonlyArray<Cost>;

	protected constructor(config: ToggleConfig) {
		super({
			...config,
			exclusive: false,
			triggersGlobalCooldown: config.triggersGlobalCooldown ?? false,
			cancellable: config.cancellable ?? { Windup: true, Active: true },
		});
		this.upkeep = toCosts(config.upkeep);
	}

	public isOn(): boolean {
		return this.getPhase() === "Active";
	}

	public requiredResources(): ReadonlyArray<string> {
		const names = [...super.requiredResources()];
		for (const cost of this.upkeep) {
			names.push(cost.resource);
		}
		return names;
	}

	protected getPhaseDuration(phase: RunningPhase): number | undefined {
		return phase === "Active" ? undefined : super.getPhaseDuration(phase);
	}

	protected progress(phase: RunningPhase, from: number, to: number): void {
		if (phase === "Active" && !this.payUpkeep(to - from)) {
			this.end("Depleted");
			return;
		}
		super.progress(phase, from, to);
	}

	private payUpkeep(elapsed: number): boolean {
		const caster = this.getCaster();
		for (const cost of this.upkeep) {
			if (!caster.getResource(cost.resource)!.canAfford(cost.amount * elapsed)) {
				return false;
			}
		}
		for (const cost of this.upkeep) {
			caster.getResource(cost.resource)!.spend(cost.amount * elapsed);
		}
		return true;
	}
}
