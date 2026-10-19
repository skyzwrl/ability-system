/// <reference types="@rbxts/testez/globals" />

import { AbilityCaster } from "..";
import { TestAbility } from "./fixtures";

export = () => {
	describe("cancel and interrupt", () => {
		it("only cancels in phases marked cancellable", () => {
			const caster = new AbilityCaster();
			const ability = caster.add(
				"slash",
				new TestAbility({ windup: 0.2, active: 0.2, recovery: 0.2, cancellable: { Recovery: true } }),
			);

			caster.press("slash");
			expect(caster.cancel()).to.equal(false);

			caster.update(0.45);
			expect(ability.getPhase()).to.equal("Recovery");
			expect(caster.cancel()).to.equal(true);
			expect(ability.log.join(",")).to.equal("windup,active,recovery,end:Cancelled");
		});

		it("lets higher priority abilities interrupt using each phase's threshold", () => {
			const caster = new AbilityCaster({ bufferWindow: 0 });
			const attack = caster.add(
				"attack",
				new TestAbility({
					windup: 0.2,
					active: 0.2,
					recovery: 0.4,
					interruptibleBy: { Windup: 10, Recovery: 0 },
				}),
			);
			caster.add("dash", new TestAbility({ priority: 5, active: 0.2 }));
			const ultimate = caster.add("ultimate", new TestAbility({ priority: 20, active: 1 }));

			caster.press("attack");
			expect(caster.press("dash")).to.equal("Busy");
			expect(caster.press("ultimate")).to.equal("Activated");
			expect(attack.log.join(",")).to.equal("windup,end:Interrupted");
			expect(caster.getCurrent()).to.equal(ultimate);
		});

		it("can't interrupt a phase that has no threshold", () => {
			const caster = new AbilityCaster({ bufferWindow: 0 });
			caster.add(
				"attack",
				new TestAbility({ windup: 0.2, active: 0.2, recovery: 0.4, interruptibleBy: { Recovery: 0 } }),
			);
			caster.add("dash", new TestAbility({ priority: 5 }));

			caster.press("attack");
			caster.update(0.25);
			expect(caster.press("dash")).to.equal("Busy");

			caster.update(0.2);
			expect(caster.press("dash")).to.equal("Activated");
		});

		it("forces the current ability to stop with interrupt", () => {
			const caster = new AbilityCaster();
			const ability = caster.add("slash", new TestAbility({ active: 1 }));

			caster.press("slash");
			caster.update(0.1);

			expect(caster.interrupt()).to.equal(true);
			expect(ability.log.join(",")).to.equal("windup,active,end:Interrupted");
			expect(caster.interrupt()).to.equal(false);
		});
	});

	describe("buffering", () => {
		it("fires a press made while busy as soon as the current ability finishes", () => {
			const caster = new AbilityCaster({ bufferWindow: 0.2 });
			caster.add("attack", new TestAbility({ active: 0.3 }));
			const dash = caster.add("dash", new TestAbility({ active: 0.5 }));

			caster.press("attack");
			caster.update(0.2);
			expect(caster.press("dash")).to.equal("Buffered");

			caster.update(0.1);
			expect(caster.getCurrent()).to.equal(dash);
			expect(caster.getBuffered()).never.to.be.ok();
		});

		it("doesn't advance a buffered ability in the update that started it", () => {
			const caster = new AbilityCaster({ bufferWindow: 0.5 });
			caster.add("attack", new TestAbility({ active: 0.1 }));
			const dash = caster.add("dash", new TestAbility({ active: 0.5 }));

			caster.press("attack");
			caster.press("dash");
			caster.update(0.3);

			expect(dash.getPhase()).to.equal("Active");
			expect(dash.getPhaseTime()).to.equal(0);
		});

		it("drops the press once the window runs out", () => {
			const caster = new AbilityCaster({ bufferWindow: 0.2 });
			caster.add("attack", new TestAbility({ active: 1 }));
			const dash = caster.add("dash", new TestAbility());

			caster.press("attack");
			caster.press("dash");
			caster.update(0.25);
			expect(caster.getBuffered()).never.to.be.ok();

			caster.update(1);
			expect(dash.log.size()).to.equal(0);
		});

		it("keeps only the latest press", () => {
			const caster = new AbilityCaster({ bufferWindow: 0.5 });
			caster.add("attack", new TestAbility({ active: 0.2 }));
			const kick = caster.add("kick", new TestAbility());
			const dash = caster.add("dash", new TestAbility({ active: 1 }));

			caster.press("attack");
			caster.press("kick");
			caster.press("dash");
			caster.update(0.2);

			expect(kick.log.size()).to.equal(0);
			expect(caster.getCurrent()).to.equal(dash);
		});

		it("is cleared by an interrupt", () => {
			const caster = new AbilityCaster({ bufferWindow: 0.5 });
			caster.add("attack", new TestAbility({ active: 1 }));
			caster.add("dash", new TestAbility());

			caster.press("attack");
			caster.press("dash");
			caster.interrupt();

			expect(caster.getBuffered()).never.to.be.ok();
		});

		it("keeps a tapped press but drops a released hold ability", () => {
			const caster = new AbilityCaster({ bufferWindow: 0.5 });
			caster.add("attack", new TestAbility({ active: 1 }));
			caster.add("dash", new TestAbility());

			caster.press("attack");
			caster.press("dash");
			caster.release("dash");

			expect(caster.getBuffered()).to.equal("dash");
		});
	});
};
