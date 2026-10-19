import { RunService } from "@rbxts/services";
import { Ability } from "@skyzwrl/ability-system";

const DASH_SPEED = 80;

export class Dash extends Ability {
	private velocity?: LinearVelocity;

	public constructor(private readonly character: Model) {
		super({
			windup: 0.05,
			active: 0.2,
			recovery: 0.1,
			cooldown: 0.4,
			charges: 2,
			rechargeTime: 3,
			costs: { stamina: 20 },
			priority: 10,
		});
	}

	protected canActivate(): boolean {
		const humanoid = this.character.FindFirstChildOfClass("Humanoid");
		return humanoid !== undefined && humanoid.Health > 0;
	}

	protected onActive(): void {
		// the client owns its character's physics, so only the client moves the body
		if (!RunService.IsClient()) {
			return;
		}
		const root = this.character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		const humanoid = this.character.FindFirstChildOfClass("Humanoid");
		const attachment = root?.FindFirstChild("RootAttachment") as Attachment | undefined;
		if (root === undefined || humanoid === undefined || attachment === undefined) {
			return;
		}

		const moving = humanoid.MoveDirection.Magnitude > 0;
		const direction = moving ? humanoid.MoveDirection : root.CFrame.LookVector;
		const flat = new Vector3(direction.X, 0, direction.Z).Unit;

		const velocity = new Instance("LinearVelocity");
		velocity.Attachment0 = attachment;
		velocity.MaxForce = math.huge;
		velocity.VectorVelocity = flat.mul(DASH_SPEED);
		velocity.Parent = root;
		this.velocity = velocity;
	}

	protected onEnd(): void {
		this.velocity?.Destroy();
		this.velocity = undefined;
	}
}
