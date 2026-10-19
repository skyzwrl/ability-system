import { Debris, RunService, Workspace } from "@rbxts/services";
import { ChargedAbility } from "@skyzwrl/ability-system";

const MIN_SPEED = 60;
const MAX_SPEED = 140;
const MIN_DAMAGE = 10;
const MAX_DAMAGE = 35;

export class Fireball extends ChargedAbility {
	public constructor(private readonly character: Model) {
		super({
			maxChargeTime: 1.5,
			minChargeTime: 0.2,
			active: 0.1,
			recovery: 0.35,
			cooldown: 3,
			costs: { mana: 25 },
			cancellable: { Windup: true },
		});
	}

	protected onActive(): void {
		if (!RunService.IsServer()) {
			return;
		}
		const root = this.character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (root === undefined) {
			return;
		}

		const level = this.getChargeLevel();
		const damage = MIN_DAMAGE + (MAX_DAMAGE - MIN_DAMAGE) * level;

		const projectile = new Instance("Part");
		projectile.Shape = Enum.PartType.Ball;
		projectile.Size = Vector3.one.mul(1 + level);
		projectile.CanCollide = false;
		projectile.CFrame = root.CFrame.mul(new CFrame(0, 1, -3));
		projectile.AssemblyLinearVelocity = root.CFrame.LookVector.mul(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * level);
		projectile.Parent = Workspace;
		projectile.SetNetworkOwner(undefined);

		const hit = projectile.Touched.Connect((part) => {
			if (part.IsDescendantOf(this.character)) {
				return;
			}
			part.Parent?.FindFirstChildOfClass("Humanoid")?.TakeDamage(damage);
			hit.Disconnect();
			projectile.Destroy();
		});
		Debris.AddItem(projectile, 4);
	}
}
