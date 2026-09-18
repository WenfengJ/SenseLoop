export type VisualEvent = {
  id: string;
  type: "activity" | "privacy_zone" | "motion";
  title: string;
};

export async function getActivityEvents(): Promise<VisualEvent[]> {
  return [
    { id: "eufy-placeholder-1", type: "privacy_zone", title: "隐私区已开启" },
  ];
}
