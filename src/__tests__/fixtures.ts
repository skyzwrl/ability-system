import {
	Ability,
	AbilityConfig,
	ChanneledAbility,
	ChanneledConfig,
	ChargedAbility,
	ChargedConfig,
	EndReason,
	ToggleAbility,
	ToggleConfig,
} from "..";

export class TestAbility extends Ability {
	public readonly log = new Array<string>();
	public allowed = true;

	public constructor(config: AbilityConfig = {}) {
		super(config);
	}

	protected canActivate(): boolean {
		return this.allowed;
	}

	protected onWindup(): void {
		this.log.push("windup");
	}

	protected onActive(): void {
		this.log.push("active");
	}

	protected onRecovery(): void {
		this.log.push("recovery");
	}

	protected onEnd(reason: EndReason): void {
		this.log.push(`end:${reason}`);
	}
}

export class TestCharged extends ChargedAbility {
	public firedLevel?: number;
	public endReason?: EndReason;

	public constructor(config: ChargedConfig) {
		super(config);
	}

	protected onActive(): void {
		this.firedLevel = this.getChargeLevel();
	}

	protected onEnd(reason: EndReason): void {
		this.endReason = reason;
	}
}

export class TestChanneled extends ChanneledAbility {
	public readonly tickLog = new Array<number>();
	public endReason?: EndReason;

	public constructor(config: ChanneledConfig) {
		super(config);
	}

	protected onTick(tick: number): void {
		this.tickLog.push(tick);
	}

	protected onEnd(reason: EndReason): void {
		this.endReason = reason;
	}
}

export class TestToggle extends ToggleAbility {
	public endReason?: EndReason;

	public constructor(config: ToggleConfig = {}) {
		super(config);
	}

	protected onEnd(reason: EndReason): void {
		this.endReason = reason;
	}
}
