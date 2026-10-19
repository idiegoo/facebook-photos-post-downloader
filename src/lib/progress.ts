import type { ProgressEventPayload, ProgressListener } from '../types/progress';

/**
 * Gestor en memoria de sesiones SSE para Next.js App Router.
 * Tipado estricto sin 'any'.
 */
class ProgressSessionManager {
  private sessions = new Map<string, ProgressListener>();

  public register(sessionId: string, listener: ProgressListener): () => void {
    this.sessions.set(sessionId, listener);
    return () => {
      this.sessions.delete(sessionId);
    };
  }

  public notify(sessionId: string | null | undefined, data: ProgressEventPayload): void {
    if (!sessionId) return;
    const listener = this.sessions.get(sessionId);
    if (listener) {
      try {
        listener(data);
      } catch (err: unknown) {
        console.error(`Error enviando evento a la sesión ${sessionId}:`, err);
      }
    }
  }

  public has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  public remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

// Instancia singleton compartida en el runtime de Node.js
export const progressManager = new ProgressSessionManager();
