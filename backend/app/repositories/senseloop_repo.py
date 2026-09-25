from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
import hashlib
import os
import secrets
import smtplib
from uuid import uuid4

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.data.mock_data import MOCK_SIGNALS, PROFILES
from app.models.tables import (
    AccountProfileTable,
    AgentMemoryTable,
    AgentMessageTable,
    AgentSessionTable,
    BreathRecordTable,
    DailySignalDayTable,
    DietRecordTable,
    EmailVerificationCodeTable,
    GuestUserTable,
    HealthDocumentTable,
    KnowledgeChunkTable,
    KnowledgeSourceTable,
    MediaAssetTable,
    ProfileGoalTable,
    SignalObservationTable,
    SleepAudioEventTable,
    SleepSignalTable,
    StoolRecordTable,
    TongueRecordTable,
    UserAccountTable,
    UserDeviceTable,
    UserProfileTable,
    UserSessionTable,
    VitalRecordTable,
)


PLACEHOLDER_KNOWLEDGE = [
    {
        "id": "src-four-diagnosis-v2",
        "sourceType": "product_rule",
        "title": "四诊 Agent 工作流",
        "chunks": [
            {
                "content": "SenseLoop 用望、闻、问、切组织多模态健康输入。望包括舌图、饮食图和体检报告；闻包括夜间声音、鼾声、咳嗽、起夜和口气反馈；问包括聊天问诊、症状描述和生活习惯；切包括心率、步数、运动和未来穿戴体征。",
                "tags": ["四诊", "agent", "产品定位"],
            },
            {
                "content": "健康建议必须使用倾向、建议观察、可能相关等表达，不能把中医辨证表述成医学确诊，不能替代医生诊断。",
                "tags": ["医疗边界", "安全"],
                "safetyLevel": "medical_boundary",
            },
        ],
    },
    {
        "id": "src-night-audio-v2",
        "sourceType": "sleep_rule",
        "title": "夜间声音与闻诊边界",
        "chunks": [
            {
                "content": "睡眠和鼾声是 SenseLoop v2 的闻诊主线。夜间声音只能作为趋势观察依据，可用于解释晨起疲惫、恢复建议和是否需要补充记录，不用于诊断睡眠呼吸暂停或具体疾病。",
                "tags": ["睡眠", "鼾声", "闻诊"],
                "safetyLevel": "medical_boundary",
            },
            {
                "content": "若连续多日出现高强度鼾声、频繁夜醒、咳嗽片段增加或明显白天不适，应提示用户咨询医生或专业机构。",
                "tags": ["睡眠", "风险提醒"],
                "safetyLevel": "risk_notice",
            },
        ],
    },
    {
        "id": "src-tongue-diet-v2",
        "sourceType": "tcm_rule",
        "title": "舌诊、饮食与药食同源边界",
        "chunks": [
            {
                "content": "舌诊第一版基于舌色、舌苔、津液、照片质量和用户描述做健康管理解读，需要和睡眠、排便、饮食、问诊一起合参。",
                "tags": ["舌诊", "望诊"],
            },
            {
                "content": "药食同源建议以日常食材和温和饮食调整为主，避免给出药物剂量、治疗承诺或针对慢病、孕期、儿童的绝对建议。",
                "tags": ["药食同源", "饮食", "安全"],
                "safetyLevel": "medical_boundary",
            },
        ],
    },
    {
        "id": "src-privacy-v2",
        "sourceType": "privacy_rule",
        "title": "隐私与记忆策略",
        "chunks": [
            {
                "content": "隐私策略采用敏感数据分级、原始文件与摘要分离、长期记忆只存摘要、Agent 工具调用绑定 profileId、用户可删除的原则。",
                "tags": ["隐私", "记忆", "profileId"],
                "safetyLevel": "privacy",
            }
        ],
    },
]


def seed_demo_data(session: Session) -> None:
    if not session.scalar(select(func.count(UserProfileTable.id))):
        for profile in PROFILES:
            profile_row = UserProfileTable(
                id=profile["id"],
                name=profile["name"],
                profile_type=profile["profileType"],
                age=profile["age"],
                gender=profile["gender"],
                occupation=profile["occupation"],
                coffee=profile["habits"]["coffee"],
                late_night_snack=profile["habits"]["lateNightSnack"],
                sedentary_hours=profile["habits"]["sedentaryHours"],
                exercise_frequency=profile["habits"]["exerciseFrequency"],
                sleep_problem=profile["habits"]["sleepProblem"],
                goals=[ProfileGoalTable(goal=goal) for goal in profile["goals"]],
            )
            session.add(profile_row)
            _insert_signals(session, profile_row, MOCK_SIGNALS[profile["profileType"]])
    _seed_placeholder_knowledge(session)
    session.commit()


def get_or_create_guest_user(session: Session, device_id: str | None = None) -> dict:
    normalized_device_id = device_id or f"web-{uuid4()}"
    row = session.scalar(select(GuestUserTable).where(GuestUserTable.device_id == normalized_device_id))
    account = None
    if row and row.default_profile_id:
        account = session.scalar(
            select(UserAccountTable)
            .join(AccountProfileTable, AccountProfileTable.account_id == UserAccountTable.id)
            .where(AccountProfileTable.profile_id == row.default_profile_id, UserAccountTable.auth_type == "guest")
        )
    if account is None:
        default_profile = _create_owned_profile(session, "guest", display_name="游客档案")
        account = UserAccountTable(
            id=f"acct-{uuid4()}",
            auth_type="guest",
            email=None,
            display_name="游客用户",
            default_profile_id=default_profile.id,
            extra_metadata={"guestDeviceId": normalized_device_id},
        )
        session.add(account)
        session.flush()
        session.add(AccountProfileTable(account_id=account.id, profile_id=default_profile.id, role="owner"))
    _upsert_device(session, account.id, normalized_device_id)
    if row is None:
        row = GuestUserTable(
            id=f"guest-{uuid4()}",
            device_id=normalized_device_id,
            default_profile_id=account.default_profile_id,
        )
        session.add(row)
    else:
        row.default_profile_id = account.default_profile_id
    session.commit()
    profiles = list_profiles_for_account(session, account.id)
    return {
        "deviceId": row.device_id,
        "guestUserId": row.id,
        "accountId": account.id,
        "authMode": "guest",
        "email": None,
        "displayName": account.display_name,
        "profileId": account.default_profile_id,
        "profiles": profiles,
    }


def login_with_email(session: Session, email: str, display_name: str | None = None, device_id: str | None = None, device_name: str | None = None) -> dict:
    normalized_email = email.strip().lower()
    if not normalized_email or "@" not in normalized_email:
        raise ValueError("valid email is required")
    account = session.scalar(select(UserAccountTable).where(UserAccountTable.email == normalized_email))
    if account is None:
        profile = _create_owned_profile(session, normalized_email, display_name=display_name or normalized_email.split("@", 1)[0])
        account = UserAccountTable(
            id=f"acct-{uuid4()}",
            auth_type="email",
            email=normalized_email,
            display_name=display_name or normalized_email.split("@", 1)[0],
            default_profile_id=profile.id,
            extra_metadata={},
        )
        session.add(account)
        session.flush()
        session.add(AccountProfileTable(account_id=account.id, profile_id=profile.id, role="owner"))
    elif display_name and account.display_name != display_name:
        account.display_name = display_name
    normalized_device_id = device_id or f"web-{uuid4()}"
    _upsert_device(session, account.id, normalized_device_id, device_name=device_name)
    session.commit()
    profiles = list_profiles_for_account(session, account.id)
    return {
        "deviceId": normalized_device_id,
        "guestUserId": "",
        "accountId": account.id,
        "authMode": "email",
        "email": account.email,
        "displayName": account.display_name,
        "profileId": account.default_profile_id,
        "profiles": profiles,
    }


def request_email_code(session: Session, email: str, display_name: str | None = None, device_id: str | None = None, device_name: str | None = None) -> dict:
    normalized_email = _normalize_email(email)
    expires_in = int(os.getenv("EMAIL_CODE_EXPIRES_SECONDS", "600"))
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = EmailVerificationCodeTable(
        id=f"email-code-{uuid4()}",
        email=normalized_email,
        code_hash=_hash_secret(code),
        purpose="login",
        display_name=(display_name or "").strip() or None,
        device_id=device_id,
        device_name=device_name,
        expires_at=_utc_now() + timedelta(seconds=expires_in),
    )
    session.add(row)
    session.commit()
    delivered = _send_email_code(normalized_email, code)
    return {
        "email": normalized_email,
        "expiresInSeconds": expires_in,
        "delivery": "email" if delivered else "dev",
        "devCode": None if delivered else code,
    }


def verify_email_code(
    session: Session,
    email: str,
    code: str,
    display_name: str | None = None,
    device_id: str | None = None,
    device_name: str | None = None,
) -> dict:
    normalized_email = _normalize_email(email)
    normalized_code = code.strip()
    if not normalized_code:
        raise ValueError("verification code is required")
    row = session.scalar(
        select(EmailVerificationCodeTable)
        .where(
            EmailVerificationCodeTable.email == normalized_email,
            EmailVerificationCodeTable.purpose == "login",
            EmailVerificationCodeTable.consumed_at.is_(None),
        )
        .order_by(EmailVerificationCodeTable.created_at.desc(), EmailVerificationCodeTable.id.desc())
        .limit(1)
    )
    if row is None:
        raise ValueError("verification code not found or already used")
    if _as_utc(row.expires_at) < _utc_now():
        raise ValueError("verification code has expired")
    if row.attempt_count >= 5:
        raise ValueError("too many attempts, please request a new code")
    if not secrets.compare_digest(row.code_hash, _hash_secret(normalized_code)):
        row.attempt_count += 1
        session.commit()
        raise ValueError("verification code is incorrect")

    row.consumed_at = _utc_now()
    identity = login_with_email(
        session,
        normalized_email,
        display_name=display_name or row.display_name,
        device_id=device_id or row.device_id,
        device_name=device_name or row.device_name,
    )
    token, token_row = _create_user_session(session, identity["accountId"], identity["deviceId"])
    session.add(token_row)
    session.commit()
    identity["sessionToken"] = token
    return identity


def get_identity_from_session(session: Session, session_token: str, device_id: str | None = None, device_name: str | None = None) -> dict:
    token = session_token.strip()
    if not token:
        raise ValueError("session token is required")
    row = session.scalar(
        select(UserSessionTable).where(
            UserSessionTable.token_hash == _hash_secret(token),
            UserSessionTable.revoked_at.is_(None),
        )
    )
    if row is None or _as_utc(row.expires_at) < _utc_now():
        raise ValueError("session is invalid or expired")
    account = session.get(UserAccountTable, row.account_id)
    if account is None:
        raise ValueError("account not found")
    normalized_device_id = device_id or row.device_id or f"web-{uuid4()}"
    _upsert_device(session, account.id, normalized_device_id, device_name=device_name)
    row.device_id = normalized_device_id
    row.last_seen_at = _utc_now()
    session.commit()
    return _identity_for_account(session, account, normalized_device_id, session_token=token)


def list_profiles_for_account(session: Session, account_id: str) -> list[dict]:
    rows = session.scalars(
        _profile_query()
        .join(AccountProfileTable, AccountProfileTable.profile_id == UserProfileTable.id)
        .where(AccountProfileTable.account_id == account_id)
        .order_by(AccountProfileTable.created_at, UserProfileTable.id)
    ).all()
    return [_profile_to_dict(row) for row in rows]


def create_profile_for_account(session: Session, account_id: str, payload: dict) -> dict:
    account = session.get(UserAccountTable, account_id)
    if account is None:
        raise ValueError("account not found")
    profile_id = f"profile-{uuid4()}"
    row = _profile_from_payload(profile_id, payload)
    session.add(row)
    session.flush()
    session.add(AccountProfileTable(account_id=account.id, profile_id=row.id, role="owner"))
    account.default_profile_id = row.id
    _insert_signals(session, row, {**MOCK_SIGNALS.get(row.profile_type, MOCK_SIGNALS["weight_loss_female"]), "profileId": row.id})
    session.commit()
    return _profile_to_dict(row)


def update_profile(session: Session, profile_id: str, payload: dict) -> dict | None:
    row = session.scalar(_profile_query().where(UserProfileTable.id == profile_id))
    if row is None:
        return None
    _apply_profile_payload(row, payload)
    session.commit()
    return _profile_to_dict(row)


def _create_owned_profile(session: Session, owner_seed: str, display_name: str) -> UserProfileTable:
    template = PROFILES[0]
    profile_id = f"profile-{uuid4()}"
    profile_row = UserProfileTable(
        id=profile_id,
        name=display_name or "我的档案",
        profile_type=template["profileType"],
        age=template["age"],
        gender=template["gender"],
        occupation=template["occupation"],
        coffee=template["habits"]["coffee"],
        late_night_snack=template["habits"]["lateNightSnack"],
        sedentary_hours=template["habits"]["sedentaryHours"],
        exercise_frequency=template["habits"]["exerciseFrequency"],
        sleep_problem=template["habits"]["sleepProblem"],
        risk_preferences={"ownerSeed": owner_seed},
        goals=[ProfileGoalTable(goal=goal) for goal in template["goals"]],
    )
    session.add(profile_row)
    _insert_signals(session, profile_row, {**MOCK_SIGNALS[template["profileType"]], "profileId": profile_id})
    session.flush()
    return profile_row


def _profile_from_payload(profile_id: str, payload: dict) -> UserProfileTable:
    row = UserProfileTable(id=profile_id)
    _apply_profile_payload(row, payload)
    return row


def _apply_profile_payload(row: UserProfileTable, payload: dict) -> None:
    habits = payload.get("habits") or {}
    row.name = payload["name"].strip() or "我的档案"
    row.profile_type = payload.get("profileType", "weight_loss_female")
    row.age = int(payload["age"])
    row.gender = payload["gender"]
    row.occupation = payload["occupation"].strip() or "未填写"
    row.coffee = habits.get("coffee", "none")
    row.late_night_snack = bool(habits.get("lateNightSnack", False))
    row.sedentary_hours = float(habits.get("sedentaryHours", 6))
    row.exercise_frequency = habits.get("exerciseFrequency", "medium")
    row.sleep_problem = habits.get("sleepProblem", "mild")
    row.goals = [ProfileGoalTable(goal=goal) for goal in payload.get("goals", [])]


def _upsert_device(session: Session, account_id: str, device_id: str, device_name: str | None = None) -> None:
    row = session.scalar(
        select(UserDeviceTable).where(UserDeviceTable.account_id == account_id, UserDeviceTable.device_id == device_id)
    )
    if row is None:
        session.add(UserDeviceTable(id=f"dev-{uuid4()}", account_id=account_id, device_id=device_id, device_name=device_name))
    elif device_name:
        row.device_name = device_name


def _identity_for_account(session: Session, account: UserAccountTable, device_id: str, session_token: str | None = None) -> dict:
    return {
        "deviceId": device_id,
        "guestUserId": "",
        "accountId": account.id,
        "authMode": account.auth_type,
        "email": account.email,
        "displayName": account.display_name,
        "profileId": account.default_profile_id,
        "profiles": list_profiles_for_account(session, account.id),
        "sessionToken": session_token,
    }


def _create_user_session(session: Session, account_id: str, device_id: str | None = None) -> tuple[str, UserSessionTable]:
    days = int(os.getenv("AUTH_SESSION_DAYS", "30"))
    token = secrets.token_urlsafe(32)
    return token, UserSessionTable(
        id=f"sess-{uuid4()}",
        account_id=account_id,
        token_hash=_hash_secret(token),
        device_id=device_id,
        expires_at=_utc_now() + timedelta(days=days),
    )


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise ValueError("valid email is required")
    return normalized


def _hash_secret(value: str) -> str:
    secret = os.getenv("EMAIL_CODE_SECRET") or os.getenv("SENSELOOP_AUTH_SECRET") or "senseloop-local-auth-secret"
    return hashlib.sha256(f"{secret}:{value}".encode("utf-8")).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _send_email_code(email: str, code: str) -> bool:
    host = os.getenv("SMTP_HOST")
    sender = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
    if not host or not sender:
        return False
    port = int(os.getenv("SMTP_PORT", "587"))
    message = EmailMessage()
    message["Subject"] = "SenseLoop 邮箱验证码"
    message["From"] = sender
    message["To"] = email
    message.set_content(f"你的 SenseLoop 登录验证码是：{code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略。")
    username = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            if os.getenv("SMTP_TLS", "true").lower() != "false":
                smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
        return True
    except Exception:
        return False


def list_profiles(session: Session) -> list[dict]:
    return [_profile_to_dict(profile) for profile in session.scalars(_profile_query().order_by(UserProfileTable.id)).all()]


def get_profile_by_type(session: Session, profile_type: str) -> dict | None:
    row = session.scalar(_profile_query().where(UserProfileTable.profile_type == profile_type))
    return _profile_to_dict(row) if row else None


def get_profile_by_id(session: Session, profile_id: str) -> dict | None:
    row = session.scalar(_profile_query().where(UserProfileTable.id == profile_id))
    return _profile_to_dict(row) if row else None


def get_signals_by_profile_type(session: Session, profile_type: str) -> dict | None:
    profile = session.scalar(select(UserProfileTable).where(UserProfileTable.profile_type == profile_type))
    if profile is None:
        return None
    return get_signals_by_profile_id(session, profile.id)


def get_signals_by_profile_id(session: Session, profile_id: str, signal_date: str | None = None) -> dict | None:
    statement = _day_query().where(DailySignalDayTable.profile_id == profile_id).order_by(DailySignalDayTable.signal_date.desc())
    if signal_date:
        statement = statement.where(DailySignalDayTable.signal_date == date.fromisoformat(signal_date))
    row = session.scalar(statement.limit(1))
    return _day_to_signals(row) if row else None


def create_observation(session: Session, profile_id: str, signal_date: str, payload: dict) -> dict:
    day = _get_or_create_day(session, profile_id, signal_date)
    row = SignalObservationTable(
        id=str(uuid4()),
        day_id=day.id,
        profile_id=profile_id,
        signal_type=payload["signalType"],
        value_json=payload["valueJson"],
        source=payload.get("source", "manual"),
        confidence=payload.get("confidence"),
        privacy_level=payload.get("privacyLevel", "normal"),
    )
    session.add(row)
    session.commit()
    return {
        "id": row.id,
        "signalType": row.signal_type,
        "valueJson": row.value_json,
        "source": row.source,
        "confidence": row.confidence,
        "privacyLevel": row.privacy_level,
    }


def list_observations(session: Session, profile_id: str, signal_date: str, signal_type: str | None = None) -> list[dict]:
    day = session.scalar(
        select(DailySignalDayTable).where(
            DailySignalDayTable.profile_id == profile_id,
            DailySignalDayTable.signal_date == date.fromisoformat(signal_date),
        )
    )
    if not day:
        return []
    statement = select(SignalObservationTable).where(SignalObservationTable.day_id == day.id)
    if signal_type:
        statement = statement.where(SignalObservationTable.signal_type == signal_type)
    return [
        {
            "id": row.id,
            "signalType": row.signal_type,
            "valueJson": row.value_json,
            "source": row.source,
            "confidence": row.confidence,
            "privacyLevel": row.privacy_level,
        }
        for row in session.scalars(statement.order_by(SignalObservationTable.signal_type)).all()
    ]


def create_knowledge_source(session: Session, payload: dict) -> dict:
    row = KnowledgeSourceTable(
        id=str(uuid4()),
        source_type=payload["sourceType"],
        title=payload["title"],
        author=payload.get("author"),
        source_uri=payload.get("sourceUri"),
        version=payload.get("version", "v1"),
        language=payload.get("language", "zh-CN"),
        extra_metadata=payload.get("metadata", {}),
    )
    session.add(row)
    session.commit()
    return _knowledge_source_to_dict(row)


def search_knowledge(session: Session, query: str, source_types: list[str], top_k: int) -> list[dict]:
    statement = select(KnowledgeChunkTable, KnowledgeSourceTable).join(
        KnowledgeSourceTable, KnowledgeChunkTable.source_id == KnowledgeSourceTable.id
    )
    if source_types:
        statement = statement.where(KnowledgeSourceTable.source_type.in_(source_types))
    rows = session.execute(statement).all()
    tokens = [token for token in {query, *query.replace("/", " ").replace("，", " ").split()} if token]
    ranked = []
    for chunk, source in rows:
        title = source.title or ""
        tags = " ".join(chunk.tags or [])
        content = chunk.content or ""
        score = 0
        for token in tokens:
            needle = token[:16]
            if not needle:
                continue
            if needle in title:
                score += 4
            if needle in tags:
                score += 3
            if needle in content:
                score += 1
        if score or not tokens:
            ranked.append((score, chunk, source))
    ranked.sort(key=lambda item: item[0], reverse=True)
    selected = ranked[:top_k] if ranked else [(0, chunk, source) for chunk, source in rows[:top_k]]
    return [
        {
            "chunkId": chunk.id,
            "sourceId": source.id,
            "title": source.title,
            "content": chunk.content,
            "score": float(score) if score else None,
            "safetyLevel": chunk.safety_level,
            "tags": chunk.tags,
        }
        for score, chunk, source in selected
    ]


def create_agent_session(session: Session, payload: dict) -> dict:
    row = AgentSessionTable(
        id=str(uuid4()),
        profile_id=payload["profileId"],
        session_type=payload["sessionType"],
        extra_metadata=payload.get("metadata", {}),
    )
    session.add(row)
    session.commit()
    return {"id": row.id, "profileId": row.profile_id, "sessionType": row.session_type, "status": row.status}


def get_agent_session(session: Session, session_id: str) -> dict | None:
    row = session.get(AgentSessionTable, session_id)
    if not row:
        return None
    return {
        "id": row.id,
        "profileId": row.profile_id,
        "sessionType": row.session_type,
        "status": row.status,
        "modelName": row.model_name,
        "metadata": row.extra_metadata,
    }


def add_agent_message(
    session: Session,
    session_id: str,
    message: str,
    *,
    assistant_message: str | None = None,
    model_name: str | None = None,
    metadata: dict | None = None,
) -> dict:
    session_row = session.get(AgentSessionTable, session_id)
    if session_row is None:
        return {
            "answer": "Agent 会话不存在。",
            "assistantMessage": "Agent 会话不存在。",
            "citations": [],
            "toolCalls": [{"toolName": "persist_agent_message", "status": "failed"}],
        }

    user_row = AgentMessageTable(
        id=str(uuid4()),
        session_id=session_id,
        role="user",
        content=message,
        extra_metadata=metadata or {},
    )
    session.add(user_row)

    if assistant_message:
        session.add(
            AgentMessageTable(
                id=str(uuid4()),
                session_id=session_id,
                role="assistant",
                content=assistant_message,
                extra_metadata={"model": model_name, **(metadata or {})},
            )
        )
        session_row.model_name = model_name

    session.commit()
    return {
        "answer": assistant_message or "Agent 会话已记录。RAG 检索和工具调用会在下一阶段接入。",
        "assistantMessage": assistant_message or "Agent 会话已记录。RAG 检索和工具调用会在下一阶段接入。",
        "citations": [],
        "toolCalls": [{"toolName": "persist_agent_message", "status": "succeeded"}],
        "model": model_name,
    }


def list_recent_agent_messages(session: Session, profile_id: str, limit: int = 12) -> list[dict]:
    rows = session.execute(
        select(AgentMessageTable, AgentSessionTable)
        .join(AgentSessionTable, AgentMessageTable.session_id == AgentSessionTable.id)
        .where(AgentSessionTable.profile_id == profile_id)
        .order_by(AgentMessageTable.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "role": message.role,
            "content": message.content,
            "sessionType": agent_session.session_type,
            "createdAt": message.created_at.isoformat() if message.created_at else None,
        }
        for message, agent_session in reversed(rows)
    ]


def get_agent_memory(session: Session, profile_id: str, memory_type: str = "rolling_7_day") -> dict | None:
    row = session.scalar(
        select(AgentMemoryTable).where(AgentMemoryTable.profile_id == profile_id, AgentMemoryTable.memory_type == memory_type)
    )
    if not row:
        return None
    return {
        "id": row.id,
        "profileId": row.profile_id,
        "memoryType": row.memory_type,
        "summary": row.summary,
        "sourceWindowDays": row.source_window_days,
        "metadata": row.extra_metadata,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


def upsert_agent_memory(
    session: Session,
    profile_id: str,
    summary: str,
    *,
    memory_type: str = "rolling_7_day",
    metadata: dict | None = None,
) -> dict:
    row = session.scalar(
        select(AgentMemoryTable).where(AgentMemoryTable.profile_id == profile_id, AgentMemoryTable.memory_type == memory_type)
    )
    if row is None:
        row = AgentMemoryTable(
            id=str(uuid4()),
            profile_id=profile_id,
            memory_type=memory_type,
            summary=summary,
            extra_metadata=metadata or {},
        )
        session.add(row)
    else:
        row.summary = summary
        row.extra_metadata = metadata or {}
    session.commit()
    return get_agent_memory(session, profile_id, memory_type) or {}


def create_health_document(session: Session, profile_id: str, payload: dict, summary: str | None = None) -> dict:
    day = _get_or_create_day(session, profile_id, payload.get("date")) if payload.get("date") else None
    row = HealthDocumentTable(
        id=str(uuid4()),
        profile_id=profile_id,
        day_id=day.id if day else None,
        document_type=payload.get("documentType", "health_report"),
        file_name=payload["fileName"],
        mime_type=payload.get("mimeType", "application/octet-stream"),
        byte_size=payload.get("byteSize", 0),
        user_description=payload.get("userDescription"),
        extracted_text=payload.get("extractedText"),
        ai_summary=summary,
        extra_metadata=payload.get("metadata", {}),
    )
    session.add(row)
    session.commit()
    return {
        "id": row.id,
        "profileId": row.profile_id,
        "documentType": row.document_type,
        "fileName": row.file_name,
        "mimeType": row.mime_type,
        "byteSize": row.byte_size,
        "mediaAssetId": (row.extra_metadata or {}).get("mediaAssetId"),
        "storageProvider": (row.extra_metadata or {}).get("storageProvider"),
        "storageKey": (row.extra_metadata or {}).get("storageKey"),
        "sha256": (row.extra_metadata or {}).get("sha256"),
        "userDescription": row.user_description,
        "extractedText": row.extracted_text,
        "summary": row.ai_summary,
        "privacyLevel": row.privacy_level,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def create_media_asset(session: Session, profile_id: str, payload: dict) -> dict:
    day = _get_or_create_day(session, profile_id, payload.get("date")) if payload.get("date") else None
    existing = session.scalar(select(MediaAssetTable).where(MediaAssetTable.sha256 == payload["sha256"]))
    if existing is None:
        existing = MediaAssetTable(
            id=str(uuid4()),
            profile_id=profile_id,
            day_id=day.id if day else None,
            media_type=payload.get("mediaType", "health_document"),
            storage_key=payload["storageKey"],
            mime_type=payload.get("mimeType", "application/octet-stream"),
            byte_size=payload.get("byteSize", 0),
            sha256=payload["sha256"],
            source=payload.get("source", "upload"),
            privacy_level=payload.get("privacyLevel", "high_sensitive"),
        )
        session.add(existing)
        session.commit()
    return {
        "id": existing.id,
        "profileId": existing.profile_id,
        "dayId": existing.day_id,
        "mediaType": existing.media_type,
        "storageKey": existing.storage_key,
        "mimeType": existing.mime_type,
        "byteSize": existing.byte_size,
        "sha256": existing.sha256,
        "source": existing.source,
        "privacyLevel": existing.privacy_level,
    }


def count_profiles(session: Session) -> int:
    return session.scalar(select(func.count(UserProfileTable.id))) or 0


def _seed_placeholder_knowledge(session: Session) -> None:
    for source in PLACEHOLDER_KNOWLEDGE:
        if session.get(KnowledgeSourceTable, source["id"]):
            continue
        source_row = KnowledgeSourceTable(
            id=source["id"],
            source_type=source["sourceType"],
            title=source["title"],
            author="SenseLoop v2",
            source_uri="docs/tasks/Task15-产品化缺口Review与下一阶段建议.md",
            version="v2",
            language="zh-CN",
            review_status="published",
            extra_metadata={"manualImport": True},
        )
        session.add(source_row)
        for index, chunk in enumerate(source["chunks"]):
            session.add(
                KnowledgeChunkTable(
                    id=f"{source['id']}-chunk-{index + 1}",
                    source_id=source["id"],
                    chunk_index=index,
                    content=chunk["content"],
                    summary=chunk["content"][:80],
                    tags=chunk.get("tags", []),
                    applies_to=["all"],
                    safety_level=chunk.get("safetyLevel", "normal"),
                    extra_metadata={"placeholder": True},
                )
            )


def _profile_query() -> Select:
    return select(UserProfileTable).options(selectinload(UserProfileTable.goals))


def _day_query() -> Select:
    return select(DailySignalDayTable).options(
        selectinload(DailySignalDayTable.sleep),
        selectinload(DailySignalDayTable.audio_events),
        selectinload(DailySignalDayTable.diet_records),
        selectinload(DailySignalDayTable.stool),
        selectinload(DailySignalDayTable.tongue),
        selectinload(DailySignalDayTable.breath),
        selectinload(DailySignalDayTable.vitals),
    )


def _insert_signals(session: Session, profile: UserProfileTable, signals: dict) -> None:
    day = DailySignalDayTable(
        id=f"day-{profile.id}-{signals['date']}",
        profile_id=profile.id,
        signal_date=date.fromisoformat(signals["date"]),
        source="mock",
    )
    session.add(day)
    sleep = signals["sleep"]
    session.add(
        SleepSignalTable(
            day=day,
            sleep_duration_hours=sleep["sleepDurationHours"],
            sleep_quality=sleep["sleepQuality"],
            wake_count=sleep["wakeCount"],
            user_sleep_feeling=sleep["userSleepFeeling"],
        )
    )
    for event in signals["audioEvents"]:
        session.add(
            SleepAudioEventTable(
                id=f"{profile.id}-{event['id']}",
                day=day,
                type=event["type"],
                start_minute=event["startMinute"],
                duration_sec=event["durationSec"],
                intensity=event["intensity"],
                confidence=event["confidence"],
                source=event["source"],
                note=event.get("note"),
                raw_payload=event,
            )
        )
    for item in signals["diet"]:
        session.add(
            DietRecordTable(
                id=f"{profile.id}-{item['id']}",
                day=day,
                meal_type=item["mealType"],
                food_name=item["foodName"],
                food_tags=item["foodTags"],
                portion=item["portion"],
                estimated_kcal=item["estimatedKcal"],
                user_adjusted_kcal=item.get("userAdjustedKcal"),
                confidence=item["confidence"],
                source=item["source"],
                raw_payload=item,
            )
        )
    stool = signals["stool"]
    session.add(
        StoolRecordTable(
            day=day,
            recorded=stool["recorded"],
            shape=stool.get("shape"),
            color=stool.get("color"),
            dryness=stool.get("dryness"),
            frequency_today=stool.get("frequencyToday"),
            source=stool["source"],
        )
    )
    tongue = signals["tongue"]
    session.add(
        TongueRecordTable(
            day=day,
            recorded=tongue["recorded"],
            tongue_color=tongue.get("tongueColor"),
            coating_thickness=tongue.get("coatingThickness"),
            moisture=tongue.get("moisture"),
            marks=tongue.get("marks", []),
            photo_quality=tongue.get("photoQuality"),
            source=tongue["source"],
        )
    )
    breath = signals["breath"]
    session.add(
        BreathRecordTable(
            day=day,
            level=breath["level"],
            dry_mouth=breath["dryMouth"],
            bitter_taste=breath["bitterTaste"],
            source=breath["source"],
        )
    )
    vitals = signals["vitals"]
    session.add(
        VitalRecordTable(
            day=day,
            heart_rate_resting=vitals.get("heartRateResting"),
            steps=vitals.get("steps"),
            exercise_minutes=vitals.get("exerciseMinutes"),
            source=vitals["source"],
            raw_payload=vitals,
        )
    )


def _get_or_create_day(session: Session, profile_id: str, signal_date: str) -> DailySignalDayTable:
    parsed = date.fromisoformat(signal_date)
    day = session.scalar(select(DailySignalDayTable).where(DailySignalDayTable.profile_id == profile_id, DailySignalDayTable.signal_date == parsed))
    if day:
        return day
    day = DailySignalDayTable(id=str(uuid4()), profile_id=profile_id, signal_date=parsed, source="manual")
    session.add(day)
    session.flush()
    return day


def _profile_to_dict(profile: UserProfileTable) -> dict:
    return {
        "id": profile.id,
        "name": profile.name,
        "profileType": profile.profile_type,
        "age": profile.age,
        "gender": profile.gender,
        "occupation": profile.occupation,
        "goals": [goal.goal for goal in profile.goals],
        "habits": {
            "coffee": profile.coffee,
            "lateNightSnack": profile.late_night_snack,
            "sedentaryHours": profile.sedentary_hours,
            "exerciseFrequency": profile.exercise_frequency,
            "sleepProblem": profile.sleep_problem,
        },
    }


def _day_to_signals(day: DailySignalDayTable) -> dict:
    return {
        "date": day.signal_date.isoformat(),
        "profileId": day.profile_id,
        "sleep": {
            "sleepDurationHours": day.sleep.sleep_duration_hours,
            "sleepQuality": day.sleep.sleep_quality,
            "wakeCount": day.sleep.wake_count,
            "userSleepFeeling": day.sleep.user_sleep_feeling,
        },
        "audioEvents": [
            {
                "id": event.id,
                "type": event.type,
                "startMinute": event.start_minute,
                "durationSec": event.duration_sec,
                "intensity": event.intensity,
                "confidence": event.confidence,
                "source": event.source,
                **({"note": event.note} if event.note else {}),
            }
            for event in sorted(day.audio_events, key=lambda item: item.start_minute)
        ],
        "diet": [
            {
                "id": item.id,
                "mealType": item.meal_type,
                "foodName": item.food_name,
                "foodTags": item.food_tags,
                "portion": item.portion,
                "estimatedKcal": item.estimated_kcal,
                **({"userAdjustedKcal": item.user_adjusted_kcal} if item.user_adjusted_kcal is not None else {}),
                "confidence": item.confidence,
                "source": item.source,
            }
            for item in day.diet_records
        ],
        "stool": {
            "recorded": day.stool.recorded,
            **({"shape": day.stool.shape} if day.stool.shape else {}),
            **({"color": day.stool.color} if day.stool.color else {}),
            **({"dryness": day.stool.dryness} if day.stool.dryness else {}),
            **({"frequencyToday": day.stool.frequency_today} if day.stool.frequency_today is not None else {}),
            "source": day.stool.source,
        },
        "tongue": {
            "recorded": day.tongue.recorded,
            **({"tongueColor": day.tongue.tongue_color} if day.tongue.tongue_color else {}),
            **({"coatingThickness": day.tongue.coating_thickness} if day.tongue.coating_thickness else {}),
            **({"moisture": day.tongue.moisture} if day.tongue.moisture else {}),
            **({"marks": day.tongue.marks} if day.tongue.marks else {}),
            **({"photoQuality": day.tongue.photo_quality} if day.tongue.photo_quality else {}),
            "source": day.tongue.source,
        },
        "breath": {
            "level": day.breath.level,
            "dryMouth": day.breath.dry_mouth,
            "bitterTaste": day.breath.bitter_taste,
            "source": day.breath.source,
        },
        "vitals": {
            **({"heartRateResting": day.vitals.heart_rate_resting} if day.vitals.heart_rate_resting is not None else {}),
            **({"steps": day.vitals.steps} if day.vitals.steps is not None else {}),
            **({"exerciseMinutes": day.vitals.exercise_minutes} if day.vitals.exercise_minutes is not None else {}),
            "source": day.vitals.source,
        },
    }


def _knowledge_source_to_dict(row: KnowledgeSourceTable) -> dict:
    return {
        "id": row.id,
        "sourceType": row.source_type,
        "title": row.title,
        "author": row.author,
        "sourceUri": row.source_uri,
        "version": row.version,
        "language": row.language,
        "reviewStatus": row.review_status,
        "metadata": row.extra_metadata,
    }
