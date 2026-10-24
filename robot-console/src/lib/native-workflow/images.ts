import { ModelUnavailableError } from "./model";
import { qwenApiKey, qwenMultimodalEndpoint } from "@/lib/qwen-config";
import type { PoetryCoverAspectRatio } from "@/lib/agent-result";
import { isGeneratedImageUrl } from "@/lib/generated-image-url";

export function imageSize(ratio:PoetryCoverAspectRatio) {
  return {"3:4":"1140*1472","1:1":"1328*1328","16:9":"1664*928"}[ratio];
}

export async function generateTeachingImage({prompt,ratio,signal,fetchImpl=fetch}:{prompt:string;ratio:PoetryCoverAspectRatio;signal?:AbortSignal;fetchImpl?:typeof fetch}) {
  const key=qwenApiKey();
  if(!key) throw new ModelUnavailableError("图片生成服务尚未配置，请补充通义图像 API 配置后重试。");
  const model=process.env.QWEN_IMAGE_MODEL?.trim()||"qwen-image";
  const url=qwenMultimodalEndpoint();
  const response=await fetchImpl(url,{
    method:"POST",signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(110_000)]),
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`}, cache:"no-store", redirect:"error",
    body:JSON.stringify({model,input:{messages:[{role:"user",content:[{text:prompt}]}]},parameters:{size:imageSize(ratio),n:1,result_format:"message",prompt_extend:true,watermark:false,negative_prompt:"文字，汉字，字母，数字，伪文字，水印，商标，真实儿童肖像，危险实验操作"}}),
  });
  if(!response.ok) {await response.body?.cancel();throw new ModelUnavailableError(`图片服务返回 ${response.status}，请检查模型配置或重试。`);}
  const payload=await response.json();
  if(payload.code || (payload.status_code && payload.status_code !== 200)) throw new ModelUnavailableError("图片服务处理失败，请检查模型配置或重试。");
  const imageUrl=payload.output?.choices?.[0]?.message?.content?.find((v:{image?:string})=>typeof v.image==="string")?.image;
  if(typeof imageUrl!=="string") throw new Error("图片服务没有返回实际图片，请重试。");
  const parsed=new URL(imageUrl);
  // This pipeline only consumes Tongyi outputs; reject unexpected destinations.
  if(!isGeneratedImageUrl(parsed)) throw new Error("图片服务返回了无法验证的图片地址。");
  return {url:imageUrl,model};
}
