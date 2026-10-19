/**
 * Tipos estrictos para el motor de concurrencia asíncrono (Worker Pool).
 * Tipado genérico avanzado sin 'any'.
 */

export interface AsyncPoolProgress<T, R> {
  completed: number;
  total: number;
  active: number;
  item: T;
  index: number;
  result?: R;
  error?: Error;
}

export interface AsyncPoolOptions<T, R> {
  onProgress?: (progress: AsyncPoolProgress<T, R>) => void;
}

export interface WaitForConditionOptions {
  timeout?: number;
  interval?: number;
}
