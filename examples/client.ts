import { ContextActionService, Players, RunService } from "@rbxts/services";
import { AbilityClient, getAbilityRemote, RemoteClientTransport } from "@skyzwrl/ability-system";
import { createCaster } from "./loadout";

const BINDINGS: ReadonlyArray<[ability: string, input: Enum.KeyCode | Enum.UserInputType]> = [
	["slash", Enum.UserInputType.MouseButton1],
	["dash", Enum.KeyCode.Q],
	["fireball", Enum.KeyCode.E],
	["mend", Enum.KeyCode.R],
	["sprint", Enum.KeyCode.LeftShift],
];

const transport = new RemoteClientTransport(getAbilityRemote());
let client: AbilityClient | undefined;

function bind(): void {
	for (const [ability, input] of BINDINGS) {
		ContextActionService.BindAction(
			`ability_${ability}`,
			(_, state) => {
				if (client === undefined) {
					return Enum.ContextActionResult.Pass;
				}
				if (state === Enum.UserInputState.Begin) {
					client.press(ability);
				} else if (state === Enum.UserInputState.End) {
					client.release(ability);
				}
				return Enum.ContextActionResult.Sink;
			},
			false,
			input,
		);
	}
}

Players.LocalPlayer.CharacterAdded.Connect((character) => {
	client?.destroy();
	client = new AbilityClient(createCaster(character), transport);
});

Players.LocalPlayer.CharacterRemoving.Connect(() => {
	client?.destroy();
	client = undefined;
});

bind();
RunService.Heartbeat.Connect((deltaTime) => client?.update(deltaTime));
