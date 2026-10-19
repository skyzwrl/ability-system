/// <reference types="@rbxts/testez/globals" />

import { isClientMessage } from "..";

export = () => {
	describe("isClientMessage", () => {
		it("accepts well formed messages", () => {
			expect(isClientMessage({ type: "activate", sequence: 1, ability: "bolt" })).to.equal(true);
			expect(isClientMessage({ type: "release", ability: "bolt" })).to.equal(true);
			expect(isClientMessage({ type: "cancel", ability: "bolt" })).to.equal(true);
		});

		it("rejects anything else a client could send", () => {
			const bad: Array<unknown> = [
				5,
				"activate",
				{},
				{ type: "activate", ability: "bolt" },
				{ type: "activate", sequence: -1, ability: "bolt" },
				{ type: "activate", sequence: 1.5, ability: "bolt" },
				{ type: "activate", sequence: 0 / 0, ability: "bolt" },
				{ type: "activate", sequence: math.huge, ability: "bolt" },
				{ type: "activate", sequence: "1", ability: "bolt" },
				{ type: "explode", ability: "bolt" },
				{ type: "cancel" },
				{ type: "cancel", ability: "" },
				{ type: "cancel", ability: string.rep("a", 65) },
				{ type: "cancel", ability: 5 },
			];

			expect(isClientMessage(undefined)).to.equal(false);
			for (const value of bad) {
				expect(isClientMessage(value)).to.equal(false);
			}
		});
	});
};
