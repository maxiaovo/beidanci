import type { Metadata } from "next";
import LearningGuide from "./LearningGuide";

export const metadata: Metadata = {
  title: "单词学习路线",
  description: "用动态流程图了解每日复习、新词五步、错题补考、记忆阶梯和家长陪伴。",
};

export default function LearningGuidePage() {
  return <LearningGuide />;
}
