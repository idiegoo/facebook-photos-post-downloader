import type { AsyncPoolOptions, WaitForConditionOptions } from '../types/concurrency';

/**
 * Ejecuta una lista de tareas asíncronas con concurrencia controlada (Worker Pool).
 * Tipado estricto genérico sin 'any'.
 * 
 * @template T - Tipo de los elementos de entrada
 * @template R - Tipo del resultado que produce cada tarea
 * @param items - Colección de elementos a procesar
 * @param concurrency - Número máximo de tareas simultáneas (hilos virtuales)
 * @param iteratorFn - Función asíncrona a ejecutar por elemento
 * @param options - Callbacks de progreso opcionales
 * @returns Array con los resultados correspondientes a cada elemento o null si falló
 */
export async function asyncPool<T, R>(
  items: readonly T[],
  concurrency = 6,
  iteratorFn: (item: T, index: number, items: readonly T[]) => Promise<R>,
  options: AsyncPoolOptions<T, R> = {}
): Promise<Array<R | null>> {
  const { onProgress } = options;
  const total = items.length;
  if (total === 0) return [];

  const effectiveConcurrency = Math.max(1, Math.min(concurrency, total));
  const results: Array<Promise<R>> = new Array(total);
  const executing = new Set<Promise<R>>();
  let completed = 0;

  for (let index = 0; index < total; index++) {
    const item = items[index] as T;

    const taskPromise: Promise<R> = (async (): Promise<R> => {
      try {
        const res = await iteratorFn(item, index, items);
        completed++;
        if (onProgress) {
          onProgress({
            completed,
            total,
            active: executing.size,
            result: res,
            item,
            index
          });
        }
        return res;
      } catch (err: unknown) {
        completed++;
        const error = err instanceof Error ? err : new Error(String(err));
        if (onProgress) {
          onProgress({
            completed,
            total,
            active: executing.size,
            error,
            item,
            index
          });
        }
        throw error;
      }
    })();

    results[index] = taskPromise;
    executing.add(taskPromise);

    const clean = (): boolean => executing.delete(taskPromise);
    taskPromise.then(clean, clean);

    if (executing.size >= effectiveConcurrency) {
      await Promise.race(executing);
    }
  }

  const settled = await Promise.allSettled(results);
  return settled.map((s) => (s.status === 'fulfilled' ? s.value : null));
}

/**
 * Espera reactiva con sondeo rápido o cambio de condición (elimina esperas estáticas lentas).
 * 
 * @param conditionFn - Función que evalúa si la condición se cumplió
 * @param opts - Opciones de timeout e intervalo
 * @returns Promise<boolean>
 */
export async function waitForCondition(
  conditionFn: () => boolean | Promise<boolean>,
  opts: WaitForConditionOptions = {}
): Promise<boolean> {
  const { timeout = 3000, interval = 40 } = opts;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await conditionFn();
      if (result) return true;
    } catch {
      // Ignorar excepciones transitorias del DOM
    }
    await new Promise<void>((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
