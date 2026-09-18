PROFILES = [
    {"id": "profile-weight-loss", "name": "减脂女性", "profileType": "weight_loss_female"},
    {"id": "profile-elderly", "name": "老人关怀", "profileType": "elderly"},
    {"id": "profile-office", "name": "熬夜上班族", "profileType": "office_worker"},
    {"id": "profile-student", "name": "学生", "profileType": "student"},
    {"id": "profile-insomnia", "name": "失眠人群", "profileType": "insomnia"},
]

MOCK_SIGNALS = {
    "weight_loss_female": {
        "date": "2026-09-18",
        "sleep": {"sleepDurationHours": 6.4, "sleepQuality": "fair", "wakeCount": 2},
        "audioEvents": [
            {"type": "turn_over", "startMinute": 82, "intensity": "medium"},
            {"type": "cough", "startMinute": 146, "intensity": "low"},
            {"type": "snore", "startMinute": 224, "intensity": "low"},
        ],
        "diet": [{"foodName": "鸡腿饭", "estimatedKcal": 720, "tags": ["偏油", "高碳水"]}],
        "stool": {"recorded": True, "dryness": "dry"},
        "tongue": {"recorded": True, "coatingThickness": "thick", "moisture": "dry"},
        "breath": {"level": "mild", "dryMouth": True},
    },
    "elderly": {
        "date": "2026-09-18",
        "sleep": {"sleepDurationHours": 6.8, "sleepQuality": "poor", "wakeCount": 3},
        "audioEvents": [
            {"type": "cough", "startMinute": 92, "intensity": "medium"},
            {"type": "get_up", "startMinute": 181, "intensity": "medium"},
            {"type": "cough", "startMinute": 263, "intensity": "medium"},
        ],
        "diet": [{"foodName": "咸粥和小菜", "estimatedKcal": 480, "tags": ["偏咸"]}],
        "stool": {"recorded": True, "dryness": "normal"},
        "tongue": {"recorded": True, "coatingThickness": "thin", "moisture": "dry"},
        "breath": {"level": "mild", "dryMouth": True},
    },
    "office_worker": {
        "date": "2026-09-18",
        "sleep": {"sleepDurationHours": 5.3, "sleepQuality": "poor", "wakeCount": 3},
        "audioEvents": [
            {"type": "ambient_noise", "startMinute": 41, "intensity": "high"},
            {"type": "turn_over", "startMinute": 124, "intensity": "medium"},
            {"type": "snore", "startMinute": 249, "intensity": "medium"},
        ],
        "diet": [{"foodName": "夜宵烧烤", "estimatedKcal": 980, "tags": ["偏油", "辛辣", "夜宵"]}],
        "stool": {"recorded": True, "dryness": "dry"},
        "tongue": {"recorded": True, "coatingThickness": "thick", "moisture": "dry"},
        "breath": {"level": "obvious", "dryMouth": True},
    },
    "student": {
        "date": "2026-09-18",
        "sleep": {"sleepDurationHours": 6.1, "sleepQuality": "fair", "wakeCount": 1},
        "audioEvents": [
            {"type": "ambient_noise", "startMinute": 65, "intensity": "medium"},
            {"type": "turn_over", "startMinute": 170, "intensity": "low"},
        ],
        "diet": [{"foodName": "奶茶和面包", "estimatedKcal": 530, "tags": ["高糖", "高碳水"]}],
        "stool": {"recorded": False},
        "tongue": {"recorded": False},
        "breath": {"level": "none", "dryMouth": False},
    },
    "insomnia": {
        "date": "2026-09-18",
        "sleep": {"sleepDurationHours": 4.7, "sleepQuality": "poor", "wakeCount": 4},
        "audioEvents": [
            {"type": "wake_marker", "startMinute": 58, "intensity": "low"},
            {"type": "turn_over", "startMinute": 143, "intensity": "medium"},
            {"type": "ambient_noise", "startMinute": 196, "intensity": "medium"},
            {"type": "wake_marker", "startMinute": 244, "intensity": "low"},
        ],
        "diet": [{"foodName": "清淡晚餐", "estimatedKcal": 520, "tags": ["蔬菜充足"]}],
        "stool": {"recorded": True, "dryness": "normal"},
        "tongue": {"recorded": True, "coatingThickness": "normal", "moisture": "normal"},
        "breath": {"level": "none", "dryMouth": False},
    },
}
