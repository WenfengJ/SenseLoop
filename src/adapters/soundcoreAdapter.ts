import { SleepAudioEvent } from "../domain/types";

export type DeviceStatus = {
  connected: boolean;
  name: string;
  mode: "mock" | "sdk";
};

export async function getDeviceStatus(): Promise<DeviceStatus> {
  return { connected: true, name: "soundcore Work 原型模式", mode: "mock" };
}

export async function getNightAudioEvents(): Promise<SleepAudioEvent[]> {
  return [];
}
