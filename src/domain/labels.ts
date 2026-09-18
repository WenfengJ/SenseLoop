import { SleepAudioEventType } from "./types";

export const sleepEventLabels: Record<SleepAudioEventType, string> = {
  snore: "打鼾",
  cough: "咳嗽",
  breathing_noise: "呼吸相关声音",
  turn_over: "翻身",
  wake_marker: "重点标记",
  get_up: "起夜",
  ambient_noise: "环境噪声",
  unknown: "未知声音",
};
