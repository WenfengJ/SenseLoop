SLEEP_EVENT_LABELS = {
    "snore": "打鼾",
    "cough": "咳嗽",
    "breathing_noise": "呼吸相关声音",
    "turn_over": "翻身",
    "wake_marker": "重点标记",
    "get_up": "起夜",
    "ambient_noise": "环境噪声",
}


def build_daily_report(profile: dict, signals: dict) -> dict:
    recovery_score = _calculate_recovery_score(signals)
    status = "observe" if recovery_score < 65 else "recovery_needed" if recovery_score < 78 else "stable"

    return {
        "id": f"report-{profile['profileType']}-{signals['date']}",
        "date": signals["date"],
        "profileId": profile["id"],
        "title": f"{profile['name']} · 每日健康建议",
        "status": status,
        "recoveryScore": recovery_score,
        "oneSentenceAdvice": _one_sentence(profile["profileType"]),
        "nightAudioSummary": _audio_summary(signals["audioEvents"]),
        "bodyStatusHints": _body_status_hints(signals),
        "foodAdvice": _food_advice(profile["profileType"], signals),
        "recoveryAdvice": _recovery_advice(profile["profileType"]),
        "riskNotice": _risk_notice(profile["profileType"], signals),
        "fourDiagnosisCompletion": {
            "wang": bool(signals.get("diet")) or signals.get("stool", {}).get("recorded") or signals.get("tongue", {}).get("recorded"),
            "wen": bool(signals.get("audioEvents")) or signals.get("breath", {}).get("level") != "unknown",
            "wenAsk": True,
            "qie": bool(signals.get("vitals", {}).get("heartRateResting") or signals.get("vitals", {}).get("steps")),
        },
        "evidenceTags": [
            SLEEP_EVENT_LABELS.get(event["type"], "未知声音")
            for event in signals["audioEvents"]
        ],
    }


def _calculate_recovery_score(signals: dict) -> int:
    score = 88
    sleep_quality = signals["sleep"]["sleepQuality"]
    if sleep_quality == "fair":
        score -= 10
    if sleep_quality == "poor":
        score -= 20
    score -= min(signals["sleep"]["wakeCount"] * 4, 16)
    score -= len([event for event in signals["audioEvents"] if event["intensity"] == "high"]) * 5
    if signals.get("stool", {}).get("dryness") == "dry":
        score -= 5
    return max(45, min(96, score))


def _audio_summary(events: list[dict]) -> list[str]:
    counts: dict[str, int] = {}
    for event in events:
        label = SLEEP_EVENT_LABELS.get(event["type"], "未知声音")
        counts[label] = counts.get(label, 0) + 1
    return [f"{label} {count} 次" for label, count in counts.items()]


def _one_sentence(profile_type: str) -> str:
    mapping = {
        "weight_loss_female": "今天适合轻控热量，不适合硬扛高强度训练。",
        "elderly": "昨夜起夜和咳嗽需要关注，今天以清淡饮食和低强度活动为主。",
        "office_worker": "昨晚恢复不足，今天先减轻肠胃负担，再做低强度恢复。",
        "student": "今天优先补能量、稳专注，不建议靠高糖饮料硬撑。",
        "insomnia": "今天重点不是补很多觉，而是重新建立稳定睡眠节律。",
    }
    return mapping.get(profile_type, "今天更适合恢复和观察。")


def _body_status_hints(signals: dict) -> list[str]:
    hints = []
    if signals["sleep"]["sleepQuality"] == "poor":
        hints.append("昨晚睡眠质量偏低，今天更适合恢复和观察。")
    if signals["sleep"]["wakeCount"] >= 3:
        hints.append("夜醒次数偏多，建议今天降低身体负荷。")
    if signals.get("stool", {}).get("dryness") == "dry":
        hints.append("排便偏干，饮水和膳食纤维需要优先补足。")
    if signals.get("tongue", {}).get("coatingThickness") == "thick":
        hints.append("舌苔偏厚，建议结合饮食油腻程度继续观察。")
    if not hints:
        hints.append("今天整体状态相对稳定，维持轻量记录即可。")
    return hints


def _food_advice(profile_type: str, signals: dict) -> list[str]:
    common = ["今天饮食以清淡、稳定为主，结合昨晚睡眠状态调整摄入。"]
    mapping = {
        "weight_loss_female": ["控制总热量但不要极端节食，早餐保留优质蛋白。", "排便偏干时优先补水和膳食纤维。"],
        "elderly": ["今天减少高盐和重油食物，选择温热、易消化的一餐。"],
        "office_worker": ["午餐减少重油重辣，下午 2 点后避免继续摄入咖啡因。"],
        "student": ["早餐补充蛋白质和主食，减少高糖饮料。"],
        "insomnia": ["晚餐提前并减少油腻，下午避免咖啡因。"],
    }
    return mapping.get(profile_type, common)


def _recovery_advice(profile_type: str) -> list[str]:
    mapping = {
        "weight_loss_female": ["恢复不足时不建议 HIIT，适合 30 分钟快走或轻力量。"],
        "elderly": ["上午适合散步和舒缓拉伸，不建议剧烈运动。"],
        "office_worker": ["今天目标不是透支训练，而是把身体拉回稳定状态。"],
        "student": ["下午安排 15 分钟户外活动，帮助稳定专注。"],
        "insomnia": ["午休控制在 20 分钟以内，晚上固定放松流程。"],
    }
    return mapping.get(profile_type, ["今天维持低强度活动，优先恢复。"])


def _risk_notice(profile_type: str, signals: dict) -> list[str]:
    notices = ["如果夜醒、咳嗽或打鼾连续增加，建议持续观察。"]
    if profile_type == "elderly":
        notices.append("咳嗽和起夜若连续多日增加，建议家人协助关注。")
    if signals.get("stool", {}).get("dryness") == "dry":
        notices.append("排便偏干连续出现时，建议观察饮水、纤维和作息。")
    if profile_type == "insomnia":
        notices.append("如果连续多日严重影响生活，建议寻求专业帮助。")
    return notices
