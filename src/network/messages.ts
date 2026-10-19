import type { ActivationFailure, CasterSnapshot } from "../caster";

export type ClientMessage =
	| { readonly type: "activate"; readonly sequence: number; readonly ability: string }
	| { readonly type: "release"; readonly ability: string }
	| { readonly type: "cancel"; readonly ability: string };

export type ServerMessage =
	| { readonly type: "accepted"; readonly sequence: number; readonly snapshot: CasterSnapshot }
	| {
			readonly type: "rejected";
			readonly sequence: number;
			readonly reason: ActivationFailure;
			readonly snapshot: CasterSnapshot;
	  }
	| { readonly type: "interrupted" };

export interface ClientTransport {
	send(message: ClientMessage): void;
	connect(handler: (message: ServerMessage) => void): () => void;
}

export interface ServerTransport<P> {
	send(peer: P, message: ServerMessage): void;
	connect(handler: (peer: P, message: ClientMessage) => void): () => void;
}

const MAX_ID_LENGTH = 64;
const MAX_SEQUENCE = 2 ** 31 - 1;

// anything arriving from a client is untrusted, so check the shape before it reaches the caster
export function isClientMessage(value: unknown): value is ClientMessage {
	if (!typeIs(value, "table")) {
		return false;
	}
	const message = value as { type?: unknown; sequence?: unknown; ability?: unknown };
	const ability = message.ability;
	if (!typeIs(ability, "string") || ability.size() === 0 || ability.size() > MAX_ID_LENGTH) {
		return false;
	}
	if (message.type === "release" || message.type === "cancel") {
		return true;
	}
	const sequence = message.sequence;
	return (
		message.type === "activate" &&
		typeIs(sequence, "number") &&
		sequence % 1 === 0 &&
		sequence >= 0 &&
		sequence <= MAX_SEQUENCE
	);
}
