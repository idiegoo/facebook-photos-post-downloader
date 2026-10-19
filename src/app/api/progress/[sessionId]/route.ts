import { progressManager } from '@/lib/progress';
import type { ProgressEventPayload } from '@/types/progress';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> | { sessionId: string } }
): Promise<Response> {
  const params = await Promise.resolve(context.params);
  const { sessionId } = params;

  if (!sessionId) {
    return new Response('Falta sessionId', { status: 400 });
  }

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (data: ProgressEventPayload): Promise<void> => {
    try {
      const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
      await writer.write(chunk);
    } catch {
      // Ignorar si el cliente cerró la conexión
    }
  };

  const unregister = progressManager.register(sessionId, (payload) => {
    void send(payload);
  });

  void send({
    stage: 'connected',
    message: 'Conectado al servidor Next.js con motor de concurrencia activo...'
  });

  request.signal.addEventListener('abort', () => {
    unregister();
    void writer.close().catch(() => {});
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
