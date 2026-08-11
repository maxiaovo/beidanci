"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowRight,
  BookOpenText,
  Brain,
  CalendarCheck,
  CaretRight,
  ChartLineUp,
  Check,
  CheckCircle,
  Ear,
  Eye,
  FlagCheckered,
  Gauge,
  HandHeart,
  Keyboard,
  ListChecks,
  LockKeyOpen,
  Pause,
  PencilLine,
  Play,
  PuzzlePiece,
  Queue,
  SpeakerHigh,
  Student,
  Target,
  Timer,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import styles from "./learning-guide.module.css";

type Icon = ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" | "duotone"; "aria-hidden"?: boolean }>;

interface FlowStep {
  title: string;
  short: string;
  detail: string;
  note: string;
  icon: Icon;
}

const DAILY_FLOW: FlowStep[] = [
  {
    title: "确定今日任务",
    short: "词书计划",
    detail: "按每本书的固定词数、单元分数，或全局每日目标，算出今天要学的新词。",
    note: "计划只决定新词数量；到期复习永远排在前面。",
    icon: ListChecks,
  },
  {
    title: "先完成到期复习",
    short: "复习门禁",
    detail: "系统按到期时间排序，先安排旧词检查；没清完时，新词默认不解锁。",
    note: "管理员允许时可跳过，但会留痕，未复习的词继续累积。",
    icon: CalendarCheck,
  },
  {
    title: "每个新词走五步",
    short: "完整学习",
    detail: "认识、拆解、语境、拼写、自测，一步不漏；最后默写正确才算完成。",
    note: "自测失败的词会回到本次队尾，从第一步完整重学。",
    icon: BookOpenText,
  },
  {
    title: "进入间隔复习",
    short: "长期记忆",
    detail: "之后按 1、2、4、7、15、30、60 天的间隔再次主动回忆，直至阶段 8。",
    note: "每次一遍通过就升级；答错或放弃则回到起点修复。",
    icon: Brain,
  },
];

const LEARN_STEPS = [
  { title: "认识", subtitle: "看词形 · 听发音", detail: "看到英文和音标，点击单词听标准发音，先建立字形与声音的连接。", icon: Ear, color: "orange" },
  { title: "拆解", subtitle: "构词 · 释义 · 记忆法", detail: "观察词根、前缀和后缀，结合中文释义与记忆提示理解单词结构。", icon: PuzzlePiece, color: "pink" },
  { title: "语境", subtitle: "两条例句 · 中英对照", detail: "依次听两条例句，在真实语境中辨认含义；目标词会在英文句子中高亮。", icon: BookOpenText, color: "blue" },
  { title: "拼写", subtitle: "临摹输入 · 可抄例句", detail: "跟随浅色字形输入单词。开启扩展模式后，还会完整抄写两条例句。", icon: Keyboard, color: "green" },
  { title: "自测", subtitle: "只看中文 · 默写英文", detail: "隐藏英文，只显示中文释义和词性。完整拼写正确后，才记录为已经学会。", icon: CheckCircle, color: "purple" },
];

const RECOVERY_STEPS = [
  { label: "答错 / 放弃", icon: WarningCircle },
  { label: "显示正确答案", icon: Eye },
  { label: "随机插回后面", icon: Queue },
  { label: "补考答对一次", icon: Check },
  { label: "本轮通过", icon: FlagCheckered },
];

const STAGES = [
  { stage: 1, interval: "1 天", size: 24 },
  { stage: 2, interval: "2 天", size: 32 },
  { stage: 3, interval: "4 天", size: 41 },
  { stage: 4, interval: "7 天", size: 50 },
  { stage: 5, interval: "15 天", size: 63 },
  { stage: 6, interval: "30 天", size: 78 },
  { stage: 7, interval: "60 天", size: 92 },
  { stage: 8, interval: "已掌握", size: 100 },
];

const NEXT_REVIEW: Record<number, string> = {
  0: "10 分钟起点",
  1: "1 天后",
  2: "2 天后",
  3: "4 天后",
  4: "7 天后",
  5: "15 天后",
  6: "30 天后",
  7: "60 天后",
  8: "已掌握",
};

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className={styles.sectionHeading}>
      <div className={styles.eyebrow}>{eyebrow}</div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export default function LearningGuide() {
  const [activeFlow, setActiveFlow] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [activeLearn, setActiveLearn] = useState(0);
  const [memoryStage, setMemoryStage] = useState(1);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActiveFlow((step) => (step + 1) % DAILY_FLOW.length), 2600);
    return () => window.clearInterval(timer);
  }, [playing]);

  const activeFlowStep = DAILY_FLOW[activeFlow];
  const memoryStatus = useMemo(() => {
    if (recovering) return "补考中 · 答对一次即过";
    if (memoryStage === 8) return "阶段 8 · 已掌握";
    return `阶段 ${memoryStage} · 下次 ${NEXT_REVIEW[memoryStage]}`;
  }, [memoryStage, recovering]);

  function answerCorrect() {
    if (recovering) {
      // 补考一次答对即修复，回到阶段 1
      setRecovering(false);
      setMemoryStage(1);
      return;
    }
    setMemoryStage((stage) => Math.min(8, stage + 1));
  }

  function answerWrong() {
    setMemoryStage(0);
    setRecovering(true);
  }

  function resetSimulator() {
    setMemoryStage(1);
    setRecovering(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.kicker}><Target size={18} weight="fill" aria-hidden /> 单词学习路线</div>
            <h1>先记住，<span>再真正掌握。</span></h1>
            <p>这不是“看一遍就算学会”的背词流程，而是一条从每日计划、主动回忆，到错题修复和间隔复习的完整闭环。</p>
            <div className={styles.heroActions}>
              <a href="#daily-flow" className={styles.primaryAction}>看完整流程 <ArrowDown size={18} weight="bold" aria-hidden /></a>
              <Link href="/learn" className={styles.secondaryAction}>开始背单词 <CaretRight size={18} weight="bold" aria-hidden /></Link>
            </div>
          </div>
          <div className={styles.heroDiagram} aria-label="学习闭环概览">
            <div className={styles.orbitCenter}><Brain size={42} weight="duotone" aria-hidden /><strong>长期记忆</strong><span>主动提取</span></div>
            <div className={`${styles.orbitItem} ${styles.orbitTop}`}><CalendarCheck size={25} weight="duotone" aria-hidden /><span>先复习</span></div>
            <div className={`${styles.orbitItem} ${styles.orbitRight}`}><PencilLine size={25} weight="duotone" aria-hidden /><span>再新学</span></div>
            <div className={`${styles.orbitItem} ${styles.orbitBottom}`}><ArrowClockwise size={25} weight="duotone" aria-hidden /><span>错题修复</span></div>
            <div className={`${styles.orbitItem} ${styles.orbitLeft}`}><Timer size={25} weight="duotone" aria-hidden /><span>间隔再见</span></div>
          </div>
        </header>

        <nav className={styles.jumpNav} aria-label="本页内容">
          <a href="#daily-flow">每日流程</a>
          <a href="#five-steps">新词五步</a>
          <a href="#recovery">错题补考</a>
          <a href="#memory">记忆阶梯</a>
          <a href="#parent">家长陪伴</a>
        </nav>

        <section id="daily-flow" className={styles.section}>
          <div className={styles.sectionTopline}>
            <SectionHeading
              eyebrow="DAILY LOOP"
              title="每天打开学习页，会发生什么？"
              description="点击任一步查看说明，或让流程自动播放一遍。"
            />
            <button
              type="button"
              className={styles.playButton}
              onClick={() => setPlaying((value) => !value)}
              aria-pressed={playing}
            >
              {playing ? <Pause size={18} weight="fill" aria-hidden /> : <Play size={18} weight="fill" aria-hidden />}
              {playing ? "暂停流程" : "播放流程"}
            </button>
          </div>

          <div className={styles.flowBoard}>
            <div className={styles.flowTrack}>
              {DAILY_FLOW.map((step, index) => {
                const StepIcon = step.icon;
                const active = index === activeFlow;
                return (
                  <div className={styles.flowItemWrap} key={step.title}>
                    <button
                      type="button"
                      className={`${styles.flowItem} ${active ? styles.flowItemActive : ""}`}
                      onClick={() => {
                        setActiveFlow(index);
                        setPlaying(false);
                      }}
                      aria-pressed={active}
                    >
                      <span className={styles.flowNumber}>0{index + 1}</span>
                      <span className={styles.flowIcon}><StepIcon size={29} weight={active ? "fill" : "duotone"} aria-hidden /></span>
                      <strong>{step.title}</strong>
                      <small>{step.short}</small>
                    </button>
                    {index < DAILY_FLOW.length - 1 && (
                      <span className={styles.flowArrow} aria-hidden><ArrowRight size={23} weight="bold" /></span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={styles.flowDetail} aria-live="polite">
              <div className={styles.flowDetailIndex}>0{activeFlow + 1}</div>
              <div>
                <strong>{activeFlowStep.title}</strong>
                <p>{activeFlowStep.detail}</p>
                <span>{activeFlowStep.note}</span>
              </div>
              <div className={styles.flowProgress} aria-hidden>
                {DAILY_FLOW.map((step, index) => <i key={step.title} className={index === activeFlow ? styles.progressActive : ""} />)}
              </div>
            </div>
          </div>

          <div className={styles.gateNote}>
            <LockKeyOpen size={26} weight="duotone" aria-hidden />
            <div><strong>复习是新词的门禁</strong><span>到期词默认必须先清完；管理员允许时可以跳过，但会留下家长可见记录，未复习的词继续累积。</span></div>
          </div>
        </section>

        <section id="five-steps" className={styles.section}>
          <SectionHeading
            eyebrow="ONE WORD · FIVE STEPS"
            title="一个新词，完整走完五步"
            description="每一步只解决一个问题：先听懂，再理解，然后放进语境、写出来，最后脱离提示主动回忆。"
          />
          <div className={styles.learnLayout}>
            <div className={styles.learnRail} role="tablist" aria-label="新词学习五步">
              {LEARN_STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const active = index === activeLearn;
                return (
                  <button
                    key={step.title}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.learnStep} ${styles[`learn${step.color}`]} ${active ? styles.learnStepActive : ""}`}
                    onClick={() => setActiveLearn(index)}
                  >
                    <span className={styles.learnStepIndex}>{index + 1}</span>
                    <StepIcon size={27} weight={active ? "fill" : "duotone"} aria-hidden />
                    <span><strong>{step.title}</strong><small>{step.subtitle}</small></span>
                  </button>
                );
              })}
            </div>
            <div className={styles.learnDemo} role="tabpanel">
              <div className={styles.demoTopline}><span>正在学习</span><span>{activeLearn + 1} / 5</span></div>
              <div className={styles.demoWord}>discover</div>
              <div className={styles.demoPhonetic}><SpeakerHigh size={18} weight="fill" aria-hidden /> /dɪˈskʌvə/</div>
              <div className={styles.demoContent} key={LEARN_STEPS[activeLearn].title}>
                <strong>{LEARN_STEPS[activeLearn].title} · {LEARN_STEPS[activeLearn].subtitle}</strong>
                <p>{LEARN_STEPS[activeLearn].detail}</p>
              </div>
              <div className={styles.demoProgress} aria-hidden>{LEARN_STEPS.map((step, index) => <i key={step.title} className={index <= activeLearn ? styles.demoDone : ""} />)}</div>
            </div>
          </div>
          <div className={styles.selfTestLoop}>
            <div><CheckCircle size={30} weight="fill" aria-hidden /><strong>自测正确</strong><span>记录“已学”，进入下一个词</span></div>
            <ArrowRight size={22} weight="bold" aria-hidden />
            <div><WarningCircle size={30} weight="fill" aria-hidden /><strong>答错 / 想不起</strong><span>显示答案，排到队尾</span></div>
            <ArrowRight size={22} weight="bold" aria-hidden />
            <div><ArrowClockwise size={30} weight="fill" aria-hidden /><strong>完整重学</strong><span>从“认识”重新开始，直到通过</span></div>
          </div>
        </section>

        <section id="recovery" className={`${styles.section} ${styles.recoverySection}`}>
          <SectionHeading
            eyebrow="RECOVERY IN THE SAME ROUND"
            title="复习答错，不拖到以后：本轮就修复"
            description="系统不会让学习者原地机械重打，而是先揭示答案，再把补考题放回后面的队列，制造一次有间隔的重新提取。"
          />
          <div className={styles.recoveryQueue} aria-label="错题补考动态流程">
            {RECOVERY_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div className={styles.recoveryItemWrap} key={step.label}>
                  <div className={styles.recoveryItem} style={{ animationDelay: `${index * 1.1}s` }}>
                    <StepIcon size={25} weight={index === RECOVERY_STEPS.length - 1 ? "fill" : "duotone"} aria-hidden />
                    <span>{step.label}</span>
                  </div>
                  {index < RECOVERY_STEPS.length - 1 && <ArrowRight className={styles.recoveryArrow} size={20} weight="bold" aria-hidden />}
                </div>
              );
            })}
          </div>
          <div className={styles.recoveryRules}>
            <div><Queue size={25} weight="duotone" aria-hidden /><span><strong>随机重插：</strong>至少隔一道题再出现；剩余不足时追加到队尾。</span></div>
            <div><Target size={25} weight="duotone" aria-hidden /><span><strong>补考次数可设：</strong>默认补考 1 次答对即过；家长可调到 2-5 次，开启循环补考后中途再错会清零重计。</span></div>
            <div><Gauge size={25} weight="duotone" aria-hidden /><span><strong>强检查更严格：</strong>另一题型即使已经通过，也要再通过一次。</span></div>
          </div>
        </section>

        <section id="memory" className={styles.section}>
          <div className={styles.sectionTopline}>
            <SectionHeading
              eyebrow="SPACED REVIEW"
              title="亲手试试记忆阶梯"
              description="点击“答对一次”观察复习间隔如何拉长；点击“答错 / 放弃”体验阶段重置与补考修复。"
            />
            <button type="button" className={styles.resetButton} onClick={resetSimulator}><ArrowClockwise size={17} weight="bold" aria-hidden /> 重置演示</button>
          </div>
          <div className={styles.memoryLayout}>
            <div className={styles.intervalChart} aria-label="1、2、4、7、15、30、60 天复习阶梯">
              {STAGES.map((item) => {
                const current = item.stage === memoryStage;
                const reached = memoryStage > 0 && item.stage <= memoryStage;
                return (
                  <div className={`${styles.intervalItem} ${current ? styles.intervalCurrent : ""}`} key={item.stage}>
                    <div className={styles.intervalBarBox}>
                      <div
                        className={`${styles.intervalBar} ${reached ? styles.intervalReached : ""}`}
                        style={{ "--bar-size": `${item.size}%` } as CSSProperties}
                      />
                    </div>
                    <strong>{item.interval}</strong>
                    <span>阶段 {item.stage}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.memoryController}>
              <div className={`${styles.memoryStatus} ${recovering ? styles.memoryStatusWarning : ""}`}>
                <span>当前状态</span>
                <strong>{memoryStatus}</strong>
                <small>{recovering ? "点击“补考答对”，一次答对即回到阶段 1；再错则再补考一次" : memoryStage === 8 ? "这个词已在词书中标记为已掌握" : "下一次一遍通过，就会再向上晋一级"}</small>
              </div>
              <div className={styles.memoryButtons}>
                <button type="button" onClick={answerCorrect} className={styles.correctButton}>
                  <Check size={19} weight="bold" aria-hidden /> {recovering ? "补考答对" : "答对一次"}
                </button>
                <button type="button" onClick={answerWrong} className={styles.wrongButton}>
                  <WarningCircle size={19} weight="bold" aria-hidden /> 答错 / 放弃
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="parent" className={`${styles.section} ${styles.parentSection}`}>
          <SectionHeading
            eyebrow="FOR PARENTS"
            title="家长不代替答题，但能看见过程、调节节奏、及时鼓励"
            description="家长账号没有学习权限；孩子负责完成学习，家长负责了解真实过程并提供合适支持。"
          />
          <div className={styles.parentLayout}>
            <div className={styles.parentCards}>
              <article><Eye size={27} weight="duotone" aria-hidden /><div><strong>看得见</strong><p>今日/累计练习、正确率、待复习、已学词、连续天数，以及每个词的正确、错误和放弃记录。</p></div></article>
              <article><Gauge size={27} weight="duotone" aria-hidden /><div><strong>调得动</strong><p>设置每日新词目标 1–200、每日复习上限 1–500；跳过复习时还能看到未完成数量。</p></div></article>
              <article><HandHeart size={27} weight="duotone" aria-hidden /><div><strong>陪得到</strong><p>留言可在开始学习、学习 N 分钟后或第 N 个词时弹出，并单独设置有效期。</p></div></article>
            </div>
            <div className={styles.parentDashboard} aria-label="家长端数据示意">
              <div className={styles.dashboardHeader}><div><UsersThree size={24} weight="fill" aria-hidden /><strong>本周学习概览</strong></div><span>孩子自主完成</span></div>
              <div className={styles.dashboardMetrics}>
                <div><strong>42</strong><span>今日练习</span></div>
                <div><strong>87%</strong><span>正确率</span></div>
                <div><strong>18</strong><span>待复习</span></div>
              </div>
              <div className={styles.dashboardChart} aria-label="连续七天学习次数示意图">
                {[52, 72, 46, 88, 64, 100, 78].map((height, index) => (
                  <div key={index}><i style={{ height: `${height}%` }} /><span>{["一", "二", "三", "四", "五", "六", "日"][index]}</span></div>
                ))}
              </div>
              <div className={styles.dashboardMessage}><Student size={22} weight="duotone" aria-hidden /><span>“坚持把今天的复习做完，你已经越来越稳了。”</span></div>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <div><ChartLineUp size={28} weight="duotone" aria-hidden /><span><strong>核心闭环</strong>计划 → 到期复习 → 新词五步 → 自测 → 间隔复习 → 掌握</span></div>
          <Link href="/learn">开始今天的学习 <ArrowRight size={18} weight="bold" aria-hidden /></Link>
        </footer>
      </div>
    </div>
  );
}
