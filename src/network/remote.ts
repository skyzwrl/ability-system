import { ReplicatedStorage, RunService } from "@rbxts/services";
import { ClientMessage, ClientTransport, isClientMessage, ServerMessage, ServerTransport } from "./messages";

export function getAbilityRemote(name = "AbilityRemote", parent: Instance = ReplicatedStorage): RemoteEvent {
	if (RunService.IsClient()) {
		return parent.WaitForChild(name) as RemoteEvent;
	}
	const existing = parent.FindFirstChild(name);
	if (existing !== undefined && existing.IsA("RemoteEvent")) {
		return existing;
	}
	const remote = new Instance("RemoteEvent");
	remote.Name = name;
	remote.Parent = parent;
	return remote;
}

export class RemoteServerTransport implements ServerTransport<Player> {
	public constructor(private readonly remote: RemoteEvent) {}

	public send(player: Player, message: ServerMessage): void {
		this.remote.FireClient(player, message);
	}

	public connect(handler: (player: Player, message: ClientMessage) => void): () => void {
		const connection = this.remote.OnServerEvent.Connect((player, message) => {
			if (isClientMessage(message)) {
				handler(player, message);
			}
		});
		return () => connection.Disconnect();
	}
}

export class RemoteClientTransport implements ClientTransport {
	public constructor(private readonly remote: RemoteEvent) {}

	public send(message: ClientMessage): void {
		this.remote.FireServer(message);
	}

	public connect(handler: (message: ServerMessage) => void): () => void {
		const connection = this.remote.OnClientEvent.Connect((message: ServerMessage) => handler(message));
		return () => connection.Disconnect();
	}
}
