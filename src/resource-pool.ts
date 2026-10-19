import { Listeners } from "./listeners";

export interface ResourceConfig {
	readonly max: number;
	readonly regen?: number;
	readonly regenDelay?: number;
	readonly start?: number;
}

export class ResourcePool {
	public readonly changed = new Listeners<[value: number, max: number]>();

	private value: number;
	private max: number;
	private readonly regen: number;
	private readonly regenDelay: number;
	private delayLeft = 0;

	public constructor(
		public readonly name: string,
		config: ResourceConfig,
	) {
		if (config.max <= 0) {
			error(`resource "${name}" needs a max above 0`, 2);
		}
		this.max = config.max;
		this.regen = config.regen ?? 0;
		this.regenDelay = config.regenDelay ?? 0;
		this.value = math.clamp(config.start ?? config.max, 0, config.max);
	}

	public get(): number {
		return this.value;
	}

	public getMax(): number {
		return this.max;
	}

	public canAfford(amount: number): boolean {
		return this.value >= amount;
	}

	public spend(amount: number): boolean {
		if (amount > this.value) {
			return false;
		}
		if (amount > 0) {
			this.delayLeft = this.regenDelay;
			this.set(this.value - amount);
		}
		return true;
	}

	public refund(amount: number): void {
		this.set(this.value + amount);
	}

	public set(value: number): void {
		const clamped = math.clamp(value, 0, this.max);
		if (clamped !== this.value) {
			this.value = clamped;
			this.changed.fire(clamped, this.max);
		}
	}

	public setMax(max: number): void {
		if (max <= 0) {
			error(`resource "${this.name}" needs a max above 0`, 2);
		}
		this.max = max;
		if (this.value > max) {
			this.value = max;
		}
		this.changed.fire(this.value, max);
	}

	public update(deltaTime: number): void {
		if (this.regen <= 0 || this.value >= this.max) {
			return;
		}
		let regenTime = deltaTime;
		if (this.delayLeft > 0) {
			if (regenTime <= this.delayLeft) {
				this.delayLeft -= regenTime;
				return;
			}
			regenTime -= this.delayLeft;
			this.delayLeft = 0;
		}
		this.set(this.value + this.regen * regenTime);
	}
}
