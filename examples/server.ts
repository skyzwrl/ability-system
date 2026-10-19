import { Players, RunService } from "@rbxts/services";
import { AbilityServer, getAbilityRemote, RemoteServerTransport } from "@skyzwrl/ability-system";
import { createCaster } from "./loadout";

const server = new AbilityServer(new RemoteServerTransport(getAbilityRemote()));

function track(player: Player): void {
	player.CharacterAdded.Connect((character) => {
		server.register(player, createCaster(character));
		const humanoid = character.WaitForChild("Humanoid") as Humanoid;
		humanoid.Died.Connect(() => server.unregister(player));
	});
}

Players.PlayerAdded.Connect(track);
for (const player of Players.GetPlayers()) {
	track(player);
}
Players.PlayerRemoving.Connect((player) => server.unregister(player));

RunService.Heartbeat.Connect((deltaTime) => server.update(deltaTime));

// stuns and other crowd control end whatever the player was casting on both sides
export function stun(player: Player): void {
	server.interrupt(player);
}
