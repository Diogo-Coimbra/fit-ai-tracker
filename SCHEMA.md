# 🗄️ Database Architecture

This document outlines the core relational database schema for the Fit AI Tracker. The database is designed for **PostgreSQL**, focusing on robust data integrity and efficient time-series querying for analytics.

## Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o{ WEIGHT_LOGS : "tracks"
    USERS ||--o{ WORKOUTS : "performs"
    WORKOUTS ||--o{ WORKOUT_LOGS : "contains"
    EXERCISES ||--o{ WORKOUT_LOGS : "is logged in"
    EQUIPMENT ||--o{ EXERCISES : "requires"

    USERS {
        uuid id PK
        string email
        string name
        string google_id
        datetime created_at
    }

    WEIGHT_LOGS {
        uuid id PK
        uuid user_id FK
        float weight
        date logged_date
    }

    EQUIPMENT {
        uuid id PK
        string name
        string target_muscle_group
    }

    EXERCISES {
        uuid id PK
        string name
        uuid equipment_id FK
        string target_muscle
    }

    WORKOUTS {
        uuid id PK
        uuid user_id FK
        datetime date
        boolean is_ai_generated
    }

    WORKOUT_LOGS {
        uuid id PK
        uuid workout_id FK
        uuid exercise_id FK
        int sets
        int reps
        float weight_used
    }
```

## Core Tables Description

* **USERS:** Core identity table. Authentication is handled via OAuth (Google), so no passwords are stored.
* **WEIGHT_LOGS:** Time-series data table for tracking user body weight over time to power analytics dashboards.
* **EQUIPMENT & EXERCISES:** The knowledge base. Equipment is strictly mapped to Exercises to allow the AI to filter workout generation based on real-world availability.
* **WORKOUTS & WORKOUT_LOGS:** Transactional tables. A workout acts as a session container, while logs store the granular data (sets, reps, weight) for progressive overload tracking.