/// <reference types="@rbxts/testez/globals" />

import { AbilityCaster } from "..";
import { TestAbility } from "./fixtures";

export = () => {
	describe("cooldowns", () => {
		it("starts the cooldown on activation by default", () => {
			const caster = new AbilityCaster({ bufferWindow: 0 });
			const ability = caster.add("slash", new TestAbility({ active: 0.5, cooldown: 2 }));

			caster.press("slash");
			expect(ability.getCooldown()).to.equal(2);

			caster.update(0.5);
			expect(ability.getCooldown()).to.be.near(1.5, 1e-9);
			expect(caster.press("slash")).to.equal("Cooldown");

			caster.update(1.5);
			expect(caster.press("slash")).to.equal("Activated");
		});

		it("starts the cooldown when the ability ends with cooldownStartsOn End", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("block", new TestAbility({ active: 1, cooldown: 2, cooldownStartsOn: "End" }));

			caster.press("block");
			expect(ability.getCooldown()).to.equal(0);

			caster.update(1);
			expect(ability.isRunning()).to.equal(false);
			expect(ability.getCooldown()).to.equal(2);
		});

		it("scales cooldowns by the caster multiplier and can be reduced or reset", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("slash", new TestAbility({ cooldown: 2 }));
			caster.setCooldownMultiplier(0.5);

			caster.press("slash");
			expect(ability.getCooldown()).to.equal(1);

			ability.reduceCooldown(0.4);
			expect(ability.getCooldown()).to.be.near(0.6, 1e-9);

			ability.resetCooldown();
			expect(ability.isReady()).to.equal(true);
		});

		it("tells cooldown listeners the scaled duration", () => {
			const caster = new AbilityCaster();
			caster.add("slash", new TestAbility({ cooldown: 4 }));
			caster.setCooldownMultiplier(0.75);
			let reported = 0;
			caster.cooldownStarted.connect((_, duration) => {
				reported = duration;
			});

			caster.press("slash");

			expect(reported).to.equal(3);
		});
	});

	describe("charges", () => {
		it("spends charges and recharges them one at a time", () => {
			const caster = new AbilityCaster({ bufferWindow: 0 });
			const ability = caster.add("dash", new TestAbility({ charges: 3, rechargeTime: 2 }));

			caster.press("dash");
			caster.press("dash");
			caster.press("dash");
			expect(ability.getCharges()).to.equal(0);
			expect(caster.press("dash")).to.equal("NoCharges");

			caster.update(1.9);
			expect(ability.getCharges()).to.equal(0);

			caster.update(0.1);
			expect(ability.getCharges()).to.equal(1);
			expect(ability.getRechargeRemaining()).to.equal(2);

			caster.update(4);
			expect(ability.getCharges()).to.equal(3);
			expect(ability.getRechargeRemaining()).to.equal(0);
		});

		it("keeps a running recharge going when a charge is spent mid recharge", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("dash", new TestAbility({ charges: 2, rechargeTime: 2 }));

			caster.press("dash");
			caster.update(1.5);
			caster.press("dash");

			expect(ability.getCharges()).to.equal(0);
			expect(ability.getRechargeRemaining()).to.be.near(0.5, 1e-9);
		});

		it("carries recharge time over between charges in one big update", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("dash", new TestAbility({ charges: 3, rechargeTime: 1 }));

			caster.press("dash");
			caster.press("dash");
			caster.press("dash");
			caster.update(2.5);

			expect(ability.getCharges()).to.equal(2);
			expect(ability.getRechargeRemaining()).to.be.near(0.5, 1e-9);
		});

		it("treats the cooldown as a lockout between charges", () => {
			const caster = new AbilityCaster({ bufferWindow: 0 });
			const ability = caster.add("dash", new TestAbility({ charges: 2, rechargeTime: 5, cooldown: 0.5 }));

			caster.press("dash");
			expect(caster.press("dash")).to.equal("Cooldown");

			caster.update(0.5);
			expect(caster.press("dash")).to.equal("Activated");
			expect(ability.getCharges()).to.equal(0);
		});

		it("fires charge listeners as charges are spent and regained", () => {
			const caster = new AbilityCaster();
			caster.add("dash", new TestAbility({ charges: 2, rechargeTime: 1 }));
			const seen = new Array<number>();
			caster.chargesChanged.connect((_, charges) => seen.push(charges));

			caster.press("dash");
			caster.update(1);

			expect(seen.join(",")).to.equal("1,2");
		});
	});

	describe("global cooldown", () => {
		it("blocks other abilities unless they ignore it", () => {
			const caster = new AbilityCaster({ globalCooldown: 1, bufferWindow: 0 });
			caster.add("slash", new TestAbility());
			caster.add("kick", new TestAbility());
			caster.add("potion", new TestAbility({ ignoresGlobalCooldown: true }));

			caster.press("slash");
			expect(caster.getGlobalCooldown()).to.equal(1);
			expect(caster.press("kick")).to.equal("GlobalCooldown");
			expect(caster.press("potion")).to.equal("Activated");

			caster.update(1);
			expect(caster.press("kick")).to.equal("Activated");
		});

		it("isn't started by abilities that opt out", () => {
			const caster = new AbilityCaster({ globalCooldown: 1 });
			caster.add("emote", new TestAbility({ triggersGlobalCooldown: false }));

			caster.press("emote");

			expect(caster.getGlobalCooldown()).to.equal(0);
		});
	});
};
