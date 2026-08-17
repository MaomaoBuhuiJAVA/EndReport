import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Eye,
  MessageCircleHeart,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  AgentResult,
  ExperimentRecapResult,
  InquiryTaskCard,
  PoetryCoverResult,
  VisionObservationResult,
  WorkFeedbackResult,
} from "@/lib/agent-result";

type AgentResultCardProps = {
  result?: AgentResult | null;
};

const MAX_ITEMS = 4;

function CompactList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  const visibleItems = items.slice(0, MAX_ITEMS);
  const remaining = items.length - visibleItems.length;

  return (
    <section className="agent-result-card__section">
      <h4>{label}</h4>
      <ul className="agent-result-card__list">
        {visibleItems.map((item, index) => <li key={`${label}-${index}-${item}`}>{item}</li>)}
      </ul>
      {remaining > 0 ? <span className="agent-result-card__more">另有 {remaining} 项</span> : null}
    </section>
  );
}

function CardHeader({
  icon,
  title,
  meta,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
}) {
  return (
    <header className="agent-result-card__header">
      <span className="agent-result-card__icon" aria-hidden="true">{icon}</span>
      <span className="agent-result-card__heading">
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </span>
    </header>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="agent-result-card__tags" aria-label="主题标签">
      {tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
    </div>
  );
}

function PoetryCoverCard({ result }: { result: PoetryCoverResult }) {
  return (
    <article className="agent-result-card agent-result-card--poetry" aria-label="科学诗封面">
      <CardHeader icon={<Sparkles size={15} />} title="科学诗封面" meta={result.model_name} />
      <a className="agent-result-card__cover" href={result.cover_url} target="_blank" rel="noreferrer">
        {/* The URL has already been restricted to the app or Dify origin by the parser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.cover_url} alt={result.alt_text} loading="lazy" />
      </a>
      <p className="agent-result-card__caption">{result.alt_text}</p>
      <TagList tags={result.theme_keywords} />
      {result.retry ? (
        <p className="agent-result-card__warning" role="status">
          {result.retry_reason || "封面效果还可以继续优化，可再次生成。"}
        </p>
      ) : null}
    </article>
  );
}

function VisionObservationCard({ result }: { result: VisionObservationResult }) {
  const confidence = `${Math.round(result.confidence * 100)}%`;
  return (
    <article className="agent-result-card agent-result-card--vision" aria-label="图片观察">
      <CardHeader icon={<Eye size={15} />} title="图片观察" meta={`${result.image_type} · 置信度 ${confidence}`} />
      <CompactList label="观察到的事实" items={result.facts} />
      <CompactList label="专业判断" items={result.judgements} />
      <CompactList label="还需确认" items={result.missing_evidence} />
      <CompactList label="建议行动" items={result.actions} />
      <CompactList label="安全提醒" items={result.safety} />
      {result.privacy_risk ? (
        <p className="agent-result-card__warning" role="status">图片可能包含隐私信息，仅供教师查看。</p>
      ) : null}
    </article>
  );
}

function ExperimentRecapCard({ result }: { result: ExperimentRecapResult }) {
  return (
    <article className="agent-result-card agent-result-card--recap" aria-label="实验复盘">
      <CardHeader icon={<ClipboardCheck size={15} />} title="实验复盘" meta="事实与建议分开呈现" />
      <CompactList label="记录到的事实" items={result.facts} />
      <CompactList label="目标分析" items={result.goal_analysis} />
      <CompactList label="材料问题" items={result.issues.materials} />
      <CompactList label="步骤问题" items={result.issues.steps} />
      <CompactList label="提问问题" items={result.issues.questions} />
      <CompactList label="组织问题" items={result.issues.organization} />
      <CompactList label="改进建议" items={result.improvements} />
      <CompactList label="验证要点" items={result.validation_points} />
      <CompactList label="安全提醒" items={result.safety} />
    </article>
  );
}

function InquiryTask({ task }: { task: InquiryTaskCard }) {
  return (
    <section className="agent-result-card__task">
      <h4>下一步探究</h4>
      <strong>{task.title}</strong>
      <CompactList label="准备材料" items={task.materials} />
      <CompactList label="操作步骤" items={task.steps} />
      <CompactList label="观察问题" items={task.observation_questions} />
      <p><span>记录方式：</span>{task.recording_method}</p>
      <CompactList label="安全提醒" items={task.safety} />
    </section>
  );
}

function WorkFeedbackCard({ result }: { result: WorkFeedbackResult }) {
  return (
    <article className="agent-result-card agent-result-card--feedback" aria-label="作品反馈">
      <CardHeader icon={<MessageCircleHeart size={15} />} title="作品反馈" meta={result.privacy_visibility === "teacher_only" ? "仅教师可见" : "待审核后公开"} />
      <CompactList label="先说发现" items={result.encouragement} />
      <CompactList label="我看到了" items={result.i_saw} />
      <CompactList label="我还好奇" items={result.i_wonder} />
      <CompactList label="下一次试试" items={result.next_try} />
      <TagList tags={result.tags} />
      {result.task_card ? <InquiryTask task={result.task_card} /> : null}
      {result.recommended_resources.length ? (
        <section className="agent-result-card__section">
          <h4>配套资源</h4>
          <div className="agent-result-card__resources">
            {result.recommended_resources.slice(0, 4).map((resource) => (
              <Link key={resource.resource_id} href={`/lab?item=${encodeURIComponent(resource.resource_id)}`}>
                {resource.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

function DegradedResultCard({ result }: { result: Extract<AgentResult, { kind: "degraded" | "error" }> }) {
  return (
    <article className="agent-result-card agent-result-card--degraded" aria-label="结构化结果暂不可用" role="status">
      <CardHeader icon={<AlertTriangle size={15} />} title="结构化结果暂不可用" meta="普通对话仍可继续" />
      <p>{result.message}</p>
      {result.retry_reason ? <p className="agent-result-card__warning">{result.retry_reason}</p> : null}
    </article>
  );
}

export function AgentResultCard({ result }: AgentResultCardProps) {
  if (!result) return null;
  switch (result.kind) {
    case "poetry_cover":
      return <PoetryCoverCard result={result} />;
    case "vision_observation":
      return <VisionObservationCard result={result} />;
    case "experiment_recap":
      return <ExperimentRecapCard result={result} />;
    case "work_feedback":
      return <WorkFeedbackCard result={result} />;
    case "degraded":
    case "error":
      return <DegradedResultCard result={result} />;
    default: {
      const exhaustive: never = result;
      return <p className="agent-result-card__warning">{String(exhaustive)}</p>;
    }
  }
}
