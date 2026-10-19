/// <reference types="@rbxts/testez/globals" />

import { AbilityCaster, ResourcePool } from "..";
import { TestAbility } from "./fixtures";

export = () => {
	describe("ResourcePool", () => {
		it("regenerates once the delay after spending has passed and caps at max", () => {
			const stamina = new ResourcePool("stamina", { max: 100, regen: 10, regenDelay: 1, start: 50 });

			stamina.spend(20);
			expect(stamina.get()).to.equal(30);

			stamina.update(0.5);
			expect(stamina.get()).to.equal(30);

			stamina.update(1);
			expect(stamina.get()).to.be.near(35, 1e-9);

			stamina.update(10);
			expect(stamina.get()).to.equal(100);
		});

		it("refuses to spend more than it has", () => {
			const mana = new ResourcePool("mana", { max: 50, start: 10 });

			expect(mana.spend(20)).to.equal(false);
			expect(mana.get()).to.equal(10);
		});

		it("only reports real changes", () => {
			const mana = new ResourcePool("mana", { max: 50 });
			let changes = 0;
			mana.changed.connect(() => changes++);

			mana.refund(10);
			mana.set(50);
			mana.spend(5);

			expect(changes).to.equal(1);
		});
	});

	describe("costs", () => {
		it("are paid on activation and block the ability when unaffordable", () => {
			const caster = new AbilityCaster({ resources: { mana: { max: 50 } } });
			caster.add("bolt", new TestAbility({ costs: { mana: 30 } }));

			expect(caster.press("bolt")).to.equal("Activated");
			expect(caster.getResource("mana")!.get()).to.equal(20);
			expect(caster.press("bolt")).to.equal("Resources");
		});

		it("need every resource to be affordable before anything is spent", () => {
			const caster = new AbilityCaster({
				resources: { mana: { max: 100 }, stamina: { max: 100, start: 50 } },
			});
			caster.add("surge", new TestAbility({ costs: { mana: 10, stamina: 80 } }));

			expect(caster.press("surge")).to.equal("Resources");
			expect(caster.getResource("mana")!.get()).to.equal(100);
			expect(caster.getResource("stamina")!.get()).to.equal(50);
		});

		it("are refunded with the charge and cooldown when cancelled during windup", () => {
			const caster = new AbilityCaster({ resources: { mana: { max: 50 } }, globalCooldown: 0.5 });
			const ability = caster.add(
				"bolt",
				new TestAbility({
					windup: 1,
					active: 1,
					cooldown: 3,
					charges: 2,
					rechargeTime: 4,
					costs: { mana: 20 },
				}),
			);

			caster.press("bolt");
			expect(caster.getResource("mana")!.get()).to.equal(30);
			expect(ability.getCharges()).to.equal(1);
			expect(ability.getCooldown()).to.equal(3);
			expect(caster.getGlobalCooldown()).to.equal(0.5);

			expect(caster.cancel()).to.equal(true);
			expect(caster.getResource("mana")!.get()).to.equal(50);
			expect(ability.getCharges()).to.equal(2);
			expect(ability.getCooldown()).to.equal(0);
			expect(caster.getGlobalCooldown()).to.equal(0);
			expect(ability.log.join(",")).to.equal("windup,end:Cancelled");
		});

		it("are kept once the windup is over", () => {
			const caster = new AbilityCaster({ resources: { mana: { max: 50 } } });
			const ability = caster.add(
				"bolt",
				new TestAbility({ windup: 1, active: 1, cooldown: 3, costs: { mana: 20 } }),
			);

			caster.press("bolt");
			caster.update(1.1);
			expect(caster.cancel()).to.equal(false);

			expect(caster.interrupt()).to.equal(true);
			expect(caster.getResource("mana")!.get()).to.equal(30);
			expect(ability.getCooldown()).to.be.near(1.9, 1e-9);
			expect(ability.log.join(",")).to.equal("windup,active,end:Interrupted");
		});

		it("aren't refunded when refundWindup is off", () => {
			const caster = new AbilityCaster({ resources: { mana: { max: 50 } } });
			caster.add("bolt", new TestAbility({ windup: 1, refundWindup: false, costs: { mana: 20 } }));

			caster.press("bolt");
			caster.cancel();

			expect(caster.getResource("mana")!.get()).to.equal(30);
		});
	});
};
