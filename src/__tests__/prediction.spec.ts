/// <reference types="@rbxts/testez/globals" />

import { AbilityCaster, AbilityClient, AbilityServer, LoopbackNetwork } from "..";
import { TestAbility, TestCharged, TestToggle } from "./fixtures";

function makeCaster(): AbilityCaster {
	const caster = new AbilityCaster({ resources: { mana: { max: 100 } }, bufferWindow: 0 });
	caster.add("bolt", new TestAbility({ windup: 0.1, active: 0.1, recovery: 0.1, cooldown: 2, costs: { mana: 30 } }));
	caster.add("nova", new TestAbility({ costs: { mana: 50 } }));
	caster.add("fireball", new TestCharged({ maxChargeTime: 2, active: 0.2 }));
	caster.add("sprint", new TestToggle());
	return caster;
}

function bolt(caster: AbilityCaster): TestAbility {
	return caster.getAbility("bolt") as TestAbility;
}

function mana(caster: AbilityCaster): number {
	return caster.getResource("mana")!.get();
}

export = () => {
	let network!: LoopbackNetwork<string>;
	let clientCaster!: AbilityCaster;
	let serverCaster!: AbilityCaster;
	let client!: AbilityClient;
	let server!: AbilityServer<string>;

	beforeEach(() => {
		network = new LoopbackNetwork<string>();
		clientCaster = makeCaster();
		serverCaster = makeCaster();
		client = new AbilityClient(clientCaster, network.connect("player"));
		server = new AbilityServer(network.server);
		server.register("player", serverCaster);
	});

	describe("client prediction", () => {
		it("runs the ability before the server has answered", () => {
			expect(client.press("bolt")).to.equal("Activated");

			expect(bolt(clientCaster).getPhase()).to.equal("Windup");
			expect(mana(clientCaster)).to.equal(70);
			expect(client.getPendingCount()).to.equal(1);
			expect(network.getQueuedToServer()).to.equal(1);
			expect(bolt(serverCaster).isRunning()).to.equal(false);
		});

		it("keeps the prediction when the server accepts it", () => {
			client.press("bolt");
			network.flush();

			expect(bolt(serverCaster).getPhase()).to.equal("Windup");
			expect(mana(serverCaster)).to.equal(70);
			expect(client.getPendingCount()).to.equal(0);
			expect(bolt(clientCaster).isRunning()).to.equal(true);
			expect(mana(clientCaster)).to.equal(70);
		});

		it("rolls the ability back when the server rejects it", () => {
			serverCaster.getResource("mana")!.set(10);

			client.press("bolt");
			network.flush();

			expect(bolt(clientCaster).log.join(",")).to.equal("windup,end:Rejected");
			expect(bolt(clientCaster).getCooldown()).to.equal(0);
			expect(bolt(serverCaster).isRunning()).to.equal(false);
			expect(mana(clientCaster)).to.equal(10);
		});

		it("undoes only the rejected prediction while others are still in flight", () => {
			serverCaster.getResource("mana")!.set(20);
			const sprint = clientCaster.getAbility("sprint") as TestToggle;

			client.press("bolt");
			client.press("sprint");
			network.deliverToServer();

			network.deliverToClients(1);
			expect(bolt(clientCaster).log.join(",")).to.equal("windup,end:Rejected");
			expect(mana(clientCaster)).to.equal(100);
			expect(sprint.isOn()).to.equal(true);
			expect(client.getPendingCount()).to.equal(1);

			network.deliverToClients();
			expect(mana(clientCaster)).to.equal(20);
			expect(sprint.isOn()).to.equal(true);
		});

		it("reconciles drift once nothing is in flight", () => {
			serverCaster.getResource("mana")!.set(50);

			client.press("sprint");
			network.flush();

			expect(mana(clientCaster)).to.equal(50);
		});

		it("leaves values that are within tolerance alone", () => {
			serverCaster.getResource("mana")!.set(99);

			client.press("sprint");
			network.flush();

			expect(mana(clientCaster)).to.equal(100);
		});
	});

	describe("server validation", () => {
		it("accepts presses that land just inside the grace window", () => {
			client.press("bolt");
			network.flush();
			clientCaster.update(2);
			serverCaster.update(1.95);

			expect(client.press("bolt")).to.equal("Activated");
			network.flush();

			expect(bolt(serverCaster).isRunning()).to.equal(true);
			expect(bolt(clientCaster).isRunning()).to.equal(true);
		});

		it("rejects the same press when the server allows no grace", () => {
			server.destroy();
			server = new AbilityServer(network.server, { grace: 0 });
			server.register("player", serverCaster);

			client.press("bolt");
			network.flush();
			clientCaster.update(2);
			serverCaster.update(1.95);

			client.press("bolt");
			network.flush();

			expect(bolt(serverCaster).isRunning()).to.equal(false);
			expect(bolt(clientCaster).log.join(",")).to.equal(
				"windup,active,recovery,end:Completed,windup,end:Rejected",
			);
		});

		it("finishes the server's current ability when the next press lands inside the grace window", () => {
			client.press("bolt");
			network.flush();
			clientCaster.update(0.3);
			serverCaster.update(0.25);

			expect(client.press("nova")).to.equal("Activated");
			network.flush();

			expect(bolt(serverCaster).log.join(",")).to.equal("windup,active,recovery,end:Completed");
			expect(mana(serverCaster)).to.equal(20);
			expect(client.getPendingCount()).to.equal(0);
		});

		it("works out its own charge level from relayed releases", () => {
			client.press("fireball");
			network.flush();
			clientCaster.update(1);
			serverCaster.update(0.5);

			expect(client.release("fireball")).to.equal(true);
			network.flush();

			expect((clientCaster.getAbility("fireball") as TestCharged).firedLevel).to.be.near(0.5, 1e-9);
			expect((serverCaster.getAbility("fireball") as TestCharged).firedLevel).to.be.near(0.25, 1e-9);
		});

		it("turns toggles off when the client does", () => {
			const sprint = serverCaster.getAbility("sprint") as TestToggle;

			client.press("sprint");
			network.flush();
			expect(sprint.isOn()).to.equal(true);

			expect(client.press("sprint")).to.equal("Deactivated");
			network.flush();
			expect(sprint.isOn()).to.equal(false);
		});

		it("interrupts the client when it interrupts the server", () => {
			client.press("bolt");
			network.flush();

			expect(server.interrupt("player")).to.equal(true);
			network.flush();

			expect(bolt(clientCaster).log.join(",")).to.equal("windup,end:Interrupted");
			expect(bolt(serverCaster).isRunning()).to.equal(false);
		});

		it("ignores peers that were never registered", () => {
			const stranger = new AbilityClient(makeCaster(), network.connect("stranger"));

			stranger.press("bolt");
			network.flush();

			expect(stranger.getPendingCount()).to.equal(1);
			expect(bolt(serverCaster).isRunning()).to.equal(false);
		});
	});
};
