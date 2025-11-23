-- Создание базы данных и таблиц для информационной системы приемной комиссии

-- Таблица специальностей
CREATE TABLE IF NOT EXISTS specialties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    seats_count INTEGER NOT NULL
);

-- Таблица предметов
CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

-- Таблица связи специальностей и предметов
CREATE TABLE IF NOT EXISTS specialty_subjects (
    specialty_id INTEGER NOT NULL REFERENCES specialties (id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    PRIMARY KEY (specialty_id, subject_id)
);

-- Таблица преподавателей и сотрудников
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    middle_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255) NOT NULL,
    is_teacher BOOLEAN NOT NULL DEFAULT FALSE,
    is_secretary BOOLEAN NOT NULL DEFAULT FALSE
);

-- Таблица абитуриентов
CREATE TABLE IF NOT EXISTS applicants (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    middle_name VARCHAR(255),
    birth_date DATE NOT NULL,
    passport_data VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255) NOT NULL,
    application_date DATE NOT NULL,
    specialty_id INTEGER NOT NULL REFERENCES specialties (id),
    status VARCHAR(50) NOT NULL DEFAULT 'registered' CHECK (
        status IN (
            'registered',
            'admitted',
            'rejected'
        )
    )
);

-- Таблица экзаменационных групп
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects (id),
    exam_date TIMESTAMP NOT NULL,
    room_number VARCHAR(50)
);

-- Таблица связи абитуриентов и групп
CREATE TABLE IF NOT EXISTS group_applicants (
    group_id INTEGER NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    applicant_id INTEGER NOT NULL REFERENCES applicants (id) ON DELETE CASCADE,
    score INTEGER CHECK (
        score >= 0
        AND score <= 100
    ),
    PRIMARY KEY (group_id, applicant_id)
);

-- Таблица связи преподавателей и групп
CREATE TABLE IF NOT EXISTS group_teachers (
    group_id INTEGER NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, teacher_id)
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants (email);

CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants (status);

CREATE INDEX IF NOT EXISTS idx_applicants_specialty ON applicants (specialty_id);

CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers (email);

CREATE INDEX IF NOT EXISTS idx_groups_exam_date ON groups (exam_date);

CREATE INDEX IF NOT EXISTS idx_group_applicants_applicant ON group_applicants (applicant_id);

CREATE INDEX IF NOT EXISTS idx_group_applicants_group ON group_applicants (group_id);