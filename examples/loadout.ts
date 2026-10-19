import { AbilityCaster } from "@skyzwrl/ability-system";
import { Dash } from "./abilities/dash";
import { Fireball } from "./abilities/fireball";
import { Mend } from "./abilities/mend";
import { Slash } from "./abilities/slash";
import { Sprint } from "./abilities/sprint";

// shared by client and server so both sides build the exact same rules
export function createCaster(character: Model): AbilityCaster {
	const caster = new AbilityCaster({
		resources: {
			stamina: { max: 100, regen: 25, regenDelay: 0.75 },
			mana: { max: 100, regen: 6 },
		},
		globalCooldown: 0.1,
		bufferWindow: 0.2,
	});

	caster.add("slash", new Slash(character));
	caster.add("dash", new Dash(character));
	caster.add("fireball", new Fireball(character));
	caster.add("mend", new Mend(character));
	caster.add("sprint", new Sprint(character));
	return caster;
}
