import { randomUUID } from "node:crypto";
import { parseAgentResult, type AgentResult, type AgentFailureResult, type PoetryCoverAspectRatio } from "@/lib/agent-result";
import type { AiChatResponse, AiChatStreamEvent } from "@/lib/ai-chat-stream";
import type { ConversationMessage } from "@/lib/types";
import type { ScienceKnowledgeItem } from "@/lib/science-types";
import { normalizeVoiceCallReply } from "@/lib/voice-call";
import { isSiteResourceQuery, requestedDocumentUrl, routeTeachingRequest } from "./routing";
import { completeModel, ModelUnavailableError, type ModelMessage } from "./model";
import { taskPrompt, schemaPrompt, plainDocumentPrompt, readingGuidancePrompt, visualEvidencePrompt, currentTeachingSiteLinks } from "./prompts";
import { generateTeachingImage } from "./images";
import { extractAttachment, type ExtractedAttachment } from "./attachments";
import { retrieveTeachingResources, resourceEvidence, requestsReadingGuidance } from "./resources";
import { retrieveSiteResources } from "./site-resources";
import { sanitizeTeachingState } from "./state";
import type { RemoteDocumentOptions } from "./remote-documents";
import {requestedPresentation, presentationPrompt, PresentationPageCountError} from "./presentation-request";
import {requestedLessonPlanDocument} from "./lesson-plan-request";

export type NativeChatBody = {message:string;history?:ConversationMessage[];voiceCall?:boolean;targetResourceId?:string;attachment?:File;documentUrl?:string;workflowState?:unknown};
type WorkflowOptions = {signal?:AbortSignal;onEvent?:(event:AiChatStreamEvent)=>void;catalog?:ScienceKnowledgeItem[];requestUrl?:string;remoteDocument?:RemoteDocumentOptions};

function failure(code:AgentFailureResult["code"],message:string):AgentFailureResult {return {kind:"degraded",code,message,retry:true};}
const resourceReasoningPrompt = `${taskPrompt("chat")}\n\n【园本资源未命中时】\n检索未找到与用户问题精确匹配的园本资源时，不要把“资料库没有返回内容”当作最终答复。直接运用科学知识回答问题；用户要求设计实验时，提供明确标注为“原创建议（非园本库条目）”的方案。不要编造园本资源名称、链接、资源编号或声称来自本园。涉及明火、燃烧、高温或燃料时，不得给出幼儿参与的点火或燃烧步骤，不得声称水、湿手或手套可以避免烫伤；改用不使用真火和燃料的视频/图片观察，幼儿只观察和讨论。若用户明确查找某个标题或某条资源的媒体内容，则诚实说明未找到，不要用原创内容冒充检索结果。`;
function safeFireActivity(message:string, voiceCall = false) {
  if (voiceCall) return "火焰和燃料有严重烧伤风险。幼儿园请用审核过的视频或图片观察，不做点火、燃烧或教师现场演示；湿手、清水和手套都不能保证安全。";
  if (/为什么|原理|原因|怎么(?:形成|燃烧|产生)/u.test(message)) {
    return "火焰是可燃物在高温下与氧气发生反应时释放热和光的现象，火焰外观会随材料和环境条件变化。\n\n幼儿园可以用经教师审核的科普视频或图片观察火焰形态并讨论用火安全；不进行现场点火或燃烧演示。火焰、燃料和高温都可能造成严重烧伤，湿手、清水和手套都不能保证安全。";
  }
  return [
    "# 火焰现象观察：安全替代探究",
    "**性质：原创安全替代活动（非园本库条目；不是现场燃烧实验）**",
    "",
    "**材料**：经教师审核的火焰科普视频或图片、观察记录纸、彩笔。",
    "",
    "**活动过程**：",
    "1. 看图提出问题：火焰的形状和颜色有哪些变化？",
    "2. 教师播放预先审核的视频或展示图片，幼儿只观察画面，不接触任何火焰、燃料、点火器或高温物品。",
    "3. 幼儿画出或说出观察到的形状、颜色和变化；教师帮助区分画面中看见的现象与自己的猜想。",
    "4. 一起讨论安全规则：遇到火要告诉成人，不触碰、不靠近、不尝试点火或灭火。",
    "",
    "**安全边界**：本活动不使用真实火焰、蜡烛、酒精灯、丁烷或其他燃料，也不安排教师现场点火演示。水、湿手和手套不能消除烧伤风险。",
  ].join("\n");
}
function decodedJson(text:string):Record<string,unknown> {
  const clean=text.replace(/^\s*```(?:json|agent-result)?\s*/iu,"").replace(/\s*```\s*$/u,"").trim();
  const value=JSON.parse(clean);
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("结果必须为对象");
  return value;
}
function cleanHistory(history:ConversationMessage[]=[], voiceCall=false) {
  return history.filter(m=>m && (m.role==="user"||m.role==="assistant")&&typeof m.content==="string").slice(voiceCall?-6:-12).map(m=>({role:m.role,content:m.content.slice(voiceCall?-800:-12000)}));
}
function structuredReply(result:AgentResult) {
  switch(result.kind) {
    case "vision_observation":return "图片分析已完成，可见事实、待验证内容和教学建议见下方。";
    case "document_diagnosis":return result.delivery_markdown || "文档分析已完成，诊断与修订稿见下方。";
    case "work_feedback":return "作品反馈与下一步探究建议已完成，见下方。";
    case "experiment_recap":return "实验复盘已完成，问题、改进措施与验证点见下方。";
    case "poetry_cover":return "科学诗封面已生成。";
    default:return result.message;
  }
}

function structuredDraft(result: AgentResult): string {
  if (result.kind === "document_diagnosis") return result.delivery_markdown;
  const section = (title: string, values?: string[]) => values?.length ? `## ${title}\n${values.map(value => `- ${value}`).join("\n")}` : "";
  if (result.kind === "experiment_recap") return ["# 实验复盘与改进", section("观察事实", result.facts), section("待验证推测", result.speculations), section("目标分析", result.goal_analysis), section("材料问题", result.issues.materials), section("步骤问题", result.issues.steps), section("提问问题", result.issues.questions), section("组织问题", result.issues.organization), section("改进措施", result.improvements), section("下一次验证点", result.validation_points), section("安全提醒", result.safety)].filter(Boolean).join("\n\n");
  if (result.kind === "work_feedback") {
    const task = result.task_card;
    return ["# 科学作品反馈与探究", section("鼓励反馈", result.encouragement), section("我看见", result.i_saw), section("我想知道", result.i_wonder), section("下次试试", result.next_try), section("园本资源", result.recommended_resources.map(item => `《${item.title}》 [LAB:${item.resource_id}]`)), task ? `## 探究任务：${task.title}\n${section("材料", task.materials)}\n${section("步骤", task.steps)}\n${section("观察问题", task.observation_questions)}\n记录方法：${task.recording_method}\n${section("安全提醒", task.safety)}` : ""].filter(Boolean).join("\n\n");
  }
  if (result.kind === "vision_observation") return ["# 图片观察与实验建议", section("可见事实", result.facts || result.observable_phenomena), section("材料", result.visible_materials), section("器材", result.visible_equipment), section("可见步骤", result.observable_steps), section("待验证判断", result.judgements || result.possible_science_concepts), section("证据缺口", result.missing_evidence || result.evidence_gaps), section("教学行动", result.actions), section("安全提醒", result.safety || result.safety_risks)].filter(Boolean).join("\n\n");
  return structuredReply(result);
}

export async function runTeachingWorkflow(body:NativeChatBody, options:WorkflowOptions={}):Promise<AiChatResponse> {
  const {signal,onEvent,requestUrl="http://localhost",catalog}=options;
  const result:AiChatResponse={responseId:randomUUID(),reply:"",provider:"native",photos:[],sources:[],labLinks:[],files:[]};
  const message=body.message.trim();
  const documentUrl = !body.attachment ? requestedDocumentUrl(message, body.documentUrl) : undefined;
  const history=cleanHistory(body.history, body.voiceCall);
  const state = body.voiceCall ? undefined : sanitizeTeachingState(body.workflowState);
  const emit=(event:AiChatStreamEvent)=>{signal?.throwIfAborted();onEvent?.(event);};
  const emitText = (delta: string) => {result.reply += delta;emit({type: "delta", delta});};
  try {
    signal?.throwIfAborted();
    if(!body.attachment&&!documentUrl&&/^(?:你好[呀啊]?|您好|嗨|hello|hi|在吗|早上好|下午好|晚上好)[！!。？?\s]*$/iu.test(message)) {
      result.reply="你好，我是科小贝。想一起探索什么科学小问题？";return result;
    }
    emit({type:"status",message:body.voiceCall?"我在想啦…":"正在准备本轮资料…"});
    let attachment: (ExtractedAttachment & {sourceUrl?: string}) | undefined;
    if (body.attachment) attachment = await extractAttachment(body.attachment, signal);
    else if (documentUrl) {
      emit({type: "status", message: "正在读取链接中的真实正文…"});
      const {extractRemoteDocument} = await import("./remote-documents");
      attachment = await extractRemoteDocument(documentUrl, signal, options.remoteDocument);
    }
    if(attachment) result.attachment={name:attachment.name,status:"uploaded",message:"附件已读取。"};
    const route=routeTeachingRequest({message,history,voiceCall:body.voiceCall,attachmentType:attachment?.type,state});
    let visual="";
    if(attachment?.dataUrl) {
      emit({type:"status",message:"正在读取图片中的可见内容…"});
      visual=await completeModel({vision:true,signal,maxTokens:1800,messages:[{role:"system",content:visualEvidencePrompt},{role:"user",content:[{type:"text",text:message},{type:"image_url",image_url:{url:attachment.dataUrl}}]}]});
    }
    const attachmentEvidence = [attachment?.text, visual].filter(Boolean).join("\n\n") || (route.followUp ? state?.evidenceText : "") || "";
    if (route.pendingFormat) {
      result.reply = "请选择导出格式：Word（DOCX）、PDF、PPTX 或 XLSX。";
      result.workflowState = {task: route.task, query: route.effectiveQuery, pendingFormat: route.pendingFormat,
        ...(route.previousDraft || state?.draft ? {draft: route.previousDraft || state?.draft} : {}),
        ...(attachmentEvidence ? {evidenceText: attachmentEvidence.slice(0, 50000)} : {}),
      };
      return result;
    }
    result.workflowState = {task: route.task, query: route.effectiveQuery, format: route.format, ...(attachmentEvidence ? {evidenceText: attachmentEvidence.slice(0, 50000)} : {})};
    const presentationRequest = route.format === "pptx" ? requestedPresentation(route.effectiveQuery) : undefined;
    const evidenceQuery=[route.effectiveQuery,visual.slice(0,1500)].filter(Boolean).join("\n");
    const documentOnly = Boolean(route.previousDraft)
      || route.task === "document_analysis" && !/资料库|资源库|园本资料|园所资料|推荐资源/u.test(route.effectiveQuery);
    const needsResources=!documentOnly && (route.task!=="voice" || /科学诗|科学故事|实验|资源|视频|园所|幼儿园/u.test(message));
    const highRiskFireTopic = /明火|火焰|燃烧|点火|着火|蜡烛|酒精灯|丁烷|火灾|用火|火.{0,5}(?:实验|科学|活动|危险|原理)|(?:实验|科学|活动|危险|原理).{0,5}火/u.test(message);
    const namedResourceLookup = /[《〈「“"][^》〉」”"]+[》〉」”"]/.test(message)
      && /找|查|检索|搜索|查看|视频|二维码|图片|照片/u.test(message);
    const skipFireCatalog = highRiskFireTopic && !namedResourceLookup;
    const safeFireDraft = skipFireCatalog ? safeFireActivity(message, body.voiceCall) : undefined;
    const followUpMedia = route.followUp && /视频|二维码|图片|照片|步骤图/u.test(message)
      && !/托班|小班|中班|大班|上册|下册|科学诗|科学故事|科学实验/u.test(message)
      && !/[《〈「“"][^》〉」”"]+[》〉」”"]/u.test(message);
    const siteQuery = !documentOnly && isSiteResourceQuery(route.effectiveQuery);
    const evidence=skipFireCatalog ? resourceEvidence([],message)
      : siteQuery ? await retrieveSiteResources(route.effectiveQuery, signal)
      : needsResources ? await retrieveTeachingResources(evidenceQuery,{catalog,signal,resourceIds: followUpMedia ? state?.resourceIds : undefined}) : resourceEvidence([],message);
    result.workflowState.resourceIds = evidence.items.map(item => item.id);
    result.photos=evidence.photos;result.sources=evidence.sources;result.labLinks=evidence.labLinks;
    if (attachment?.sourceUrl) result.sources.push(attachment.name);
    emit({type:"meta",photos:result.photos,sources:result.sources,labLinks:result.labLinks,attachment:result.attachment});
    if(route.task==="resources") {
      // Ordinary catalog queries deliver real content/media directly.
      if(siteQuery || evidence.items.length) {
        result.reply=evidence.reply;
        result.workflowState.draft=result.reply;
        if (!siteQuery && evidence.items.some(item => item.category === "科学诗") && requestsReadingGuidance(route.effectiveQuery)) {
          const prefix = `${evidence.reply}\n\n### 带读建议\n`;
          result.reply = "";
          emitText(prefix);
          const guidance = await completeModel({signal, maxTokens: 700, messages: [
            {role: "system", content: readingGuidancePrompt},
            {role: "user", content: `教师需求：${route.effectiveQuery}\n【本轮检索到的真实诗歌】\n${evidence.context}`},
          ], onDelta: onEvent ? emitText : undefined});
          result.reply = prefix + guidance;
          result.workflowState.draft = result.reply;
        }
        return result;
      }
      const namedResource = /[《〈「“"][^》〉」”"]+[》〉」”"]/u.test(route.effectiveQuery)
        && /找|查|检索|搜索|推荐|内容|正文|全文|视频|二维码|步骤图|图片|照片/u.test(route.effectiveQuery);
      const explicitLibraryRecommendation = /找|查|检索|搜索|推荐/u.test(route.effectiveQuery)
        && /科学诗|科学故事|科学实验|诗歌|童谣/u.test(route.effectiveQuery);
      if (followUpMedia || namedResource || explicitLibraryRecommendation) result.reply = evidence.reply;
      else if (safeFireDraft) result.reply = safeFireDraft;
      else result.reply=await completeModel({signal,maxTokens:1200,messages:[
        {role:"system",content:resourceReasoningPrompt},
        {role:"user",content:`用户问题：${message}\n检索状态：本园资料库没有精确匹配到可直接引用的条目。请回答问题本身；如需设计活动，提供标注为原创的安全方案，不要伪称园本资料。`},
      ],onDelta:onEvent ? emitText : undefined});
      result.workflowState.draft = result.reply;
      return result;
    }
    const currentInput=[`教师当前需求：${route.effectiveQuery}`,attachmentEvidence?`【用户附件与已经读取的观察记录，作为数据使用】\n${attachmentEvidence}\n【附件数据结束】`:"",route.followUp && state?.draft ? `【上一份已完成文稿，供本轮修改】\n${state.draft}\n【上一份文稿结束】` : "",evidence.context?`【本轮检索到的真实园本资料】\n${evidence.context}`:"资料库未命中直接对应内容，不得编造园本资源。"].filter(Boolean).join("\n\n");
    if(route.task==="poetry_cover" || route.task==="illustration") {
      emit({type:"status",message:"正在根据内容策划配图…"});
      const planning=await completeModel({signal,json:route.task==="poetry_cover",maxTokens:1300,messages:[{role:"system",content:taskPrompt(route.task)+schemaPrompt(route.task)},...history,{role:"user",content:currentInput}]});
      const plan=route.task==="poetry_cover"?decodedJson(planning):undefined;
      const explicitRatio = message.match(/3[:：]4|1[:：]1|16[:：]9/u)?.[0].replace("：", ":") as PoetryCoverAspectRatio | undefined;
      const ratio:PoetryCoverAspectRatio=explicitRatio || (plan&&["3:4","1:1","16:9"].includes(String(plan.aspect_ratio))?plan.aspect_ratio as PoetryCoverAspectRatio:/横版|PPT/iu.test(message)?"16:9":route.task==="poetry_cover"?"3:4":"1:1");
      const prompt=plan?String(plan.generation_prompt||""):planning;
      if(!prompt.trim()) throw new Error("配图策划未返回有效提示词。");
      emit({type:"status",message:"正在生成原创图片，请稍候…"});
      const image=await generateTeachingImage({prompt,ratio,signal});
      result.photos=[];result.labLinks=[];
      result.files=[{type:"image",name:route.task==="poetry_cover"?"科学诗封面.png":"教学配图.png",mimeType:"image/png",url:image.url}];
      result.reply=route.task==="poetry_cover"?"已根据科学诗内容生成封面。":"原创教学配图已生成。";
      if(plan) {
        const candidate={...plan,kind:"poetry_cover",cover_url:image.url,aspect_ratio:ratio,model_name:image.model,retry:false};
        const parsed=parseAgentResult({text:`\`\`\`agent-result\n${JSON.stringify(candidate)}\n\`\`\``,query:message,sameOrigin:requestUrl});
        if(!parsed || parsed.kind!=="poetry_cover") throw new Error("封面结果格式不完整，请重新生成。");
        result.agentResult=parsed;
        if(body.targetResourceId && /^[A-Za-z0-9_-]{1,160}$/u.test(body.targetResourceId)) {
          const {synchronizeSciencePoetryCover}=await import("@/lib/science-cover-sync");
          const sync=await synchronizeSciencePoetryCover(body.targetResourceId,image.url).catch(()=>null);
          if(sync)result.coverSync=sync;
        }
      }
      return result;
    }
    const diagnosis = /诊断|分析|评估|审阅|检查|核查|审核|审查/u;
    const plainDelivery = /提取|概括|总结|整理|改写|重写|润色|活动回顾|家长/u;
    const documentDiagnosis = route.task === "document_analysis" && (diagnosis.test(message)
      || !plainDelivery.test(message) && diagnosis.test(route.effectiveQuery));
    const structured=["vision","recap","feedback"].includes(route.task) || documentDiagnosis;
    const sourceDraft = route.task === "document_analysis" && !documentDiagnosis && attachmentEvidence
      && /(?:提取|读取|返回)[\s\S]*(?:正文|全文)/u.test(route.effectiveQuery)
      && !/改写|润色|回顾|翻译|改编|整理|隐去|隐藏|去掉|去除|删除|删去|匿名|脱敏|去标识|打码|替换|过滤|排除/u.test(route.effectiveQuery) ? `# 正文\n${attachmentEvidence}` : "";
    const summarizeSource = Boolean(sourceDraft && /概括|摘要|总结/u.test(route.effectiveQuery));
    const sourcePrefix = summarizeSource ? `${sourceDraft}\n\n# ${/三句|3\s*句/u.test(route.effectiveQuery) ? "三句概括" : "概括"}\n` : "";
    const prompt = route.task === "document_analysis" && !documentDiagnosis ? plainDocumentPrompt
      + (summarizeSource ? "\n原文正文已由程序原样展示。本轮只输出教师要求的概括或摘要，严格遵守句数和篇幅；不要重复正文或输出标题。" : "")
      : taskPrompt(route.task) + (structured ? schemaPrompt(route.task) : "")
        + (presentationRequest && !structured ? presentationPrompt(presentationRequest) : "");
    const messages:ModelMessage[]=[{role:"system",content:prompt},...history,{role:"user",content:currentInput}];
    if (sourceDraft) result.workflowState.draft = sourceDraft;
    if (sourcePrefix) {
      if (!route.format) emitText(sourcePrefix);
      else result.reply = sourceDraft;
    }
    let generated=route.previousDraft || safeFireDraft || (sourceDraft && !summarizeSource ? sourceDraft : await completeModel({messages,signal,json:structured,voiceCall:body.voiceCall,maxTokens:body.voiceCall?160:route.task==="lesson"||route.format?6500:4000,
      onDelta:!structured && !route.format && onEvent ? emitText : undefined,
    }));
    if (!route.previousDraft && route.task !== "document_analysis") generated = currentTeachingSiteLinks(generated);
    if (sourcePrefix) generated = sourcePrefix + generated;
    if(structured) {
      const candidate=decodedJson(generated);
      const kind=route.task==="vision"?"vision_observation":route.task==="document_analysis"?"document_diagnosis":route.task==="recap"?"experiment_recap":"work_feedback";
      const parsed=parseAgentResult({text:`\`\`\`agent-result\n${JSON.stringify({...candidate,kind:candidate.kind||kind})}\n\`\`\``,sameOrigin:requestUrl,query:message});
      if(!parsed)throw new Error("模型返回的教学结果未通过格式校验。");
      if (parsed.kind !== kind && parsed.kind !== "degraded" && parsed.kind !== "error") {
        result.agentResult = failure("invalid_result", "模型返回了其他任务的结果，请重新生成。");
        result.reply = result.agentResult.message;
        return result;
      }
      if (parsed.kind === "work_feedback") parsed.recommended_resources = parsed.recommended_resources.flatMap(resource => {
        const item = evidence.items.find(item => item.id === resource.resource_id || item.baseId === resource.resource_id || item.resources.some(media => media.id === resource.resource_id));
        return item ? [{resource_id: item.id, title: item.title}] : [];
      });
      result.agentResult=parsed;
      result.reply=structuredReply(parsed);
      if(parsed.kind==="degraded"||parsed.kind==="error")return result;
      generated = structuredDraft(parsed);
    } else result.reply=body.voiceCall?normalizeVoiceCallReply(generated):generated;
    result.workflowState.draft = generated;
    if(route.format) {
      emit({type:"status",message:`正文已完成，正在生成 ${route.format.toUpperCase()} 文件…`});
      const {createTeachingDocument}=await import("./documents");
      const {storeTeachingArtifact}=await import("./artifacts");
      const title=generated.match(/^#\s+(.+)$/mu)?.[1]?.trim() || message.match(/《([^》]+)》/u)?.[1] || "教学文稿";
      const lessonPlan = route.format === "docx" && !structured && ["lesson", "document_creation"].includes(route.task)
        ? requestedLessonPlanDocument(route.effectiveQuery, generated, title) : undefined;
      const file=await createTeachingDocument(generated,route.format,title,presentationRequest,lessonPlan);
      signal?.throwIfAborted();
      result.files=[await storeTeachingArtifact(file)];
      result.reply=generated;
    }
    if(body.voiceCall)result.reply=normalizeVoiceCallReply(result.reply);
    return result;
  } catch(error) {
    if(signal?.aborted)throw error;
    const code=error instanceof ModelUnavailableError?"model_unavailable":(body.attachment || documentUrl) && !result.attachment?"attachment_unavailable":error instanceof SyntaxError?"invalid_result":"generation_failed";
    const message=error instanceof ModelUnavailableError || error instanceof PresentationPageCountError ? error.message :code==="attachment_unavailable"?"附件未能完整读取，请检查格式后重新上传。":"本次生成未完成，请重试；已完成的文字内容会保留。";
    result.agentResult=failure(code,message);result.reply=result.reply||message;
    if (!result.workflowState?.draft && state) result.workflowState = state;
    if((body.attachment || documentUrl)&&!result.attachment)result.attachment={name:body.attachment?.name || "在线文档",status:"unavailable",message};
    return result;
  }
}
