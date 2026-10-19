/// <reference types="@rbxts/testez/globals" />

import { AbilityCaster } from "..";
import { TestAbility } from "./fixtures";

export = () => {
	describe("phases", () => {
		it("moves through windup, active and recovery on their timers", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("slash", new TestAbility({ windup: 0.2, active: 0.3, recovery: 0.5 }));

			expect(caster.press("slash")).to.equal("Activated");
			expect(ability.getPhase()).to.equal("Windup");

			caster.update(0.1);
			expect(ability.getPhase()).to.equal("Windup");

			caster.update(0.15);
			expect(ability.getPhase()).to.equal("Active");
			expect(ability.getPhaseTime()).to.be.near(0.05, 1e-9);

			caster.update(0.3);
			expect(ability.getPhase()).to.equal("Recovery");

			caster.update(0.4);
			expect(ability.getPhase()).to.equal("Recovery");

			caster.update(0.05);
			expect(ability.getPhase()).to.equal("Idle");
			expect(ability.log.join(",")).to.equal("windup,active,recovery,end:Completed");
		});

		it("carries leftover time through several phases in one update", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("slash", new TestAbility({ windup: 0.1, active: 0.1, recovery: 0.1 }));

			caster.press("slash");
			caster.update(0.25);

			expect(ability.getPhase()).to.equal("Recovery");
			expect(ability.getPhaseTime()).to.be.near(0.05, 1e-9);
			expect(ability.log.join(",")).to.equal("windup,active,recovery");
		});

		it("runs every hook during the press when no phase has a duration", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("blink", new TestAbility());

			expect(caster.press("blink")).to.equal("Activated");

			expect(ability.getPhase()).to.equal("Idle");
			expect(ability.log.join(",")).to.equal("windup,active,recovery,end:Completed");
			expect(caster.getCurrent()).never.to.be.ok();
		});

		it("fires phase listeners in order", () => {
			const caster = new AbilityCaster();
			caster.add("blink", new TestAbility());
			const phases = new Array<string>();
			caster.phaseChanged.connect((_, phase) => phases.push(phase));

			caster.press("blink");

			expect(phases.join(",")).to.equal("Windup,Active,Recovery,Idle");
		});

		it("reports the time left across the remaining phases", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("slash", new TestAbility({ windup: 0.2, active: 0.3, recovery: 0.5 }));

			expect(ability.getRemainingTime()).to.equal(0);
			caster.press("slash");
			caster.update(0.3);

			expect(ability.getRemainingTime()).to.be.near(0.7, 1e-9);
		});

		it("refuses to start when canActivate says no", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("slash", new TestAbility());
			ability.allowed = false;

			expect(caster.press("slash")).to.equal("Condition");
			expect(ability.isRunning()).to.equal(false);
			expect(caster.press("missing")).to.equal("Unknown");
		});

		it("rejects bad configs", () => {
			expect(() => new TestAbility({ windup: -1 })).to.throw("windup must be a finite number");
			expect(() => new TestAbility({ charges: 2 })).to.throw("rechargeTime above 0");
			expect(() => new TestAbility({ charges: 1.5, rechargeTime: 1 })).to.throw("whole number");
			expect(() => new TestAbility({ costs: { mana: -5 } })).to.throw("cost of mana");
		});

		it("rejects duplicate ids and costs the caster has no pool for", () => {
			const caster = new AbilityCaster();
			caster.add("slash", new TestAbility());

			expect(() => caster.add("slash", new TestAbility())).to.throw("already added");
			expect(() => caster.add("bolt", new TestAbility({ costs: { mana: 5 } }))).to.throw("no pool for");
		});
	});
};
