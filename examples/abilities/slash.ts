import { RunService, Workspace } from "@rbxts/services";
import { Ability } from "@skyzwrl/ability-system";

const HITBOX_SIZE = new Vector3(6, 5, 6);
const DAMAGE = 12;

export class Slash extends Ability {
	private readonly overlap = new OverlapParams();

	public constructor(private readonly character: Model) {
		super({
			windup: 0.15,
			active: 0.1,
			recovery: 0.3,
			cooldown: 0.25,
			interruptibleBy: { Recovery: 10 },
			cancellable: { Windup: true, Recovery: true },
		});
		this.overlap.FilterType = Enum.RaycastFilterType.Exclude;
		this.overlap.FilterDescendantsInstances = [character];
	}

	protected onActive(): void {
		// damage is authoritative, the client only plays the swing
		if (!RunService.IsServer()) {
			return;
		}
		const root = this.character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (root === undefined) {
			return;
		}

		const hitbox = root.CFrame.mul(new CFrame(0, 0, -HITBOX_SIZE.Z / 2));
		const struck = new Set<Humanoid>();
		for (const part of Workspace.GetPartBoundsInBox(hitbox, HITBOX_SIZE, this.overlap)) {
			const humanoid = part.Parent?.FindFirstChildOfClass("Humanoid");
			if (humanoid !== undefined && !struck.has(humanoid)) {
				struck.add(humanoid);
				humanoid.TakeDamage(DAMAGE);
			}
		}
	}
}
