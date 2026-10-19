import { ToggleAbility } from "@skyzwrl/ability-system";

const SPRINT_SPEED = 26;

export class Sprint extends ToggleAbility {
	private baseSpeed = 16;

	public constructor(private readonly character: Model) {
		super({ upkeep: { stamina: 12 }, cooldown: 0.5, cooldownStartsOn: "End" });
	}

	protected onActive(): void {
		const humanoid = this.character.FindFirstChildOfClass("Humanoid");
		if (humanoid !== undefined) {
			this.baseSpeed = humanoid.WalkSpeed;
			humanoid.WalkSpeed = SPRINT_SPEED;
		}
	}

	protected onEnd(): void {
		const humanoid = this.character.FindFirstChildOfClass("Humanoid");
		if (humanoid !== undefined) {
			humanoid.WalkSpeed = this.baseSpeed;
		}
	}
}
