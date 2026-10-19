import { RunService } from "@rbxts/services";
import { ChanneledAbility } from "@skyzwrl/ability-system";

const HEAL_PER_TICK = 6;

export class Mend extends ChanneledAbility {
	public constructor(private readonly character: Model) {
		super({
			windup: 0.25,
			maxDuration: 3,
			tickInterval: 0.5,
			recovery: 0.2,
			cooldown: 8,
			cooldownStartsOn: "End",
			costs: { mana: 30 },
			cancellable: { Windup: true, Active: true },
		});
	}

	protected onTick(): void {
		if (!RunService.IsServer()) {
			return;
		}
		const humanoid = this.character.FindFirstChildOfClass("Humanoid");
		if (humanoid !== undefined && humanoid.Health > 0) {
			humanoid.Health = math.min(humanoid.Health + HEAL_PER_TICK, humanoid.MaxHealth);
		}
	}
}
