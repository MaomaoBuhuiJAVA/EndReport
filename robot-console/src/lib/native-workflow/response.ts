import type { NativeChatBody } from "./run";
import { runTeachingWorkflow } from "./run";

export function nativeTeachingResponse(request:Request,body:NativeChatBody):Response|Promise<Response> {
  const streaming=request.headers.get("accept")?.includes("text/event-stream");
  if(!streaming) return runTeachingWorkflow(body,{signal:request.signal,requestUrl:request.url}).then(result=>Response.json(result,{headers:{"Cache-Control":"no-store"}}));
  const encoder=new TextEncoder(),abort=new AbortController();
  const signal=AbortSignal.any([request.signal,abort.signal]);
  let ended=false;
  const stream=new ReadableStream<Uint8Array>({
    async start(controller) {
      const send=(value:unknown)=>{if(!ended&&!signal.aborted)controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));};
      const heartbeat=setInterval(()=>{if(!ended&&!signal.aborted)controller.enqueue(encoder.encode(": heartbeat\n\n"));},8000);
      try {
        const result=await runTeachingWorkflow(body,{signal,requestUrl:request.url,onEvent:send});
        send({type:"done",...result});
      } catch {
        if(!signal.aborted)send({type:"error",message:"请求未能完成，请重试。"});
      } finally { clearInterval(heartbeat);if(!ended){ended=true;controller.close();} }
    },
    cancel(){ended=true;abort.abort();},
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
}
