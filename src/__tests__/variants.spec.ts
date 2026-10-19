/// <reference types="@rbxts/testez/globals" />

import { AbilityCaster } from "..";
import { TestAbility, TestChanneled, TestCharged, TestToggle } from "./fixtures";

export = () => {
	describe("ChargedAbility", () => {
		it("fires with the charge level reached when released", () => {
			const caster = new AbilityCaster();
			const fireball = caster.add("fireball", new TestCharged({ maxChargeTime: 2, active: 0.5 }));

			caster.press("fireball");
			caster.update(0.5);
			expect(fireball.getChargeLevel()).to.be.near(0.25, 1e-9);

			expect(caster.release("fireball")).to.equal(true);
			expect(fireball.firedLevel).to.be.near(0.25, 1e-9);
			expect(fireball.getPhase()).to.equal("Active");
		});

		it("fires at full charge on its own with releaseAtMax", () => {
			const caster = new AbilityCaster();
			const fireball = caster.add("fireball", new TestCharged({ maxChargeTime: 2, active: 1 }));

			caster.press("fireball");
			caster.update(2.5);

			expect(fireball.firedLevel).to.equal(1);
			expect(fireball.getPhase()).to.equal("Active");
			expect(fireball.getPhaseTime()).to.be.near(0.5, 1e-9);
			expect(caster.release("fireball")).to.equal(false);
		});

		it("holds at full charge until release without releaseAtMax", () => {
			const caster = new AbilityCaster();
			const fireball = caster.add(
				"fireball",
				new TestCharged({ maxChargeTime: 2, releaseAtMax: false, active: 1 }),
			);

			caster.press("fireball");
			caster.update(5);
			expect(fireball.getPhase()).to.equal("Windup");
			expect(fireball.getChargeLevel()).to.equal(1);

			caster.release("fireball");
			expect(fireball.firedLevel).to.equal(1);
		});

		it("cancels and refunds when released before the minimum charge", () => {
			const caster = new AbilityCaster({ resources: { mana: { max: 100 } } });
			const fireball = caster.add(
				"fireball",
				new TestCharged({ maxChargeTime: 2, minChargeTime: 0.3, costs: { mana: 40 } }),
			);

			caster.press("fireball");
			caster.update(0.1);
			caster.release("fireball");

			expect(fireball.endReason).to.equal("Cancelled");
			expect(fireball.firedLevel).never.to.be.ok();
			expect(caster.getResource("mana")!.get()).to.equal(100);
		});

		it("drops a buffered press when the button is let go before it starts", () => {
			const caster = new AbilityCaster({ bufferWindow: 1 });
			caster.add("attack", new TestAbility({ active: 0.5 }));
			const fireball = caster.add("fireball", new TestCharged({ maxChargeTime: 2 }));

			caster.press("attack");
			expect(caster.press("fireball")).to.equal("Buffered");
			caster.release("fireball");
			caster.update(0.6);

			expect(fireball.isRunning()).to.equal(false);
		});
	});

	describe("ChanneledAbility", () => {
		it("ticks on its interval while held", () => {
			const caster = new AbilityCaster();
			const beam = caster.add("beam", new TestChanneled({ maxDuration: 2, tickInterval: 0.5 }));

			caster.press("beam");
			caster.update(1.2);
			expect(beam.tickLog.join(",")).to.equal("1,2");

			caster.update(0.3);
			expect(beam.tickLog.join(",")).to.equal("1,2,3");
		});

		it("lands ticks on their boundaries despite float drift", () => {
			const caster = new AbilityCaster();
			const beam = caster.add("beam", new TestChanneled({ maxDuration: 1, tickInterval: 0.1 }));

			caster.press("beam");
			for (let frame = 0; frame < 7; frame++) {
				caster.update(0.1);
			}

			expect(beam.getTickCount()).to.equal(7);
		});

		it("stops early on release and moves to recovery", () => {
			const caster = new AbilityCaster();
			const beam = caster.add("beam", new TestChanneled({ maxDuration: 3, tickInterval: 0.5, recovery: 0.4 }));

			caster.press("beam");
			caster.update(1.1);
			expect(caster.release("beam")).to.equal(true);

			expect(beam.getPhase()).to.equal("Recovery");
			caster.update(1);
			expect(beam.getTickCount()).to.equal(2);
			expect(beam.endReason).to.equal("Completed");
		});

		it("ends by itself at maxDuration", () => {
			const caster = new AbilityCaster();
			const beam = caster.add("beam", new TestChanneled({ maxDuration: 2, tickInterval: 0.5 }));

			caster.press("beam");
			caster.update(3);

			expect(beam.getTickCount()).to.equal(4);
			expect(beam.isRunning()).to.equal(false);
		});

		it("stops ticking when interrupted", () => {
			const caster = new AbilityCaster();
			const beam = caster.add("beam", new TestChanneled({ maxDuration: 2, tickInterval: 0.5 }));

			caster.press("beam");
			caster.update(0.6);
			caster.interrupt();
			caster.update(2);

			expect(beam.getTickCount()).to.equal(1);
			expect(beam.endReason).to.equal("Interrupted");
		});

		it("can tick the moment the channel starts", () => {
			const caster = new AbilityCaster();
			const beam = caster.add(
				"beam",
				new TestChanneled({ maxDuration: 1, tickInterval: 0.5, tickOnStart: true }),
			);

			caster.press("beam");
			caster.update(0.5);

			expect(beam.tickLog.join(",")).to.equal("1,2");
		});
	});

	describe("ToggleAbility", () => {
		it("turns on and off with presses", () => {
			const caster = new AbilityCaster();
			const sprint = caster.add("sprint", new TestToggle());

			expect(caster.press("sprint")).to.equal("Activated");
			expect(sprint.isOn()).to.equal(true);

			expect(caster.press("sprint")).to.equal("Deactivated");
			expect(sprint.isRunning()).to.equal(false);
			expect(sprint.endReason).to.equal("Cancelled");
		});

		it("runs beside the exclusive ability", () => {
			const caster = new AbilityCaster();
			const sprint = caster.add("sprint", new TestToggle());
			const attack = caster.add("attack", new TestAbility({ active: 1 }));

			caster.press("sprint");
			caster.press("attack");
			caster.update(0.5);

			expect(sprint.isOn()).to.equal(true);
			expect(caster.getCurrent()).to.equal(attack);
		});

		it("drains upkeep and switches off when it can't pay", () => {
			const caster = new AbilityCaster({ resources: { stamina: { max: 10, regen: 5, regenDelay: 1 } } });
			const sprint = caster.add("sprint", new TestToggle({ upkeep: { stamina: 4 } }));

			caster.press("sprint");
			caster.update(2);
			expect(caster.getResource("stamina")!.get()).to.be.near(2, 1e-9);

			caster.update(1);
			expect(sprint.isOn()).to.equal(false);
			expect(sprint.endReason).to.equal("Depleted");
		});

		it("rejects upkeep for resources the caster doesn't have", () => {
			const caster = new AbilityCaster();
			expect(() => caster.add("sprint", new TestToggle({ upkeep: { stamina: 4 } }))).to.throw("no pool for");
		});
	});
};
