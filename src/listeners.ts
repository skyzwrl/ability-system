export type Listener<T extends unknown[]> = (...args: T) => void;

export class Listeners<T extends unknown[]> {
	// copy on write so listeners can connect or disconnect mid fire without the loop skipping anyone
	private callbacks: ReadonlyArray<Listener<T>> = [];

	public connect(callback: Listener<T>): () => void {
		this.callbacks = [...this.callbacks, callback];
		return () => {
			this.callbacks = this.callbacks.filter((other) => other !== callback);
		};
	}

	public fire(...args: T): void {
		for (const callback of this.callbacks) {
			callback(...args);
		}
	}
}
