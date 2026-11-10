-- JARVIS NEXUS — Production PostgreSQL + pgvector Migration Baseline
-- Compatible with PostgreSQL 15+ (with optional pgvector extension)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS nexus_world_state (
    id INTEGER PRIMARY KEY,
    owner_name VARCHAR(120) NOT NULL DEFAULT 'Owner',
    first_launch_completed BOOLEAN NOT NULL DEFAULT FALSE,
    active_mode VARCHAR(64) NOT NULL DEFAULT 'living_presence',
    current_zone VARCHAR(64) NOT NULL DEFAULT 'central_operations',
    pos_x DOUBLE PRECISION NOT NULL DEFAULT 1.35,
    pos_y DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    pos_z DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    yaw_rad DOUBLE PRECISION NOT NULL DEFAULT -0.45,
    locomotion_state VARCHAR(40) NOT NULL DEFAULT 'idle_console_work',
    posture VARCHAR(40) NOT NULL DEFAULT 'focused_standing',
    emotional_state VARCHAR(40) NOT NULL DEFAULT 'focused',
    active_activity_summary TEXT NOT NULL DEFAULT 'Reviewing primary systems assembly at Central Operations.',
    interrupted_task_stack_json TEXT NOT NULL DEFAULT '[]',
    active_camera_preset VARCHAR(64) NOT NULL DEFAULT 'living_presence',
    reduced_motion BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owner_switches (
    switch_key VARCHAR(40) PRIMARY KEY,
    label VARCHAR(80) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT NOT NULL,
    enforcement_scope TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_records (
    id VARCHAR(36) PRIMARY KEY,
    category VARCHAR(40) NOT NULL,
    epistemic_status VARCHAR(32) NOT NULL DEFAULT 'owner_stated',
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    encrypted_payload TEXT,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    source_ref TEXT,
    project_tag VARCHAR(100),
    embedding_json TEXT,
    -- In PostgreSQL with pgvector: ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS embedding vector(384);
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(24) NOT NULL,
    modality VARCHAR(24) NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    media_ref TEXT,
    interrupted BOOLEAN NOT NULL DEFAULT FALSE,
    inference_source VARCHAR(64) NOT NULL DEFAULT 'executive_offline',
    emotional_tone VARCHAR(32) NOT NULL DEFAULT 'attentive',
    target_zone VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goals (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 2,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    progress INTEGER NOT NULL DEFAULT 0,
    depends_on_json TEXT NOT NULL DEFAULT '[]',
    schedule_spec VARCHAR(100) NOT NULL DEFAULT 'continuous',
    assigned_zone VARCHAR(64) NOT NULL DEFAULT 'goals_projects',
    autonomous_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    next_action TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goal_audit_events (
    id VARCHAR(36) PRIMARY KEY,
    goal_id VARCHAR(36) NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    detail TEXT NOT NULL,
    actor VARCHAR(64) NOT NULL DEFAULT 'JARVIS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS specialist_agents (
    id VARCHAR(48) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role_summary TEXT NOT NULL,
    allowed_tools_json TEXT NOT NULL,
    permission_boundary TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'idle',
    current_task TEXT,
    last_output TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id VARCHAR(36) PRIMARY KEY,
    agent_id VARCHAR(48) NOT NULL REFERENCES specialist_agents(id),
    objective TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    trace_json TEXT NOT NULL DEFAULT '[]',
    result_summary TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS tool_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    tool_name VARCHAR(80) NOT NULL,
    scope VARCHAR(48) NOT NULL,
    arguments_json TEXT NOT NULL,
    destructive BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL,
    confirmation_token VARCHAR(64),
    output_excerpt TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kaggle_profiles (
    id VARCHAR(36) PRIMARY KEY,
    slot_index INTEGER NOT NULL,
    profile_name VARCHAR(100) NOT NULL,
    masked_username VARCHAR(80) NOT NULL DEFAULT 'unconfigured',
    masked_key VARCHAR(80) NOT NULL DEFAULT 'unconfigured',
    encrypted_credentials TEXT,
    preferred_model VARCHAR(160) NOT NULL DEFAULT 'huihui-ai/Qwen2.5-14B-Instruct-abliterated',
    gpu_accelerator VARCHAR(64) NOT NULL DEFAULT 'NvidiaTeslaT4x2',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    last_auth_status VARCHAR(48) NOT NULL DEFAULT 'untested',
    last_auth_detail TEXT NOT NULL DEFAULT 'Credentials not yet tested.',
    last_tested_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenarios (
    id VARCHAR(48) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    classification VARCHAR(48) NOT NULL,
    summary TEXT NOT NULL,
    duration_sec DOUBLE PRECISION NOT NULL DEFAULT 16.0,
    variables_json TEXT NOT NULL,
    branches_json TEXT NOT NULL,
    timeline_json TEXT NOT NULL,
    actors_props_json TEXT NOT NULL,
    evidence_notes_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_items (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    media_type VARCHAR(32) NOT NULL DEFAULT 'video',
    source_kind VARCHAR(40) NOT NULL DEFAULT 'owner_import',
    file_path TEXT NOT NULL,
    mime_type VARCHAR(80) NOT NULL DEFAULT 'video/mp4',
    duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    captions_vtt TEXT,
    linked_project VARCHAR(100),
    linked_scenario_id VARCHAR(48),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_commentaries (
    id VARCHAR(36) PRIMARY KEY,
    media_id VARCHAR(36) NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    timestamp_sec DOUBLE PRECISION NOT NULL,
    label VARCHAR(140) NOT NULL,
    analysis TEXT NOT NULL,
    spawn_scenario_id VARCHAR(48),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_events (
    id VARCHAR(36) PRIMARY KEY,
    severity VARCHAR(24) NOT NULL DEFAULT 'info',
    category VARCHAR(48) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(80) NOT NULL DEFAULT 'CORE',
    resolved BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
